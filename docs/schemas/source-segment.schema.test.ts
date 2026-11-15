import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'

// The schema is the shared contract between the video and document pipelines;
// validating the published examples keeps the two from silently drifting (#60).
const here = dirname(fileURLToPath(import.meta.url))
const examplesDir = join(here, '..', 'examples')

/** Reads and parses a JSON file. */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

const schema = readJson(join(here, 'source-segment.schema.json')) as object
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validate = ajv.compile(schema)

const exampleFiles = readdirSync(examplesDir).filter((name) =>
  name.startsWith('source-segment.'),
)

describe('source-segment schema', () => {
  it('finds at least one example to validate', () => {
    expect(exampleFiles.length).toBeGreaterThan(0)
  })

  it.each(exampleFiles)('%s conforms to the schema', (fileName) => {
    const valid = validate(readJson(join(examplesDir, fileName)))
    expect(valid, ajv.errorsText(validate.errors)).toBe(true)
  })

  it('rejects a source missing required fields', () => {
    expect(validate({ id: 'source:missing-fields' })).toBe(false)
  })

  it('rejects a segment anchor that mixes page and time_range fields', () => {
    const valid = validate({
      id: 'source:bad-anchor',
      type: 'video',
      metadata: {},
      segments: [
        {
          id: 'source:bad-anchor:segment:1',
          text: 'invalid anchor',
          anchor: { type: 'page', start: 0, duration: 1 },
        },
      ],
    })
    expect(valid).toBe(false)
  })
})
