import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourcePosition } from './song-guess-provenance.mjs';

const normalize = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const names = (v) => [v, ...String(v).split(/[()]/)].map(normalize).filter(Boolean);
const intersects = (a, b) => a.some(value => b.includes(value));

export function matchingSongs(pool, song) {
  const source = sourcePosition(song);
  return pool.filter(row => {
    const other = sourcePosition(row);
    const sameVideo = source.videoId && source.videoId === other.videoId;
    const sameSource = sameVideo && (!(source.multi || other.multi) ||
      (source.start != null && other.start != null && source.start === other.start));
    return row.id === song.id || sameSource ||
      (intersects(names(row.artist), names(song.artist)) &&
       intersects([row.title, ...(row.aliases ?? [])].flatMap(names), names(song.title)));
  });
}

async function main() {
  const [manifestPath, ...flags] = process.argv.slice(2);
  if (!manifestPath || flags.some(flag => flag !== '--apply')) throw new Error('usage_manifest_optional_apply');
  const endpoint = new URL(process.env.SUPABASE_URL);
  if (endpoint.origin !== 'https://supabase.aura-board.com') throw new Error('unexpected_production_target');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('production_key_missing');
  const request = async (query, rows) => {
    const url = new URL('/rest/v1/SongGuessCatalogSong', endpoint);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetch(url, { method: rows ? 'POST' : 'GET',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(rows ? { body: JSON.stringify(rows) } : {}), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`database_${response.status}`);
    return response.json();
  };
  const existing = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await request({ select: '*', order: 'id', offset: String(offset), limit: '500' });
    existing.push(...rows);
    if (rows.length < 500) break;
  }
  const input = JSON.parse(await readFile(manifestPath, 'utf8')).songs;
  const planned = [], matched = [], review = [];
  const pool = [...existing];
  for (const song of input) {
    if (!song.id || !song.artist?.trim() || !song.title?.trim() || song.title.length > 200 || song.artist.length > 200) throw new Error('invalid_metadata');
    const hits = matchingSongs(pool, song);
    if (hits.length > 1) { review.push({ id: song.id, title: song.title, artist: song.artist, matches: hits.map(row => row.id) }); continue; }
    if (hits.length === 1) { matched.push({ inputId: song.id, existingId: hits[0].id, title: song.title }); continue; }
    const { id, title, artist, aliases, categories, sourceUrl, sourceMetadata } = song;
    const row = { id, title, artist, aliases, categories, sourceUrl, sourceMetadata, updatedAt: new Date().toISOString() };
    planned.push(row); pool.push(row);
  }
  const report = { target: endpoint.hostname, before: existing.length, input: input.length,
    newSongs: planned.length, matched, review, apply: flags.includes('--apply') };
  const reportPath = path.join(path.dirname(path.resolve(manifestPath)), 'registration.json');
  await writeFile(reportPath, JSON.stringify({ ...report, planned }, null, 2));
  if (flags.includes('--apply')) {
    if (review.length) throw new Error('ambiguous_matches_review_required');
    if (planned.length) await request({}, planned);
    const expectedIds = [...new Set([...planned.map(row => row.id), ...matched.map(row => row.existingId)])];
    const readback = await request({ select: 'id,title,artist', id: `in.(${expectedIds.join(',')})` });
    if (readback.length !== expectedIds.length || planned.some(row => !readback.some(actual => actual.id === row.id && actual.title === row.title && actual.artist === row.artist))) throw new Error('readback_mismatch');
    report.verified = readback.length;
    await writeFile(reportPath, JSON.stringify({ ...report, planned }, null, 2));
  }
  console.log(JSON.stringify({ ...report, matched: matched.length, review: review.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => {
  console.error(/^[a-z_0-9]+$/.test(error.message) ? error.message : 'metadata_registration_failed');
  process.exitCode = 1;
});
