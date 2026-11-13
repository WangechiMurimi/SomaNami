// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CaptionError,
  extractApiKey,
  parseTimedText,
  pickTrack,
  readCaptionTracks,
  testVideo,
} from './fetch-captions.ts'

const VIDEO_ID = 'RYT08CaYq6A'
const WATCH_HTML =
  '<script>var cfg = {"INNERTUBE_API_KEY": "key_123"};</script>'
const CAPTION_XML =
  '<?xml version="1.0"?><transcript>' +
  '<text start="0.5" dur="2.1">Hello &amp;#39;world&amp;#39;</text>' +
  '<text start="2.6" dur="1.4">  line\ntwo  </text>' +
  '<text start="4" dur="1"></text>' +
  '</transcript>'

const playerWith = (captionTracks: unknown[]) => ({
  playabilityStatus: { status: 'OK' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks } },
})

const track = (languageCode: string, kind?: string) => ({
  baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=${languageCode}${kind ? `&kind=${kind}` : ''}`,
  languageCode,
  kind,
})

interface Routes {
  watch?: () => Response
  player?: () => Response
  captions?: () => Response
}

/** A fetch that answers YouTube's three endpoints from fixtures and records calls. */
function fakeYouTube(routes: Routes = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/watch?v='))
      return (routes.watch ?? (() => new Response(WATCH_HTML)))()
    if (url.includes('/youtubei/v1/player')) {
      return (
        routes.player ?? (() => Response.json(playerWith([track('en', 'asr')])))
      )()
    }
    if (url.includes('/api/timedtext')) {
      return (routes.captions ?? (() => new Response(CAPTION_XML)))()
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const failureOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error as CaptionError
  }
  throw new Error('Expected a CaptionError')
}

describe('extractApiKey', () => {
  it('reads the Innertube key from a watch page', () => {
    expect(extractApiKey(WATCH_HTML)).toBe('key_123')
  })

  it('reports a captcha page as an IP block', () => {
    expect(
      failureOf(() => extractApiKey('<div class="g-recaptcha"></div>')).name,
    ).toBe('IpBlocked')
  })

  it('reports an unrecognised page as unparsable, not as a block', () => {
    expect(failureOf(() => extractApiKey('<html></html>')).name).toBe(
      'YouTubeDataUnparsable',
    )
  })
})

describe('readCaptionTracks', () => {
  it.each([
    ['LOGIN_REQUIRED', 'Sign in to confirm you’re not a bot', 'RequestBlocked'],
    [
      'LOGIN_REQUIRED',
      'This video may be inappropriate for some users.',
      'AgeRestricted',
    ],
    ['ERROR', 'This video is unavailable', 'VideoUnavailable'],
    ['UNPLAYABLE', 'Live stream offline', 'VideoUnplayable'],
  ])('maps %s "%s" to %s', (status, reason, expected) => {
    const error = failureOf(() =>
      readCaptionTracks({ playabilityStatus: { status, reason } }),
    )
    expect(error.name).toBe(expected)
  })

  it('reports a playable video without tracks as having captions disabled', () => {
    expect(
      failureOf(() =>
        readCaptionTracks({ playabilityStatus: { status: 'OK' } }),
      ).name,
    ).toBe('TranscriptsDisabled')
  })
})

describe('pickTrack', () => {
  it('prefers creator captions over auto-generated ones', () => {
    expect(pickTrack([track('en', 'asr'), track('en')]).kind).toBeUndefined()
  })

  it('falls back to auto-generated English', () => {
    expect(pickTrack([track('fr'), track('en', 'asr')]).kind).toBe('asr')
  })

  it('names the available languages when there is no English track', () => {
    const error = failureOf(() => pickTrack([track('fr'), track('de')]))
    expect(error.name).toBe('NoTranscriptFound')
    expect(error.message).toContain('fr, de')
  })
})

describe('parseTimedText', () => {
  it('decodes double-encoded entities, flattens whitespace and drops empty lines', () => {
    expect(parseTimedText(CAPTION_XML)).toEqual([
      { text: "Hello 'world'", start: 0.5, duration: 2.1 },
      { text: 'line two', start: 2.6, duration: 1.4 },
    ])
  })

  it('strips formatting tags and turns non-breaking spaces into spaces', () => {
    const xml =
      '<text start="1" dur="1">&lt;i&gt;so&lt;/i&gt;&amp;nbsp;cool</text>'
    expect(parseTimedText(xml)[0]?.text).toBe('so cool')
  })
})

describe('testVideo', () => {
  it('reports a fetched transcript in the Python spike’s shape', async () => {
    const { fetch, calls } = fakeYouTube()

    const result = await testVideo(VIDEO_ID, { fetch })

    expect(result).toMatchObject({
      video_id: VIDEO_ID,
      ok: true,
      snippets: 2,
      auto_generated: true,
      language: 'en',
      first_line: "Hello 'world'",
    })
    const player = calls.find((call) => call.url.includes('/player'))
    expect(player?.url).toContain('key=key_123')
    expect(JSON.parse(String(player?.init?.body))).toMatchObject({
      videoId: VIDEO_ID,
      context: { client: { clientName: 'ANDROID' } },
    })
  })

  it('accepts the EU consent page once and retries with the cookie', async () => {
    let watchCalls = 0
    const { fetch, calls } = fakeYouTube({
      watch: () =>
        new Response(
          ++watchCalls === 1
            ? '<form action="https://consent.youtube.com/s"><input name="v" value="cb.123"></form>'
            : WATCH_HTML,
        ),
    })

    expect((await testVideo(VIDEO_ID, { fetch })).ok).toBe(true)
    const retry = calls.filter((call) => call.url.includes('/watch'))[1]
    expect(new Headers(retry?.init?.headers).get('Cookie')).toBe(
      'CONSENT=YES+cb.123',
    )
  })

  it.each([
    [
      'watch page 429',
      { watch: () => new Response('', { status: 429 }) },
      'IpBlocked',
    ],
    [
      'player 429',
      { player: () => new Response('', { status: 429 }) },
      'IpBlocked',
    ],
    [
      'empty caption body',
      { captions: () => new Response('') },
      'RequestBlocked',
    ],
    [
      'PO-token caption URL',
      {
        player: () =>
          Response.json(
            playerWith([
              {
                ...track('en', 'asr'),
                baseUrl: `${track('en').baseUrl}&exp=xpe`,
              },
            ]),
          ),
      },
      'PoTokenRequired',
    ],
  ] as const)(
    'counts a %s as a block by this host',
    async (_label, routes, expected) => {
      const result = await testVideo(VIDEO_ID, {
        fetch: fakeYouTube(routes).fetch,
      })

      expect(result).toMatchObject({
        ok: false,
        error: expected,
        blocked: true,
      })
    },
  )

  it('does not count a video without captions as a block', async () => {
    const { fetch } = fakeYouTube({
      player: () => Response.json({ playabilityStatus: { status: 'OK' } }),
    })

    expect(await testVideo(VIDEO_ID, { fetch })).toMatchObject({
      ok: false,
      error: 'TranscriptsDisabled',
      blocked: false,
    })
  })

  it('reports a request that outlives its budget as a timeout', async () => {
    const hang = (async (_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        )
      })) as typeof globalThis.fetch

    expect(
      await testVideo(VIDEO_ID, { fetch: hang, timeoutMs: 20 }),
    ).toMatchObject({
      ok: false,
      error: 'Timeout',
      blocked: false,
    })
  })
})
