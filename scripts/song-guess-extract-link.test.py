import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import wave

spec = importlib.util.spec_from_file_location("extract_link", Path(__file__).with_name("song-guess-extract-link.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
VIDEO_ID = "dQw4w9WgXcQ"


class ExtractLinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.output = self.root / "output.wav"

    def test_request_validation_before_any_download(self):
        for video, start, output in [
            ("https://evil.test/", 0, self.output), ("unknown", 0, self.output),
            (VIDEO_ID, -1, self.output), (VIDEO_ID, 86401, self.output),
            (VIDEO_ID, 1.5, self.output), (VIDEO_ID, True, self.output),
            (VIDEO_ID, 0, "relative.wav"), (VIDEO_ID, 0, self.root / "missing" / "clip.wav"),
            (VIDEO_ID, 0, self.root / ".." / "clip.wav"), (VIDEO_ID, 0, self.root / "clip.mp3"),
        ]:
            with self.subTest(video=video, start=start, output=output), patch.object(module, "download_audio") as download:
                with self.assertRaises(module.ExtractionError):
                    module.extract_clip(video, start, output)
                download.assert_not_called()
        self.output.write_bytes(b"existing")
        with self.assertRaises(module.ExtractionError):
            module.validate_request(VIDEO_ID, 0, self.output)
        self.assertEqual(self.output.read_bytes(), b"existing")
        self.assertEqual(module.validate_request(VIDEO_ID, 86400, self.root / "new.wav").name, "new.wav")

    def test_metadata_is_conservative_and_never_uses_composer_or_uploader(self):
        for info, expected in [
            ({"track": " Song ", "artist": " Artist ", "title": "Other - Name"}, ("Song", "Artist")),
            ({"track": "Song", "composer": "Composer", "uploader": "Channel"}, ("Song", "")),
            ({"artist": "Artist", "title": "Other - Name"}, ("", "Artist")),
            ({"title": "아이유 - 밤편지"}, ("밤편지", "아이유")),
            ({"title": "Unknown"}, ("", "")),
            ({"title": "Artist - Song - Live"}, ("", "")),
            ({"title": "Artist - Song (Official MV)"}, ("", "")),
            ({"title": "Playlist - Best Mix"}, ("", "")),
            ({"title": "Artist - "}, ("", "")),
            ({"track": "x\nsecret", "artist": ["not a name"]}, ("", "")),
            ({"track": "x" * 201}, ("", "")),
        ]:
            with self.subTest(info=info):
                self.assertEqual(module.metadata_names(info), expected)

    def test_distributor_credits_keep_performers_not_composers(self):
        for title, credits, expected in [
            ("Drowning", "WOODZ,NATHAN,HOHO,WOODZ", "WOODZ"),
            ("Duet", "Singer One, Singer Two", "Singer One, Singer Two"),
            ("Song (PROD.ROCOBERRY)", "Singer,ROCOBERRY,Arranger,Singer", "Singer"),
            ("Song (feat. Guest)", "Singer,Composer,Guest,Singer", "Singer, Guest"),
            ("Song (ft. Guest)", "Singer,Composer,Guest,Singer", "Singer, Guest"),
            ("Song (with Guest)", "Singer,Composer,Guest,Singer", "Singer, Guest"),
            ("Song (feat. Guest, PROD.ROCOBERRY)", "Singer,Guest,ROCOBERRY,Singer", "Singer, Guest"),
            ("Song (feat. HOHO)", "Singer,HO,HOHO,Singer", "Singer, HOHO"),
            ("Song", "Singer," + "Composer," * 40 + "Singer", "Singer"),
            ("Song", "Singer,Singer", "Singer"),
        ]:
            with self.subTest(title=title, credits=credits):
                info = {"track": title, "artist": credits, "description": "Provided to YouTube by Distributor\nCredits"}
                self.assertEqual(module.metadata_names(info), (title, expected))

    def test_distributor_correction_does_not_apply_to_other_descriptions(self):
        for description in [None, "", "Teacher upload", "Intro\nProvided to YouTube by Distributor"]:
            info = {"track": "Song", "artist": "Singer,Composer,Arranger", "description": description}
            self.assertEqual(module.metadata_names(info), ("Song", "Singer,Composer,Arranger"))

    def fake_factory(self, info=None, hook=None, filename=None):
        owner = self
        class FakeYDL:
            def __init__(self, options):
                owner.options = options
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                pass
            def extract_info(self, url, download):
                owner.assertEqual(url, f"https://www.youtube.com/watch?v={VIDEO_ID}")
                owner.assertTrue(download)
                if hook:
                    hook(owner.options)
                (owner.root / "source.m4a").write_bytes(b"audio")
                return info if info is not None else {"id": VIDEO_ID, "duration": 100}
            def prepare_filename(self, _info):
                return str(filename or owner.root / "source.m4a")
        return FakeYDL

    def test_download_contract_native_tls_and_bounded_resources(self):
        source, _ = module.download_audio(VIDEO_ID, 0, self.root, self.fake_factory())
        self.assertEqual(source.parent, self.root)
        self.assertFalse(self.options["nocheckcertificate"])
        self.assertEqual(self.options["compat_opts"], {"no-certifi"})
        self.assertIsNone(self.options["cookiefile"])
        self.assertIsNone(self.options["cookiesfrombrowser"])
        self.assertFalse(self.options["usenetrc"])
        self.assertEqual(self.options["max_filesize"], module.MAX_DOWNLOAD_BYTES)
        self.assertEqual(self.options["socket_timeout"], 10)
        self.assertNotIn("external_downloader", self.options)
        self.assertIn("[protocol=https]", self.options["format"])
        for status in [{"downloaded_bytes": module.MAX_DOWNLOAD_BYTES + 1},
                       {"total_bytes": module.MAX_DOWNLOAD_BYTES + 1}]:
            with self.assertRaises(module.ExtractionError):
                self.options["progress_hooks"][0](status)
        with patch.object(module.time, "monotonic", return_value=float("inf")):
            with self.assertRaises(module.ExtractionError):
                self.options["progress_hooks"][0]({})

    def test_download_rejects_wrong_identity_playlists_live_short_and_escaped_paths(self):
        for info in [{"id": "differentID"}, {"id": VIDEO_ID, "_type": "playlist"},
                     {"id": VIDEO_ID, "is_live": True}, {"id": VIDEO_ID, "duration": 14.9},
                     {"id": VIDEO_ID, "duration": float("nan")},
                     {"id": VIDEO_ID, "live_status": "is_upcoming"}]:
            with self.subTest(info=info), self.assertRaises(module.ExtractionError):
                module.download_audio(VIDEO_ID, 0, self.root, self.fake_factory(info))
        with self.assertRaises(module.ExtractionError):
            module.download_audio(VIDEO_ID, 0, self.root, self.fake_factory(filename=self.root.parent / "escape.m4a"))
        rejection = self.options["match_filter"]({"duration": 14})
        self.assertEqual(rejection, "insufficient_audio")

    def test_ffmpeg_arguments_and_short_decode_failure(self):
        def run(command, **kwargs):
            self.assertFalse(kwargs["shell"])
            self.assertEqual(kwargs["timeout"], 40)
            self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
            self.assertEqual(command[command.index("-protocol_whitelist") + 1], "file")
            self.assertEqual(command[command.index("-ss") + 1], "12")
            self.assertEqual(command[command.index("-t") + 1], "15")
            Path(command[-1]).write_bytes(b"short")
        with patch.object(module.shutil, "which", return_value="ffmpeg"), patch.object(module.subprocess, "run", side_effect=run):
            with self.assertRaisesRegex(module.ExtractionError, "insufficient_audio"):
                module.decode_pcm(self.root / "source.m4a", 12, self.root)
        with patch.object(module.shutil, "which", return_value=None):
            with self.assertRaisesRegex(module.ExtractionError, "ffmpeg_unavailable"):
                module.decode_pcm(self.root / "source.m4a", 12, self.root)

    def test_success_has_canonical_wav_hash_and_exact_json_contract(self):
        pcm = b"\x01\x00" * (44100 * 15)
        with patch.object(module, "download_audio", return_value=(self.root / "source", {"track": "Song", "artist": "Artist"})), patch.object(module, "decode_pcm", return_value=pcm):
            result = module.extract_clip(VIDEO_ID, 12, self.output)
        audio = self.output.read_bytes()
        self.assertEqual(len(audio), 44 + module.PCM_BYTES)
        with wave.open(str(self.output), "rb") as wav:
            self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()), (1, 2, 44100, 661500))
            self.assertEqual(wav.readframes(661500), pcm)
        self.assertEqual(result, {"title": "Song", "artist": "Artist", "videoId": VIDEO_ID,
            "startSeconds": 12, "sourceUrl": f"https://www.youtube.com/watch?v={VIDEO_ID}&t=12",
            "durationMs": 15000, "mimeType": "audio/wav", "sizeBytes": len(audio),
            "sha256": hashlib.sha256(audio).hexdigest()})
        self.assertEqual(list(self.root.iterdir()), [self.output])

    def test_cli_stdout_and_sanitized_failures(self):
        args = ["--video-id", VIDEO_ID, "--start-seconds", "0", "--output", str(self.output)]
        def noisy(*_args):
            print("sensitive library log")
            return {"title": "Song"}
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), patch.object(module, "extract_clip", side_effect=noisy):
            self.assertEqual(module.main(args), 0)
        self.assertEqual(json.loads(out.getvalue()), {"title": "Song"})
        self.assertEqual(len(out.getvalue().splitlines()), 1)
        self.assertEqual(err.getvalue(), "")
        for invalid in [args, ["--secret", "DO_NOT_LOG"], args[:3] + ["1.5"] + args[4:]]:
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), patch.object(module, "extract_clip", side_effect=RuntimeError("DO_NOT_LOG")):
                self.assertEqual(module.main(invalid), 1)
            self.assertEqual(out.getvalue(), "")
            self.assertEqual(err.getvalue(), "song_guess_link_extraction_failed\n")

    def test_failed_decode_cleans_scratch_without_publishing_output(self):
        def download(_video, _start, work):
            source = work / "source.m4a"
            source.write_bytes(b"partial download")
            return source, {}
        for failure in [subprocess.TimeoutExpired("ffmpeg", 40),
                        subprocess.CalledProcessError(1, "ffmpeg"),
                        module.ExtractionError("insufficient_audio")]:
            with self.subTest(failure=type(failure).__name__), patch.object(module, "download_audio", side_effect=download), patch.object(module, "decode_pcm", side_effect=failure):
                with self.assertRaises(type(failure)):
                    module.extract_clip(VIDEO_ID, 0, self.output)
            self.assertEqual(list(self.root.iterdir()), [])

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is not installed")
    def test_real_ffmpeg_seeks_exact_samples_and_rejects_short_tail(self):
        source = self.root / "source.wav"
        with wave.open(str(source), "wb") as wav:
            wav.setparams((1, 2, 44100, 0, "NONE", "not compressed"))
            wav.writeframes(b"".join(struct.pack("<h", second * 100) * 44100 for second in range(18)))
        pcm = module.decode_pcm(source, 2, self.root)
        self.assertEqual(len(pcm), module.PCM_BYTES)
        self.assertEqual(struct.unpack("<h", pcm[:2])[0], 200)
        self.assertEqual(struct.unpack("<h", pcm[-2:])[0], 1600)
        (self.root / "clip.pcm").unlink()
        with self.assertRaisesRegex(module.ExtractionError, "insufficient_audio"):
            module.decode_pcm(source, 4, self.root)


if __name__ == "__main__":
    unittest.main()
