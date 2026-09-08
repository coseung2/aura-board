export type SongGuessImportItem = {
  id: string;
  sourceUrl: string;
  startSeconds: number;
  status: string;
  title: string;
  artist: string;
  error: string | null;
};
