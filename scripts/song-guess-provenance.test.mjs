import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProvenance } from './song-guess-provenance.mjs';
import { matchingSongs } from './song-guess-register-metadata.mjs';
const provenance = { version: 1, container: 'multi-track', content: 'highlight', trackStartSeconds: 24, trackEndSeconds: 45, quizStartSeconds: 24, selectionStatus: 'uploader-highlight' };
test('keeps a highlight compilation distinct from a full recording', () => {
  assert.equal(validateProvenance(provenance).content, 'highlight');
  assert.throws(() => validateProvenance({ ...provenance, quizStartSeconds: 40 }));
  assert.throws(() => validateProvenance({ ...provenance, selectionStatus: 'timestamp-only' }));
});
test('same compilation with different track starts is not one song', () => {
  const sourceUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
  const first = { id: 'a', title: 'A', artist: 'X', sourceUrl, sourceMetadata: { chapterStartSeconds: 0 } };
  const second = { id: 'b', title: 'B', artist: 'Y', sourceUrl, sourceMetadata: { provenance } };
  assert.deepEqual(matchingSongs([first], second), []);
  assert.equal(matchingSongs([{ ...second, id: 'old' }], second).length, 1);
});
