import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, 'source-segment.schema.json');
const examplesDir = join(here, '..', 'examples');

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const exampleFiles = readdirSync(examplesDir).filter((name) =>
  name.startsWith('source-segment.'),
);

describe('source-segment schema', () => {
  it('finds at least one example to validate', () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  it.each(exampleFiles)('%s conforms to the schema', (fileName) => {
    const example = JSON.parse(readFileSync(join(examplesDir, fileName), 'utf-8'));
    const valid = validate(example);
    expect(valid, ajv.errorsText(validate.errors)).toBe(true);
  });

  it('rejects a source missing required fields', () => {
    const valid = validate({ id: 'source:missing-fields' });
    expect(valid).toBe(false);
  });

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
    });
    expect(valid).toBe(false);
  });
});
