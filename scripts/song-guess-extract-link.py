"""Extract one teacher-selected YouTube clip. Parent owns the temp dir/180s timeout.

Requires yt-dlp and ffmpeg on PATH. Uses a bounded HTTPS audio download, then
local decoding. Long sources exceeding the byte/time budget fail for correction.
"""
import argparse
import contextlib
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave

MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
DOWNLOAD_SECONDS = 120
SAMPLE_RATE = 44100
PCM_BYTES = SAMPLE_RATE * 15 * 2


class ExtractionError(Exception):
    pass


class SilentLogger:
    def debug(self, *_args, **_kwargs):
        pass

    info = warning = error = debug


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message):
        # argparse's default errors echo arbitrary arguments/paths.
        raise ExtractionError("invalid_arguments")


def validate_request(video_id, start_seconds, output):
    if not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ExtractionError("invalid_arguments")
    if type(start_seconds) is not int or not 0 <= start_seconds <= 86400:
        raise ExtractionError("invalid_arguments")
    # Caller allocates the directory and supplies an absolute, new output path.
    # No directory creation, overwrite, symlink traversal or user URL filenames.
    target = Path(output)
    if (not target.is_absolute() or ".." in target.parts or target.suffix.lower() != ".wav"
            or target.is_symlink() or target.exists() or not target.parent.is_dir()
            or any(parent.is_symlink() for parent in target.parents)):
        raise ExtractionError("invalid_output")
    return target


def clean_name(value):
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if not value or len(value) > 200 or any(ord(c) < 32 or ord(c) == 127 for c in value):
        return ""
    return value


def metadata_names(info):
    title = clean_name(info.get("track"))
    credits = info.get("artist")
    description = info.get("description")
    if (isinstance(description, str) and description.startswith("Provided to YouTube by ")
            and isinstance(credits, str)):
        # Count raw credits before deduplication: repeated singers can accompany
        # flattened composer/arranger roles. Normalize before the 200-char limit.
        names = [name.strip() for name in credits.split(",") if name.strip()]
        if len(names) > 2:
            performers = [names[0]]
            feature = re.search(r"\b(?:feat\.?|ft\.?|with)\s+([^)]*)", title, re.I)
            if feature:
                featured = re.split(r"\bprod(?:uced)?\b", feature[1], maxsplit=1, flags=re.I)[0]
                for name in names[1:]:
                    if (re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", featured, re.I)
                            and name.casefold() not in {item.casefold() for item in performers}):
                        performers.append(name)
            credits = ", ".join(performers)
        else:
            credits = ", ".join(dict.fromkeys(names))
    artist = clean_name(credits)
    if title or artist:
        return title, artist
    label = clean_name(info.get("title"))
    # Only an undecorated single Artist - Title pair. Never use uploader/composer.
    parts = label.split(" - ")
    if len(parts) != 2 or not all(clean_name(part) for part in parts):
        return "", ""
    if re.search(r"[\[\]()|/#]|https?:|\b(official|lyrics?|video|playlist|mix|cover|live)\b", label, re.I):
        return "", ""
    return parts[1].strip(), parts[0].strip()


