"""Collect song metadata from a YouTube playlist. No audio or database writes."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
import truststore
truststore.inject_into_ssl()
import yt_dlp


def clean(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).split())


def performer_name(title, credits):
    names = [clean(name) for name in credits.split(',') if clean(name)]
    if len(names) <= 2:
        return ', '.join(dict.fromkeys(names))
    # Distributor metadata sometimes flattens all roles into artists. Keep the
    # leading performer and explicitly featured performers; genuine two-person
    # collaborations remain intact. Keep the original credits in provenance.
    result = [names[0]]
    feature = re.search(r'\b(?:feat\.?|ft\.?|with)\s+([^)]*)', title, re.I)
    for name in names[1:]:
        if feature and name.casefold() in feature[1].casefold() and name not in result:
            result.append(name)
    return ', '.join(result)


def collect(entry):
    try:
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True,
                              'ignore_no_formats_error': True, 'socket_timeout': 20,
                              'retries': 1, 'extractor_retries': 1}) as client:
            info = client.extract_info(entry['url'], download=False)
        title, artist = clean(info.get('track')), clean(info.get('artist'))
        original_artist = artist
        if info.get('description', '').startswith('Provided to YouTube by '):
            artist = performer_name(title, artist)
        if not title or not artist:
            return {'review': {'videoId': entry['id'], 'reason': 'missing_structured_artist_or_title'}}
        year = info.get('release_year')
        categories = [f'{year // 10 * 10}s'] if isinstance(year, int) and 2000 <= year < 2030 else ['other']
        identity = json.dumps([artist.casefold(), title.casefold()], ensure_ascii=False)
        return {'song': {
            'id': 'chart-' + hashlib.sha256(identity.encode()).hexdigest()[:24],
            'title': title, 'artist': artist, 'aliases': [], 'categories': categories,
            'sourceUrl': f'https://www.youtube.com/watch?v={entry["id"]}',
            'sourceMetadata': {'provenance': {'version': 1, 'container': 'single-track', 'content': 'unknown',
                               'trackStartSeconds': 0, 'trackEndSeconds': info.get('duration'),
                               'quizStartSeconds': None, 'selectionStatus': 'timestamp-only'},
                               'performer': artist, 'sourceArtistCredits': original_artist, 'album': clean(info.get('album')),
                               'year': year, 'originalVideoId': entry['id'],
                               'durationSeconds': info.get('duration'), 'highlightStartSeconds': None,
                               'metadataSource': 'youtube-music-structured'},
            'clips': {'intro': {'videoId': entry['id'], 'startSeconds': 0}},
        }}
    except Exception as error:
        return {'review': {'videoId': entry.get('id'), 'reason': type(error).__name__}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not re.match(r'^https://(?:www\.)?youtube\.com/playlist\?list=[\w-]+$', args.url):
        parser.error('provide a YouTube playlist URL')
    with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True, 'playlistend': 150,
                          'socket_timeout': 20, 'retries': 1}) as client:
        playlist = client.extract_info(args.url, download=False)
    entries = list(playlist['entries'])
    available = [entry for entry in entries if entry.get('title') and entry.get('duration')]
    source = {'url': args.url, 'title': playlist.get('title'), 'description': playlist.get('description'),
              'modifiedDate': playlist.get('modified_date'), 'collectedAt': datetime.now(timezone.utc).isoformat(),
              'authority': 'unverified-uploader'}
    songs, review = {}, [{'videoId': entry.get('id'), 'reason': 'unavailable_playlist_entry'}
                         for entry in entries if entry not in available]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index, result in enumerate(pool.map(collect, available), 1):
            if 'song' in result:
                song = result['song']
                song['sourceMetadata']['chartPlaylist'] = source
                songs.setdefault(song['id'], song)
            else:
                review.append(result['review'])
            if index % 20 == 0:
                print(json.dumps({'processed': index, 'collected': len(songs)}), flush=True)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'catalog.json').write_text(json.dumps({'version': 1, 'songs': list(songs.values())}, ensure_ascii=False, indent=2), encoding='utf-8')
    (args.output / 'collection.json').write_text(json.dumps({'source': source, 'review': review, 'songs': len(songs)}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'collected': len(songs), 'review': review}, ensure_ascii=False))


if __name__ == '__main__':
    main()
