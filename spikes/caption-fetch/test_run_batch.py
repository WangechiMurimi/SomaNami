"""Unit tests for run_batch.py. Run: python -m unittest test_run_batch"""
import unittest

from run_batch import build_table, extract_video_id, parse_videos_file


class ExtractVideoIdTest(unittest.TestCase):
    def test_url_formats(self):
        for url in [
            "https://www.youtube.com/watch?v=Sh-se-i0afA",
            "https://www.youtube.com/watch?list=PL1&v=Sh-se-i0afA&t=42s",
            "https://youtu.be/Sh-se-i0afA?t=10",
            "https://www.youtube.com/shorts/Sh-se-i0afA",
            "https://www.youtube.com/embed/Sh-se-i0afA",
            "Sh-se-i0afA",
        ]:
            self.assertEqual(extract_video_id(url), "Sh-se-i0afA", url)

    def test_invalid(self):
        self.assertIsNone(extract_video_id("https://example.com/video"))


class ParseVideosFileTest(unittest.TestCase):
    def test_skips_comments_and_reads_columns(self):
        text = "# header\n\nhttps://youtu.be/B3U1NDUiwSA | manual | quantum\nRYT08CaYq6A\n"
        videos = parse_videos_file(text)
        self.assertEqual([v["id"] for v in videos], ["B3U1NDUiwSA", "RYT08CaYq6A"])
        self.assertEqual(videos[0]["type"], "manual")
        self.assertEqual(videos[0]["note"], "quantum")
        self.assertEqual(videos[1]["type"], "")


class BuildTableTest(unittest.TestCase):
    def test_rows_for_pass_fail_and_bad_url(self):
        videos = parse_videos_file("AAAAAAAAAAA | auto\nBBBBBBBBBBB | manual\nnot-a-url | auto")
        results = {
            "AAAAAAAAAAA": {"ok": True, "auto_generated": True, "ms": 900},
            "BBBBBBBBBBB": {"ok": False, "error": "IpBlocked", "detail": "blocked", "ms": 50},
        }
        lines = build_table(videos, results, {"AAAAAAAAAAA": "A | B"}).splitlines()
        self.assertEqual(lines[2], "| A \\| B (`AAAAAAAAAAA`) | auto | ✅ | Yes | 900 | — |")
        self.assertEqual(lines[3], "| `BBBBBBBBBBB` | manual | ❌ | — | 50 | IpBlocked: blocked |")
        self.assertIn("Could not parse video ID", lines[4])


if __name__ == "__main__":
    unittest.main()