def download_audio(video_id, start_seconds, work_dir, ydl_factory=None):
    if ydl_factory is None:
        from yt_dlp import YoutubeDL
        ydl_factory = YoutubeDL
    deadline = time.monotonic() + DOWNLOAD_SECONDS

    def guard(status):
        if time.monotonic() > deadline:
            raise ExtractionError("download_timeout")
        if any((status.get(key) or 0) > MAX_DOWNLOAD_BYTES
               for key in ("downloaded_bytes", "total_bytes")):
            raise ExtractionError("download_too_large")

    def filter_video(info, *, incomplete=False):
        if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
            return "unsupported_source"
        duration = info.get("duration")
        if duration is not None and (not isinstance(duration, (int, float))
                                     or not math.isfinite(duration) or duration < start_seconds + 15):
            return "insufficient_audio"
        return None

    options = {
        "format": "bestaudio[protocol=https][ext=m4a]/bestaudio[protocol=https]",
        "outtmpl": str(work_dir / "source.%(ext)s"),
        "noplaylist": True, "cachedir": False,
        "quiet": True, "no_warnings": True, "noprogress": True, "logger": SilentLogger(),
        "socket_timeout": 10, "retries": 1, "fragment_retries": 0, "extractor_retries": 1,
        "file_access_retries": 0, "max_filesize": MAX_DOWNLOAD_BYTES,
        "buffersize": 64 * 1024, "noresizebuffer": True,
        "http_chunk_size": 1024 * 1024, "concurrent_fragment_downloads": 1,
        "progress_hooks": [guard], "match_filter": filter_video,
        "nocheckcertificate": False, "prefer_insecure": False,
        "compat_opts": {"no-certifi"}, "usenetrc": False,
        "cookiefile": None, "cookiesfrombrowser": None,
        "overwrites": False, "continuedl": False,
    }
    # API construction does not read yt-dlp's command-line config files.
    with ydl_factory(options) as client:
        info = client.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        guard({})
        if not isinstance(info, dict) or info.get("id") != video_id or info.get("_type", "video") != "video":
            raise ExtractionError("unsupported_source")
        if filter_video(info):
            raise ExtractionError("unsupported_source")
        source = Path(client.prepare_filename(info))
    if (source.is_symlink() or source.resolve().parent != work_dir.resolve()
            or not source.is_file() or not 0 < source.stat().st_size <= MAX_DOWNLOAD_BYTES):
        raise ExtractionError("invalid_download")
    return source, info


def decode_pcm(source, start_seconds, work_dir):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ExtractionError("ffmpeg_unavailable")
    pcm = work_dir / "clip.pcm"
    subprocess.run([
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
        "-protocol_whitelist", "file", "-ss", str(start_seconds), "-i", str(source),
        "-map", "0:a:0", "-vn", "-sn", "-dn", "-t", "15",
        "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le",
        "-threads", "1", "-f", "s16le", "-fs", str(PCM_BYTES + 2), str(pcm),
    ], shell=False, check=True, timeout=40, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not pcm.is_file() or pcm.stat().st_size != PCM_BYTES:
        raise ExtractionError("insufficient_audio")
    return pcm.read_bytes()


def extract_clip(video_id, start_seconds, output):
    target = validate_request(video_id, start_seconds, output)
    with tempfile.TemporaryDirectory(prefix="extract-", dir=target.parent) as temp:
        work_dir = Path(temp)
        source, info = download_audio(video_id, start_seconds, work_dir)
        pcm = decode_pcm(source, start_seconds, work_dir)
        # Python wave emits a deterministic 44-byte PCM header, no source tags.
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(pcm)
        audio = buffer.getvalue()
        title, artist = metadata_names(info)
        with target.open("xb") as stream:
            stream.write(audio)
    return {
        "title": title, "artist": artist,
        "sourceUrl": f"https://www.youtube.com/watch?v={video_id}&t={start_seconds}",
        "videoId": video_id, "startSeconds": start_seconds, "durationMs": 15000,
        "mimeType": "audio/wav", "sha256": hashlib.sha256(audio).hexdigest(),
        "sizeBytes": len(audio),
    }


def main(argv=None):
    parser = SafeArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--start-seconds", required=True)
    parser.add_argument("--output", required=True)
    try:
        args = parser.parse_args(argv)
        if not re.fullmatch(r"[0-9]{1,5}", args.start_seconds):
            raise ExtractionError("invalid_arguments")
        # Libraries must never pollute the one-record stdout protocol or leak URLs.
        with open(os.devnull, "w") as sink:
            with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                result = extract_clip(args.video_id, int(args.start_seconds), args.output)
        print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
        return 0
    except Exception:
        # Do not echo third-party exceptions, signed media URLs or filesystem paths.
        print("song_guess_link_extraction_failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
