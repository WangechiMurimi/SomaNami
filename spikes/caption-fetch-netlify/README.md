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

Locally, from this folder:

```bash
npx netlify-cli dev            # serves http://localhost:8888
python ../caption-fetch/run_batch.py ../caption-fetch/videos.txt --base-url http://localhost:8888
```

Deploy to the **throwaway** spike site (never the app's site), from this folder:

```bash
npx netlify-cli login
npx netlify-cli deploy --prod  # first run: create a new site, not the team's
python ../caption-fetch/run_batch.py ../caption-fetch/videos.txt --base-url https://<spike-site>.netlify.app
```

Run the batch at least twice, some minutes apart: blocking is often
intermittent, and one clean run doesn't prove much.

## Results

Same five videos as `../caption-fetch/videos.txt`.

| Host                          | Date       | Passed | Blocked | Notes                                     |
| ----------------------------- | ---------- | ------ | ------- | ----------------------------------------- |
| Laptop (Node 26, this port)   | 2026-11-12 | 5/5    | 0       | Auto/creator flags match the Python run   |
| Netlify Function              |            |        |         |                                           |

## Decision

_Pending the Netlify runs._ Proceed with automatic caption fetching (#62) only if
the deployed host passes consistently; otherwise make paste-transcript the main
path and treat fetching as a bonus.
