import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from '../extractText';

describe('extractText — content is a list of blocks, not a single one', () => {
  it('reads a plain text response', () => {
    assert.equal(extractText({ content: [{ type: 'text', text: 'hello' }] }), 'hello');
  });

  it('finds the text even when another block comes first', () => {
    // The failure that produced "AI proxy returned no text content" on
    // device: content[0] was not the text block.
    const data = {
      content: [
        { type: 'thinking', thinking: 'working it out' },
        { type: 'text', text: '{"reply":"hi"}' },
      ],
    };
    assert.equal(extractText(data), '{"reply":"hi"}');
  });

  it('joins several text blocks in order', () => {
    const data = { content: [{ type: 'text', text: '{"rep' }, { type: 'text', text: 'ly":"hi"}' }] };
    assert.equal(extractText(data), '{"reply":"hi"}');
  });

  it('returns null when there is genuinely no text', () => {
    assert.equal(extractText({ content: [] }), null);
    assert.equal(extractText({ content: [{ type: 'thinking', thinking: 'x' }] }), null);
    assert.equal(extractText({ content: [{ type: 'text', text: '   ' }] }), null);
  });

  it('never throws on a shape it does not expect', () => {
    for (const bad of [null, undefined, {}, { content: 'nope' }, { content: [null, 3, 'x'] }]) {
      assert.equal(extractText(bad), null);
    }
  });
});
