from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("song-guess-download-pool.py")
SPEC = importlib.util.spec_from_file_location("song_guess_download_pool", SCRIPT)
assert SPEC and SPEC.loader
POOL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = POOL
SPEC.loader.exec_module(POOL)


class SongGuessDownloadPoolTests(unittest.TestCase):
    def test_ffmpeg_discovery_never_treats_working_directory_as_executable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(POOL.Path, "cwd", return_value=Path(temporary)):
                with patch.object(POOL.shutil, "which", return_value=None):
                    fake = type(
                        "FakeImageioFfmpeg",
                        (),
                        {"get_ffmpeg_exe": staticmethod(lambda: str(Path(temporary) / "missing.exe"))},
                    )()
                    with patch.dict(sys.modules, {"imageio_ffmpeg": fake}):
                        with self.assertRaisesRegex(RuntimeError, "ffmpeg_not_found"):
                            POOL.find_ffmpeg(None)

    def test_partial_source_cache_is_ignored_and_completed_download_is_used(self) -> None:
        class FakeYoutubeDL:
            def __init__(self, options):
                self.options = options

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def download(self, _urls):
                Path(self.options["outtmpl"].replace("%(ext)s", "webm")).write_bytes(b"complete")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            cache = root / "video"
            cache.mkdir()
            (cache / "source.webm.part").write_bytes(b"partial")
            with patch.object(POOL.yt_dlp, "YoutubeDL", FakeYoutubeDL):
                source = POOL.source_for_video("abcdefghijk", root)
            self.assertEqual(source.name, "source.webm")
            self.assertEqual(source.read_bytes(), b"complete")

    def test_short_local_audio_is_rejected_without_padding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            short = root / "short.wav"
            with wave.open(str(short), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(POOL.SAMPLE_RATE)
                output.writeframes(b"\0\0" * POOL.SAMPLE_RATE)
            self.assertFalse(POOL.valid_wav(short))
            entry = POOL.ClipEntry("song", "highlight", "abcdefghijk", 0, "Song", "Artist", ())
            result = POOL.extract(
                entry,
                root,
                POOL.find_ffmpeg(Path.cwd() / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"),
                root / "cache",
                source=short,
            )
            self.assertEqual(result.status, "failure")
            self.assertEqual(result.error, "invalid_15s_mono_44100_pcm16_output")

    def test_song_id_cannot_escape_output_root(self) -> None:
        entry = POOL.ClipEntry("..\\..\\outside", "highlight", "abcdefghijk", 0, "Song", "Artist", ())
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "unsafe_output_path"):
                POOL.output_path(Path(temporary), entry)


if __name__ == "__main__":
    unittest.main()
