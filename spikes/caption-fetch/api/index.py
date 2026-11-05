"""
Caption fetching spike for SomaNami.

Run locally:   uvicorn main:app --reload
Deploy:        start command  uvicorn main:app --host 0.0.0.0 --port $PORT

Endpoints
  GET /captions/{video_id}      test one video
  GET /run?ids=ID1,ID2,ID3      test several videos, one row each
"""
import time
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
