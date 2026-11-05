"""
Caption fetching spike for SomaNami.

Run locally:   uvicorn main:app --reload
Deploy:        start command  uvicorn main:app --host 0.0.0.0 --port $PORT

Endpoints
  GET /captions/{video_id}      test one video
  GET /run?ids=ID1,ID2,ID3      test several videos, one row each
  GET /transcript/{video_id}    full transcript (?format=text for plain text)
"""
import time
from typing import Literal

from fastapi import FastAPI
from youtube_transcript_api import YouTubeTranscriptApi

app = FastAPI()
ytt = YouTubeTranscriptApi()


def test_video(video_id: str) -> dict:
    start = time.perf_counter()
    try:
        transcript = ytt.fetch(video_id, languages=["en"])
        snippets = transcript.snippets
        return {
            "video_id": video_id,
            "ok": True,
            "snippets": len(snippets),
            "auto_generated": transcript.is_generated,
            "language": transcript.language_code,
            "first_line": snippets[0].text if snippets else None,
            "ms": round((time.perf_counter() - start) * 1000),
        }
    except Exception as e:  # we want to record every failure type, not crash
        return {
            "video_id": video_id,
            "ok": False,
            "error": type(e).__name__,
            "detail": str(e)[:300],
            "ms": round((time.perf_counter() - start) * 1000),
        }


@app.get("/captions/{video_id}")
def one(video_id: str):
    return test_video(video_id)


@app.get("/run")
def run(ids: str):
    rows = [test_video(v.strip()) for v in ids.split(",") if v.strip()]
    passed = sum(r["ok"] for r in rows)
    return {"passed": passed, "total": len(rows), "results": rows}


def clean_snippet_text(text: str) -> str:
    """Flatten a caption snippet to one line with single spaces."""
    # str.split() also splits on non-breaking spaces, which creator captions contain.
    return " ".join(text.replace("\n", " ").split())


@app.get("/transcript/{video_id}")
def transcript(video_id: str, format: Literal["json", "text"] = "json"):
    """Return the full English transcript as timed snippets or one text string."""
    start = time.perf_counter()
    try:
        fetched = ytt.fetch(video_id, languages=["en"])
    except Exception as e:  # same error shape as test_video so callers handle one format
        return {
            "video_id": video_id,
            "ok": False,
            "error": type(e).__name__,
            "detail": str(e)[:300],
            "ms": round((time.perf_counter() - start) * 1000),
        }

    if format == "text":
        text = " ".join(clean_snippet_text(s.text) for s in fetched.snippets)
        return {"video_id": video_id, "text": " ".join(text.split())}

    return {
        "video_id": video_id,
        "auto_generated": fetched.is_generated,
        "language": fetched.language_code,
        "snippets": [
            {"start": s.start, "duration": s.duration, "text": s.text}
            for s in fetched.snippets
        ],
    }



