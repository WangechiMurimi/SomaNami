"""Unit tests for the /transcript endpoint. Run: python -m unittest test_transcript"""
import unittest
from types import SimpleNamespace
from unittest import mock

from api import index

FAKE_TRANSCRIPT = SimpleNamespace(
    is_generated=False,
    language_code="en",
    snippets=[
        SimpleNamespace(start=0.36, duration=5.0, text="A quantum computer \nuses  "),
        SimpleNamespace(start=5.36, duration=6.12, text="  quantum\nmechanics.  "),
    ],
)


class TranscriptEndpointTest(unittest.TestCase):
    def test_json_format_returns_timed_snippets(self):
        with mock.patch.object(index.ytt, "fetch", return_value=FAKE_TRANSCRIPT):
            result = index.transcript("B3U1NDUiwSA")
        self.assertEqual(result["video_id"], "B3U1NDUiwSA")
        self.assertFalse(result["auto_generated"])
        self.assertEqual(result["language"], "en")
        self.assertEqual(
            result["snippets"][0],
            {"start": 0.36, "duration": 5.0, "text": "A quantum computer \nuses  "},
        )
        self.assertEqual(len(result["snippets"]), 2)

    def test_text_format_joins_and_cleans_whitespace(self):
        with mock.patch.object(index.ytt, "fetch", return_value=FAKE_TRANSCRIPT):
            result = index.transcript("B3U1NDUiwSA", format="text")
        self.assertEqual(
            result, {"video_id": "B3U1NDUiwSA", "text": "A quantum computer uses quantum mechanics."}
        )

    def test_failure_returns_error_shape(self):
        with mock.patch.object(index.ytt, "fetch", side_effect=ValueError("boom")):
            result = index.transcript("bad")
        self.assertEqual(
            {k: result[k] for k in ("video_id", "ok", "error", "detail")},
            {"video_id": "bad", "ok": False, "error": "ValueError", "detail": "boom"},
        )
        self.assertIn("ms", result)


if __name__ == "__main__":
    unittest.main()
