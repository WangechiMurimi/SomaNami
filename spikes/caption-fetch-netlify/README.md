# Spike: caption fetching from Netlify Functions (#59)

The Python spike in [`../caption-fetch`](../caption-fetch) showed captions can be
fetched **from a laptop**. This spike answers the question #59 exists for: does
YouTube serve captions to **our production host**, a Netlify Function, or does it
block that host?

It ports the fetch `youtube-transcript-api` 1.x performs (watch page → Innertube
player with the Android client → timedtext XML) to TypeScript with no
dependencies, and serves the same routes and response shape as the Python
spike, so `run_batch.py` works against either.

## Routes

- `GET /captions/:id`: one video
- `GET /run?ids=ID1,ID2`: up to 10 videos, fetched in parallel; adds `passed`,
  `blocked`, `total` and `host` (region and Node version)

Every failure has a name matching the Python library's exceptions. `blocked:
true` marks the ones that mean YouTube refused the host (`IpBlocked`,
`RequestBlocked`, `PoTokenRequired`) rather than a problem with the video.

## Run

Tests (fixtures only, no network), from the repository root:

```bash
npx vitest run spikes/caption-fetch-netlify
```

The Netlify CLI treats the nearest git repository as the project, so run it
from a copy **outside the repo**. From inside, it picks up the app's
`netlify.toml` and functions, and edits the repo's `.gitignore`:

```bash
SPIKE=$(mktemp -d)/caption-spike
rsync -a --exclude .netlify --exclude '*.test.ts' spikes/caption-fetch-netlify/ "$SPIKE/"
cd "$SPIKE"
npx netlify-cli dev --offline   # serves http://localhost:8888
```

In another terminal, from `spikes/caption-fetch`:

```bash
python3 run_batch.py videos.txt --base-url http://localhost:8888
```

Deploy to a **new, throwaway** site (never the app's site), from the copy:

```bash
npx netlify-cli login
npx netlify-cli sites:create --name somanami-caption-spike-<suffix>
npx netlify-cli deploy --prod
python3 run_batch.py videos.txt --base-url https://somanami-caption-spike-<suffix>.netlify.app
```

Run the batch at least twice, some minutes apart: blocking is often
intermittent, and one clean run doesn't prove much.

## Results

Same five videos as `../caption-fetch/videos.txt`.

| Host                          | Date       | Passed | Blocked | Notes                                     |
| ----------------------------- | ---------- | ------ | ------- | ----------------------------------------- |
| Laptop (Node 26, this port)   | 2026-11-12 | 5/5    | 0       | Auto/creator flags match the Python run   |
| Laptop, `netlify dev`         | 2026-11-12 | 5/5    | 0       | Routing and bundling confirmed, ~0.9 s each |
| Netlify Function, run 1       | 2026-11-12 22:03Z | 0/5 | 5     | All `RequestBlocked`, ~1.1 s each         |
| Netlify Function, run 2       | 2026-11-12 22:08Z | 0/5 | 5     | All `RequestBlocked`, ~1.1 s each         |
| Laptop control                | 2026-11-12 22:09Z | 5/5 | 0     | Same code, same minute as run 2           |

The function ran in AWS `us-east-2` on Node 24 (Netlify's default). YouTube
served the watch page normally; the Innertube player then answered every
video with `LOGIN_REQUIRED` and "Sign in to confirm you’re not a bot". The same
code passed from the laptop a minute later, so the block depends on the host's
IP address, not on the code or the videos.

## Decision

**Automatic caption fetching from our host is not viable. Paste-transcript
becomes the main path for #62**, not a fallback. The #58 acceptance criteria
need updating to match.

Ways around the block, and why none is worth it now:

- **Proxy through residential IPs:** paid, against YouTube's terms, and it
  breaks whenever the proxy pool gets flagged.
- **Fetch from the learner's browser:** YouTube doesn't allow cross-origin
  requests to these endpoints, so a normal web page can't make them.
- **YouTube Data API `captions.download`:** only works with OAuth as the
  video's owner, not for arbitrary public videos.

Still untested from Netlify: video metadata (title, duration, thumbnail) via
oEmbed or the Data API for #61. That's a separate request type and may not be
blocked. Check it before #61 relies on it.
