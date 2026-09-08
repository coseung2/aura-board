import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingSongs } from './song-guess-register-metadata.mjs';

const song = { id: 'new', artist: 'BTS', title: 'Spring Day', sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk' };
test('matches translated artist and title alias without requiring a composer', () => {
  const existing = { id: 'old', artist: '방탄소년단 (BTS)', title: '봄날', aliases: ['Spring Day'] };
  assert.deepEqual(matchingSongs([existing], song), [existing]);
});
test('does not conflate the same title by different artists', () => {
  assert.deepEqual(matchingSongs([{ id: 'old', artist: 'Other', title: 'Spring Day' }], song), []);
});
test('matches previous video provenance and exposes ambiguous matches', () => {
  const first = { id: 'one', sourceMetadata: { originalVideoId: 'abcdefghijk' } };
  const second = { id: 'two', sourceUrl: song.sourceUrl };
  assert.equal(matchingSongs([first, second], song).length, 2);
});
