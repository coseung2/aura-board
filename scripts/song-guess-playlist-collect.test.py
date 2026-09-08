import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('song-guess-playlist-collect.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CreditsTests(unittest.TestCase):
    def test_mixed_credits_are_not_singers(self):
        self.assertEqual(module.performer_name('Drowning', 'WOODZ, NATHAN, HOHO, WOODZ'), 'WOODZ')
    def test_duet_preserved(self):
        self.assertEqual(module.performer_name('APT.', 'ROSÉ, Bruno Mars'), 'ROSÉ, Bruno Mars')
    def test_feature_preserved_and_deduplicated(self):
        self.assertEqual(module.performer_name('HOME SWEET HOME (feat. TAEYANG & DAESUNG)', 'G-DRAGON, TAEYANG, DAESUNG, TAEYANG'), 'G-DRAGON, TAEYANG, DAESUNG')
    def test_producer_not_a_featured_singer(self):
        self.assertEqual(module.performer_name('Unknown (PROD.ROCOBERRY)', 'ZO ZAZZ, ROCOBERRY, Someone'), 'ZO ZAZZ')
if __name__ == '__main__': unittest.main()
