import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("chart_scrape", Path(__file__).with_name("song-guess-chart-scrape.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ChartTests(unittest.TestCase):
    def info(self, **changes):
        return {"id": "abcdefghijk", "title": "주간 인기곡", "duration": 120,
                "description": "00:00 1. Artist - Title\n01:00 Other - Song", **changes}

    def test_description_tracks_and_explicit_rank(self):
        result = module.parse_video(self.info(), [])
        self.assertEqual(len(result["observations"]), 2)
        self.assertEqual(result["observations"][0]["uploaderRank"], 1)
        self.assertIsNone(result["observations"][1]["uploaderRank"])
        self.assertIsNone(result["source"]["chartDate"])
        self.assertIsNone(result["newSongs"][0]["sourceMetadata"]["composer"])
        self.assertIsNone(result["observations"][0]["highlightStartSeconds"])

    def test_existing_alias_and_reverse_order_match_without_overwrite(self):
        catalog = [{"id": "existing", "title": "Canonical", "artist": "Artist", "aliases": ["Title"]}]
        result = module.parse_video(self.info(description="00:00 Title - Artist"), catalog)
        self.assertEqual(result["observations"][0]["songId"], "existing")
        self.assertEqual(result["newSongs"], [])

    def test_chapters_priority_and_stable_song_id_across_weeks(self):
        first = module.parse_video(self.info(chapters=[{"start_time": 0, "end_time": 30, "title": "Artist - Title"}]), [])
        second = module.parse_video(self.info(id="12345678901", description="00:20 Artist - Title"), [])
        self.assertEqual(first["newSongs"][0]["id"], second["newSongs"][0]["id"])
        self.assertNotEqual(first["observations"][0]["id"], second["observations"][0]["id"])

    def test_missing_tracks_and_disclaimer_require_review(self):
        result = module.parse_video(self.info(description="멜론차트 X"), [])
        self.assertEqual(result["observations"], [])
        self.assertEqual({item["reason"] for item in result["review"]}, {"no_track_timestamps", "uploader_disclaims_melon_chart"})

    def test_short_and_ambiguous_tracks_not_imported(self):
        result = module.parse_video(self.info(duration=10, description="00:00 Artist - Title"), [])
        self.assertEqual(result["newSongs"], [])
        catalog = [{"id": str(i), "artist": "Artist", "title": "Title"} for i in range(2)]
        result = module.parse_video(self.info(description="00:00 Artist - Title"), catalog)
        self.assertEqual(result["newSongs"], [])

    def test_title_first_and_unicode_normalization(self):
        result = module.parse_video(self.info(description="00:00 Ｔｉｔｌｅ - Artist"), [], "title-artist", "2026-09-07")
        self.assertEqual(result["newSongs"][0]["title"], "Title")
        self.assertEqual(result["source"]["chartDate"], "2026-09-07")

    def test_invalid_timestamp_is_reviewed(self):
        result = module.parse_video(self.info(description="00:99 Artist - Title"), [])
        self.assertEqual(result["newSongs"], [])
        self.assertIn("invalid_timestamp", [item["reason"] for item in result["review"]])


if __name__ == "__main__":
    unittest.main()
