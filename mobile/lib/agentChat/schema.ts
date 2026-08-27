/**
 * The response shape, as a JSON schema the API enforces rather than a
 * request the prompt makes.
 *
 * The Agent kept returning something that wasn't valid JSON, which threw
 * away an answer the user had already spoken — the worst possible moment to
 * lose one (Nick, 2026-08-26). Structured outputs makes the shape a
 * guarantee: `output_config: { format: { type: 'json_schema', schema } }`.
 *
 * Two constraints from the API shape the schema below:
 *
 * 1. Every object must set `additionalProperties: false`. That rules out the
 *    old `areaCards` shape — a free-form map of area name to verdict — so
 *    areas come back as a LIST of {name, verdict} and are folded back into a
 *    map by the parser. The stored profile shape is unchanged.
 *
 * 2. Optional fields are expressed as nullable-and-required rather than
 *    omitted, because a strict schema may insist every declared property is
 *    present. The prompt still asks the model to leave things it is guessing
 *    at as null, and the parser drops nulls — so "unknown" survives the round
 *    trip either way.
 */

const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const nullableEnum = (values: string[]) => nullable({ type: 'string', enum: values });

const LIFESTYLE_PROPERTIES = {
  greenSpace: nullableEnum(['essential', 'nice', 'unimportant']),
  streetVibe: nullableEnum(['buzzy', 'quiet', 'village']),
  nightsOut: nullableEnum(['frequent', 'regular', 'rarely']),
  schoolsPriority: nullableEnum(['now', 'someday', 'no']),
  safetyPriority: nullableEnum(['veryimportant', 'important', 'flexible']),
  zone1Ok: nullable({ type: 'boolean' }),
  dealbreakers: nullable({ type: 'array', items: { type: 'string' } }),
  freeText: nullable({ type: 'string' }),
};

export const AGENT_TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'lifestyle', 'areaCards'],
  properties: {
    reply: { type: 'string' },
    lifestyle: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(LIFESTYLE_PROPERTIES),
      properties: LIFESTYLE_PROPERTIES,
    },
    areaCards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'verdict'],
        properties: {
          name: { type: 'string' },
          verdict: { type: 'string', enum: ['love', 'hate'] },
        },
      },
    },
  },
} as const;
