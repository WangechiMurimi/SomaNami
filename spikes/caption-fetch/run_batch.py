"""Run every video in videos.txt through the spike server and print a markdown table.

Usage (server must be running):  python run_batch.py [videos.txt] [--base-url URL]

Standard library only, so it runs without the .venv too.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
VIDEO_ID_PATTERN = re.compile(
    r"(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})"
)
BARE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url: str):
    """Return the 11-character video ID from a YouTube URL or bare ID, or None."""
    url = url.strip()
    if BARE_ID_PATTERN.match(url):
        return url
    match = VIDEO_ID_PATTERN.search(url)
    return match.group(1) if match else None


def parse_videos_file(text: str) -> list:
    """Parse `URL | type | note` lines into dicts, skipping blanks and # comments."""
    videos = []
    for line_no, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        url = parts[0]
        videos.append(
            {
                "line": line_no,
                "url": url,
                "id": extract_video_id(url),
                "type": parts[1] if len(parts) > 1 else "",
                "note": parts[2] if len(parts) > 2 else "",
            }
        )
    return videos


def fetch_json(url: str, timeout: float):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.load(resp)


def fetch_title(video_id: str):
    """Look up the title via YouTube oEmbed; None if it fails (title is cosmetic)."""
    watch_url = "https://www.youtube.com/watch?v=" + video_id
    query = urllib.parse.urlencode({"url": watch_url, "format": "json"})
    try:
        return fetch_json("https://www.youtube.com/oembed?" + query, timeout=10).get("title")
    except Exception:
        return None


def md_cell(value) -> str:
    """Make a value safe inside a markdown table cell."""
    return str(value).replace("|", "\\|").replace("\n", " ").strip() or "—"


def build_table(videos: list, results_by_id: dict, titles: dict) -> str:
    """Render the results as a markdown table, one row per videos.txt entry."""
    rows = [
        "| Video | Caption type | Result | Auto-generated | Time (ms) | Error |",
        "|---|---|---|---|---|---|",
    ]
    for v in videos:
        if v["id"] is None:
            label, result = v["url"], {"ok": False, "error": "Could not parse video ID"}
        else:
            title = titles.get(v["id"])
            label = "{} (`{}`)".format(title, v["id"]) if title else "`{}`".format(v["id"])
            result = results_by_id.get(v["id"], {"ok": False, "error": "No result returned"})

        ok = result.get("ok")
        auto = result.get("auto_generated")
        auto_cell = "—" if not ok or auto is None else ("Yes" if auto else "No")
        error = result.get("error", "")
        if error and result.get("detail"):
            error = "{}: {}".format(error, result["detail"][:120])
        rows.append(
            "| {} | {} | {} | {} | {} | {} |".format(
                md_cell(label),
                md_cell(v["type"]),
                "✅" if ok else "❌",
                auto_cell,
                md_cell(result.get("ms", "")),
                md_cell(error),
            )
        )
    return "\n".join(rows)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("videos_file", nargs="?", default="videos.txt")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--no-titles", action="store_true", help="skip oEmbed title lookup")
    args = parser.parse_args(argv)

    with open(args.videos_file, encoding="utf-8") as f:
        videos = parse_videos_file(f.read())
    ids = [v["id"] for v in videos if v["id"]]
    if not ids:
        print("No valid video IDs found in " + args.videos_file, file=sys.stderr)
        return 1

    # One /run call so the server times every video the same way it does for manual tests.
    run_url = args.base_url.rstrip("/") + "/run?" + urllib.parse.urlencode({"ids": ",".join(ids)})
    try:
        payload = fetch_json(run_url, timeout=300)
    except urllib.error.URLError as e:
        print("Could not reach {} ({}). Is the server running?".format(args.base_url, e.reason),
              file=sys.stderr)
        return 1

    results_by_id = {r["video_id"]: r for r in payload.get("results", [])}
    titles = {} if args.no_titles else {i: fetch_title(i) for i in ids}

    print(build_table(videos, results_by_id, titles))
    print("\n{}/{} passed".format(payload.get("passed", 0), payload.get("total", len(ids))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
