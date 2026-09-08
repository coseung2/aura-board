// Source content and quiz selection are independent of the produced WAV segment.
export function validateProvenance(value) {
  if (!value || value.version !== 1 ||
      !['single-track', 'multi-track', 'unknown'].includes(value.container) ||
      !['full', 'highlight', 'unknown'].includes(value.content) ||
      !['timestamp-only', 'uploader-highlight', 'teacher-selected', 'listening-verified', 'unknown'].includes(value.selectionStatus)) {
    throw new Error('invalid_song_provenance');
  }
  for (const name of ['trackStartSeconds', 'trackEndSeconds', 'quizStartSeconds']) {
    if (value[name] !== null && (!Number.isFinite(value[name]) || value[name] < 0)) throw new Error('invalid_song_provenance_time');
  }
  const { trackStartSeconds: start, trackEndSeconds: end, quizStartSeconds: quiz } = value;
  if (end !== null && (start === null || end <= start)) throw new Error('invalid_song_provenance_range');
  if (quiz !== null && ((start !== null && quiz < start) || (end !== null && quiz + 15 > end))) throw new Error('invalid_song_provenance_clip');
  if (value.selectionStatus === 'timestamp-only' && quiz !== null) throw new Error('unreviewed_song_highlight');
  if (['uploader-highlight', 'teacher-selected', 'listening-verified'].includes(value.selectionStatus) && quiz === null) throw new Error('missing_song_quiz_start');
  return value;
}

export function sourcePosition(song) {
  const metadata = song.sourceMetadata ?? {};
  const source = metadata.provenance;
  if (source) validateProvenance(source);
  let url;
  try { url = new URL(song.sourceUrl); } catch {}
  const videoId = metadata.videoId ?? metadata.originalVideoId ?? url?.searchParams.get('v');
  const start = source?.trackStartSeconds ?? metadata.trackStartSeconds ?? metadata.chapterStartSeconds;
  return { videoId, start, multi: source?.container === 'multi-track' || start != null };
}
