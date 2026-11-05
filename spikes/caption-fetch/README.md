# Spike: caption fetching (#59)

Checks whether `youtube-transcript-api` (1.x) can fetch YouTube captions, first locally and then from the deployed host.

## Setup (fresh clone)

Requires Python 3.9 or newer. All commands run from this folder.

```bash
cd spikes/caption-fetch
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

1. Start the server and leave it running in a terminal:

   ```bash
   uvicorn api.index:app --reload
   ```

2. In a second terminal (with `.venv` activated), run the batch:

   ```bash
   python run_batch.py
   ```

   It reads `videos.txt`, calls `/run` once with every video ID, and prints a markdown table:

   ```
   | Video | Caption type | Result | Auto-generated | Time (ms) | Error |
   ```

   Options: `python run_batch.py other.txt` to use another list, `--base-url URL` to test a deployed server, and `--no-titles` to skip looking up video titles.

## videos.txt

One video per line as `URL | type | note`. `type` is the caption type you expect (`auto` or `manual`); compare it with the Auto-generated column. Lines starting with `#` are ignored.

## Endpoints

- `GET /captions/{video_id}`: test one video
- `GET /run?ids=ID1,ID2,ID3`: test several videos, one result row each
- `GET /transcript/{video_id}`: full English transcript. Add `?format=text` for one plain-text string. Failures return the same `ok: false` / `error` / `detail` shape as `/captions`.

  Timed snippets (default):

  ```bash
  curl "http://127.0.0.1:8000/transcript/B3U1NDUiwSA"
  # {"video_id": "B3U1NDUiwSA", "auto_generated": false, "language": "en",
  #  "snippets": [{"start": 0.36, "duration": 5.0, "text": "A quantum computer is ..."}, ...]}
  ```

  Plain text (newlines and extra whitespace removed):

  ```bash
  curl "http://127.0.0.1:8000/transcript/B3U1NDUiwSA?format=text"
  # {"video_id": "B3U1NDUiwSA", "text": "A quantum computer is an advanced computer that uses ..."}
  ```

## Tests

```bash
python -m unittest test_run_batch test_transcript
```

## Troubleshooting

- `NotOpenSSLWarning` on macOS system Python is harmless.
- `Could not reach http://127.0.0.1:8000`: the server isn't running (step 1).
