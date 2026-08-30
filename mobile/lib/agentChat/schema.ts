import { TAG_NAMES } from '../similarity/tags';
/**
 * The response shape, as a JSON schema the API enforces rather than a
 * request the prompt makes.
 *
 * The Agent kept returning something that wasn't valid JSON, which threw
 * away an answer the user had already given — the worst possible moment to
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
  required: ['reply', 'lifestyle', 'areaCards', 'anchorReason', 'preferenceTags', 'needsFollowUp', 'conversationComplete'],
  properties: {
    reply: { type: 'string' },
    /**
     * What they like about the areas they named — the answer to question 2.
     * It decides which measurements are weighted when finding similar areas,
     * so "the Common and the coffee shops" must not collapse into the same
     * thing as "the bars on a Friday".
     */
    anchorReason: nullable({ type: 'string' }),
    /**
     * True when `reply` is itself a question that must be answered before
     * the script moves on — a clarification, not the next scripted step.
     *
     * The setup UI works out which of the five questions someone is on by
     * counting their answers, so an answer to an OFF-SCRIPT question would
     * otherwise be counted as an answer to the next scripted one — and the
     * progress they see would run ahead of where they actually are. This
     * flag is how the model says "do not advance yet"; the store subtracts
     * these turns from the count (agentChatStore.followUps).
     */
    needsFollowUp: { type: 'boolean' },
    /**
     * True once all five questions are genuinely answered.
     *
     * The card used to decide this purely by counting answers, which works
     * only while the app and the model agree on where they are. They can
     * drift — the model wrapped up saying "just two quick taps left" while
     * the count still read four, so the final card never appeared and the
     * conversation dead-ended (Nick, on device 2026-08-28). Either signal
     * now finishes it.
     */
    conversationComplete: { type: 'boolean' },
    /**
     * What they like, from a fixed vocabulary (lib/similarity/tags.ts).
     * The model does the language understanding; code maps tags to
     * dimension weights, so the arithmetic stays testable and auditable.
     */
    preferenceTags: nullable({ type: 'array', items: { type: 'string', enum: TAG_NAMES } }),
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
