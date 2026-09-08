import { readFile } from 'node:fs/promises';
import { validateProvenance } from './song-guess-provenance.mjs';
const paths = process.argv.slice(2);
if (!paths.length) paths.push('data/song-guess/catalog.json', 'data/song-guess/classical-elementary-candidates.json');
let invalid = 0;
for (const path of paths) {
  const { songs } = JSON.parse(await readFile(path, 'utf8'));
  const counts = {};
  for (const song of songs) {
    if (!song.sourceMetadata?.provenance) {
      counts['legacy-unclassified'] = (counts['legacy-unclassified'] ?? 0) + 1;
      continue;
    }
    try {
      const source = validateProvenance(song.sourceMetadata?.provenance);
      const key = `${source.container}/${source.content}/${source.selectionStatus}`;
      counts[key] = (counts[key] ?? 0) + 1;
    } catch {
      console.error(`Invalid or missing provenance: ${song.id}`); invalid++;
    }
  }
  console.log(JSON.stringify({ path, songs: songs.length, counts }));
}
if (invalid) process.exitCode = 1;
