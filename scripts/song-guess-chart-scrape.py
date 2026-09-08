"""Collect YouTube chart metadata only; never download audio or infer composers/ranks."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIME = re.compile(r"(?<!\d)(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?!\d)")


def clean(value):
    return " ".join(re.sub(r"[\u200b-\u200d\ufeff]", "", unicodedata.normalize("NFKC", str(value or ""))).split())


def identity(artist, title):
    return json.dumps([clean(artist).casefold(), clean(title).casefold()], ensure_ascii=False)


def parse_video(info, catalog, order="artist-title", chart_date=None):
    video_id = info.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("invalid_video_id")
    url = f"https://www.youtube.com/watch?v={video_id}"
    index = {}
    for song in catalog:
        for title in [song["title"], *song.get("aliases", [])]:
            index.setdefault(identity(song["artist"], title), {})[song["id"]] = song
    source = {
        "videoId": video_id, "url": url, "title": clean(info.get("title")),
        "uploadDate": info.get("upload_date"), "chartDate": chart_date,
        "chartAuthority": "unverified-uploader", "channelId": info.get("channel_id"),
    }
    review, observations, songs = [], [], {}
    rows = []
    chapters = info.get("chapters") or []
    if chapters:
        rows = [(chapter.get("start_time"), clean(chapter.get("title")), chapter.get("end_time")) for chapter in chapters]
    else:
        for line in (info.get("description") or "").splitlines():
            stamp = TIME.search(line)
            if not stamp:
                continue
            hours, minutes, seconds = stamp.groups()
            if int(seconds) >= 60 or (hours and int(minutes) >= 60):
                review.append({"reason": "invalid_timestamp", "text": clean(line)})
                continue
            start = int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds)
            text = clean(line[:stamp.start()] + " " + line[stamp.end():]).strip(" []()|·")
            rows.append((start, text, None))
    rows.sort(key=lambda row: row[0] if isinstance(row[0], (int, float)) else -1)
    starts = set()
    for position, (start, text, end) in enumerate(rows):
        if not isinstance(start, (int, float)) or start < 0 or start in starts:
            review.append({"reason": "invalid_or_duplicate_start", "text": text})
            continue
        starts.add(start)
        next_start = rows[position + 1][0] if position + 1 < len(rows) else info.get("duration")
        end = end if end is not None else next_start
        if not isinstance(end, (int, float)) or end <= start or start + 15 > end:
            review.append({"reason": "unknown_or_short_segment", "text": text})
            continue
        # A leading explicit number is an uploader rank, never an official Melon rank.
        rank_match = re.match(r"^(?:#\s*)?(\d{1,3})(?:\s*위|[.)])\s*", text)
        rank = int(rank_match[1]) if rank_match else None
        if rank_match:
            text = text[rank_match.end():]
        parts = re.split(r"\s+[-–—]\s+", text, maxsplit=1)
        if len(parts) != 2 or not all(clean(part) for part in parts):
            review.append({"reason": "artist_title_separator_missing", "text": text, "startSeconds": start})
            continue
        left, right = map(clean, parts)
        forward, reverse = index.get(identity(left, right), {}), index.get(identity(right, left), {})
        matches = {**forward, **reverse}
        if len(matches) > 1:
            review.append({"reason": "ambiguous_catalog_match", "text": text})
            continue
        existing = next(iter(matches.values()), None)
        artist, title = (left, right) if order == "artist-title" else (right, left)
        if existing:
            artist, title = existing["artist"], existing["title"]
        stable_key = identity(artist, title)
        song_id = existing["id"] if existing else "chart-" + hashlib.sha256(stable_key.encode()).hexdigest()[:24]
        observation = {
            "id": f"{video_id}:{start:g}", "songId": song_id, "artist": artist, "title": title,
            "uploaderRank": rank, "sequence": position + 1, "startSeconds": start, "endSeconds": end,
            "chartDate": chart_date, "sourceUrl": url, "existingCatalogMatch": bool(existing),
            "highlightStartSeconds": None,
        }
        observations.append(observation)
        if not existing:
            songs.setdefault(song_id, {
                "id": song_id, "title": title, "artist": artist, "aliases": [], "categories": ["other"],
                "sourceUrl": url,
                "sourceMetadata": {"provenance": {"version": 1, "container": "multi-track", "content": "unknown",
                    "trackStartSeconds": start, "trackEndSeconds": end, "quizStartSeconds": None,
                    "selectionStatus": "timestamp-only"}, "performer": artist, "composer": None, "chartSource": source,
                    "trackStartSeconds": start, "trackEndSeconds": end, "highlightStartSeconds": None,
                    "nameOrder": order, "needsMetadataReview": True},
                "clips": {"intro": {"videoId": video_id, "startSeconds": start}},
            })
    if not rows:
        review.append({"reason": "no_track_timestamps"})
    if re.search(r"멜론\s*차트\s*[xX✕×]", source["title"] + " " + info.get("description", "")):
        review.append({"reason": "uploader_disclaims_melon_chart"})
    return {"source": source, "observations": observations, "newSongs": list(songs.values()), "review": review}


def fetch_video(url):
    # Respect Windows' trusted certificate store without disabling TLS verification.
    try:
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass
    import yt_dlp
    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True, "noplaylist": True,
                          "ignore_no_formats_error": True, "socket_timeout": 20,
                          "retries": 1, "extractor_retries": 1}) as client:
        info = client.extract_info(url, download=False)
    if not info or info.get("_type") == "playlist":
        raise ValueError("supply_single_video_url")
    return info


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_suffix(file.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(file)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--info-json", type=Path, help="Offline yt-dlp metadata fixture")
    parser.add_argument("--catalog", type=Path, default=ROOT / "data/song-guess/catalog.json")
    parser.add_argument("--order", choices=["artist-title", "title-artist"], default="artist-title")
    parser.add_argument("--chart-date", type=date.fromisoformat, help="Verified chart reference date; upload date is kept separate")
    parser.add_argument("--output", type=Path, help="Save cumulative observations and new metadata candidates locally")
    args = parser.parse_args()
    if bool(args.urls) == bool(args.info_json):
        parser.error("provide URLs or --info-json")
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))["songs"]
    results = []
    for value in args.urls or [args.info_json]:
        try:
            info = json.loads(value.read_text(encoding="utf-8")) if args.info_json else fetch_video(value)
            results.append(parse_video(info, catalog, args.order, str(args.chart_date) if args.chart_date else None))
        except Exception as error:
            results.append({"source": {"url": str(value)}, "observations": [], "newSongs": [],
                            "review": [{"reason": "extraction_failed", "errorType": type(error).__name__}]})
    report = {"version": 1, "collectedAt": datetime.now(timezone.utc).isoformat(), "results": results}
    if args.output:
        ledger_path = args.output / "observations.json"
        prior = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {"observations": []}
        observations = {row["id"]: row for row in prior["observations"]}
        candidates = {}
        for result in results:
            observations.update({row["id"]: row for row in result["observations"]})
            for song in result["newSongs"]:
                candidates.setdefault(song["id"], song)
        write_json(args.output / "report.json", report)
        write_json(ledger_path, {"version": 1, "observations": list(observations.values())})
        write_json(args.output / "candidates.json", {"version": 1, "songs": list(candidates.values())})
    summary = {"videos": len(results), "tracks": sum(len(r["observations"]) for r in results),
               "existingMatches": sum(row["existingCatalogMatch"] for r in results for row in r["observations"]),
               "review": [r["review"] for r in results], "output": str(args.output) if args.output else None}
    print(json.dumps(summary if args.output else report, ensure_ascii=False, indent=2))
    if any(any(issue["reason"] == "extraction_failed" for issue in r["review"]) for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
