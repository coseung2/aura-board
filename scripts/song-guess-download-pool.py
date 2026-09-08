"""Download catalogued YouTube clips into exact 15-second WAV assets.

The catalog is read-only input.  This script writes audio files below the
configured clip root and a delta manifest that a later catalog/database import
can review.  It deliberately records unavailable videos as failures rather
than inventing a playable fallback.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import wave
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

# Use Windows' native certificate store before yt-dlp creates its HTTPS
# clients. This keeps hostname verification and revocation checks enabled while
# avoiding OpenSSL-only failures for the corporate inspection chain.
try:
    import truststore  # type: ignore

    truststore.inject_into_ssl()
except ImportError:
    truststore = None  # type: ignore[assignment]

import yt_dlp


SAMPLE_RATE = 44_100
DURATION_SECONDS = 15
FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS
MAX_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


@dataclass(frozen=True)
class ClipEntry:
    song_id: str
    segment: str
    video_id: str
    start_seconds: int
    title: str
    artist: str
    categories: tuple[str, ...]

    @property
    def key(self) -> str:
        return f"{self.song_id}:{self.segment}:{self.video_id}:{self.start_seconds}"

    @property
    def relative_file(self) -> str:
        return f"clips/{self.song_id}/{self.segment}.wav"


@dataclass
class Result:
    key: str
    song_id: str
    segment: str
    video_id: str
    start_seconds: int
    file: str
    status: str
    title: str
    artist: str
    categories: list[str]
    error: str | None = None
    sha256: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=Path("data/song-guess/catalog.json"))
    parser.add_argument("--output-root", type=Path, default=Path("data/song-guess"))
    parser.add_argument(
        "--manifest-out",
        type=Path,
        default=Path(".codex/artifacts/song-guess-kpop/nonclassical-audio-manifest.json"),
    )
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--ffmpeg", type=Path, default=None)
    parser.add_argument("--temp-root", type=Path, default=None)
    return parser.parse_args()


def load_entries(catalog_path: Path) -> list[ClipEntry]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    entries: list[ClipEntry] = []
    seen: set[str] = set()
    for song in catalog.get("songs", []):
        categories = tuple(song.get("categories", []))
        if "classical" in categories:
            continue
        clips = song.get("clips", {})
        for segment, clip in clips.items():
            if not isinstance(clip, dict) or "videoId" not in clip:
                continue
            video_id = str(clip["videoId"])
            start = clip.get("startSeconds")
            if not MAX_VIDEO_ID.fullmatch(video_id):
                entries.append(
                    ClipEntry(
                        str(song["id"]), str(segment), video_id, -1,
                        str(song.get("title", "")), str(song.get("artist", "")), categories,
                    )
                )
                continue
            if not isinstance(start, int) or start < 0:
                continue
            entry = ClipEntry(
                str(song["id"]), str(segment), video_id, start,
                str(song.get("title", "")), str(song.get("artist", "")), categories,
            )
            if entry.key not in seen:
                entries.append(entry)
                seen.add(entry.key)
    return entries


def find_ffmpeg(explicit: Path | None) -> Path:
    candidates = [
        explicit,
        Path(shutil.which("ffmpeg") or ""),
        Path.cwd() / "node_modules" / "ffmpeg-static" / "ffmpeg.exe",
    ]
    try:
        import imageio_ffmpeg  # type: ignore

        candidates.append(Path(imageio_ffmpeg.get_ffmpeg_exe()))
    except Exception:
        pass
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    raise RuntimeError("ffmpeg_not_found")


def output_path(root: Path, entry: ClipEntry) -> Path:
    root_resolved = root.resolve()
    target = (root_resolved / entry.relative_file).resolve()
    if root_resolved not in target.parents:
        raise ValueError("unsafe_output_path")
    return target


def valid_wav(path: Path) -> bool:
    try:
        with wave.open(str(path), "rb") as source:
            return (
                source.getnchannels() == 1
                and source.getsampwidth() == 2
                and source.getframerate() == SAMPLE_RATE
                and source.getnframes() == FRAME_COUNT
            )
    except (OSError, wave.Error):
        return False


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def error_text(error: BaseException) -> str:
    text = str(error).replace("\r", " ").replace("\n", " ").strip()
    return text[:500] or type(error).__name__


def source_for_video(video_id: str, temp_root: Path) -> Path:
    directory = temp_root / video_id
    directory.mkdir(parents=True, exist_ok=True)
    existing = [
        path
        for path in directory.glob("source.*")
        if path.is_file() and path.suffix.lower() in {".webm", ".m4a", ".mp4", ".opus", ".mkv"}
    ]
    if existing:
        return existing[0]
    options: dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": str(directory / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 3,
        "socket_timeout": 30,
        "continuedl": True,
        "overwrites": False,
    }
    ca_bundle = os.environ.get("SSL_CERT_FILE", "").strip()
    if ca_bundle and Path(ca_bundle).is_file():
        options["ca_certs"] = ca_bundle
    with yt_dlp.YoutubeDL(options) as downloader:
        downloader.download([f"https://www.youtube.com/watch?v={video_id}"])
    downloaded = [
        path
        for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in {".webm", ".m4a", ".mp4", ".opus", ".mkv"}
    ]
    if not downloaded:
        raise RuntimeError("yt_dlp_empty_download")
    return downloaded[0]


def extract(entry: ClipEntry, root: Path, ffmpeg: Path, temp_root: Path, source: Path | None = None) -> Result:
    base = dict(
        key=entry.key,
        song_id=entry.song_id,
        segment=entry.segment,
        video_id=entry.video_id,
        start_seconds=entry.start_seconds,
        file=entry.relative_file,
        title=entry.title,
        artist=entry.artist,
        categories=list(entry.categories),
    )
    try:
        target = output_path(root, entry)
    except ValueError as error:
        return Result(**base, status="failure", error=str(error))
    if not MAX_VIDEO_ID.fullmatch(entry.video_id) or entry.start_seconds < 0:
        return Result(**base, status="failure", error="invalid_video_metadata")
    if valid_wav(target):
        return Result(**base, status="skipped_existing", sha256=file_hash(target))
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".partial.wav")
    try:
        source = source or source_for_video(entry.video_id, temp_root)
        command = [
            str(ffmpeg), "-hide_banner", "-loglevel", "error", "-ss", str(entry.start_seconds),
            "-i", str(source), "-t", str(DURATION_SECONDS), "-vn", "-af",
            "aresample=async=1:first_pts=0,atrim=duration=15", "-ac", "1", "-ar", str(SAMPLE_RATE),
            "-sample_fmt", "s16", "-c:a", "pcm_s16le", "-y", str(temporary),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=90, check=False)
        if completed.returncode != 0:
            raise RuntimeError(f"ffmpeg_exit_{completed.returncode}: {completed.stderr.strip()[-300:]}")
        if not valid_wav(temporary):
            raise RuntimeError("invalid_15s_mono_44100_pcm16_output")
        temporary.replace(target)
        return Result(**base, status="success", sha256=file_hash(target))
    except Exception as error:  # one unavailable song must not stop the pool
        temporary.unlink(missing_ok=True)
        return Result(**base, status="failure", error=error_text(error))


def extract_group(
    group: list[ClipEntry], root: Path, ffmpeg: Path, temp_root: Path
) -> list[Result]:
    if not group:
        return []
    try:
        source = source_for_video(group[0].video_id, temp_root)
    except Exception as error:
        failure = error_text(error)
        return [failure_result(entry, failure) for entry in group]
    rendered: dict[int, Path] = {}
    results: list[Result] = []
    for entry in group:
        cached = rendered.get(entry.start_seconds)
        if cached and valid_wav(cached):
            target = output_path(root, entry)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(cached, target)
            results.append(
                Result(
                    key=entry.key,
                    song_id=entry.song_id,
                    segment=entry.segment,
                    video_id=entry.video_id,
                    start_seconds=entry.start_seconds,
                    file=entry.relative_file,
                    status="success_reused",
                    title=entry.title,
                    artist=entry.artist,
                    categories=list(entry.categories),
                    sha256=file_hash(target),
                )
            )
            continue
        result = extract(entry, root, ffmpeg, temp_root, source=source)
        if result.status in {"success", "success_reused", "skipped_existing"}:
            rendered[entry.start_seconds] = output_path(root, entry)
        results.append(result)
    return results


def failure_result(entry: ClipEntry, error: str) -> Result:
    return Result(
        key=entry.key,
        song_id=entry.song_id,
        segment=entry.segment,
        video_id=entry.video_id,
        start_seconds=entry.start_seconds,
        file=entry.relative_file,
        status="failure",
        title=entry.title,
        artist=entry.artist,
        categories=list(entry.categories),
        error=error,
    )


def load_previous(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return {str(item["key"]): item for item in payload.get("entries", []) if "key" in item}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def write_manifest(path: Path, entries: Iterable[Result], total: int) -> None:
    rows = [asdict(item) for item in sorted(entries, key=lambda item: item.key)]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "totalEntries": total,
                "attemptedEntries": len(rows),
                "successes": sum(row["status"] in {"success", "success_reused", "skipped_existing"} for row in rows),
                "failures": sum(row["status"] == "failure" for row in rows),
                "entries": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    if args.workers < 1 or args.workers > 8:
        raise SystemExit("--workers must be between 1 and 8")
    ffmpeg = find_ffmpeg(args.ffmpeg)
    entries = load_entries(args.catalog)
    if args.limit:
        entries = entries[: args.limit]
    previous = load_previous(args.manifest_out)
    results: dict[str, Result] = {}
    for entry in entries:
        prior = previous.get(entry.key)
        if prior:
            try:
                results[entry.key] = Result(**prior)
            except TypeError:
                pass
    pending = [entry for entry in entries if entry.key not in results]
    groups: dict[str, list[ClipEntry]] = {}
    for entry in pending:
        groups.setdefault(entry.video_id, []).append(entry)
    temp_root = args.temp_root or Path(tempfile.gettempdir()) / "aura-song-guess-downloads"
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(extract_group, group, args.output_root, ffmpeg, temp_root): group
            for group in groups.values()
        }
        for future in concurrent.futures.as_completed(futures):
            for result in future.result():
                results[result.key] = result
                print(f"{result.status}: {result.song_id}/{result.segment} {result.video_id}@{result.start_seconds}")
                write_manifest(args.manifest_out, results.values(), len(entries))
    write_manifest(args.manifest_out, results.values(), len(entries))
    print(f"attempted={len(results)} successes={sum(item.status in {'success', 'success_reused', 'skipped_existing'} for item in results.values())} failures={sum(item.status == 'failure' for item in results.values())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
