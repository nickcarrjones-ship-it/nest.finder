import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatTurn } from '../parse';

describe('parseChatTurn — the model will not always behave', () => {
  it('parses a clean turn', () => {
    const r = parseChatTurn(
      '{"reply":"Got it.","lifestyle":{"streetVibe":"quiet"},"areaCards":{"Peckham":"love"}}',
    );
    assert.equal(r?.reply, 'Got it.');
    assert.equal(r?.lifestyle.streetVibe, 'quiet');
    assert.equal(r?.areaCards.Peckham, 'love');
  });

  it('recovers JSON wrapped in prose or a code fence', () => {
    const r = parseChatTurn('Sure!\n```json\n{"reply":"Noted.","lifestyle":{},"areaCards":{}}\n```');
    assert.equal(r?.reply, 'Noted.');
  });

  it('returns null rather than throwing on garbage', () => {
    assert.equal(parseChatTurn('not json at all'), null);
  });

  it('returns null when there is no usable reply', () => {
    assert.equal(parseChatTurn('{"reply":"   ","lifestyle":{}}'), null);
  });

  it('drops enum values it does not recognise', () => {
    const r = parseChatTurn('{"reply":"ok","lifestyle":{"streetVibe":"vibey","nightsOut":"rarely"}}');
    assert.equal(r?.lifestyle.streetVibe, undefined);
    assert.equal(r?.lifestyle.nightsOut, 'rarely');
  });

  describe('zone1Ok decides whether Zone 1 areas are dropped, so it must be a real boolean', () => {
    it('keeps a genuine true and a genuine false', () => {
      assert.equal(parseChatTurn('{"reply":"ok","lifestyle":{"zone1Ok":true}}')?.lifestyle.zone1Ok, true);
      assert.equal(parseChatTurn('{"reply":"ok","lifestyle":{"zone1Ok":false}}')?.lifestyle.zone1Ok, false);
    });

    it('ignores truthy stand-ins rather than reading them as yes', () => {
      for (const bad of ['"maybe"', '"true"', '1', 'null', '"yes"']) {
        const r = parseChatTurn(`{"reply":"ok","lifestyle":{"zone1Ok":${bad}}}`);
        assert.equal(r?.lifestyle.zone1Ok, undefined, `zone1Ok should be dropped for ${bad}`);
      }
    });
  });

  it('accepts the two button-collected fields only in their exact forms', () => {
    const good = parseChatTurn('{"reply":"ok","lifestyle":{"riverSide":"south","socialCircle":"E"}}');
    assert.equal(good?.lifestyle.riverSide, 'south');
    assert.equal(good?.lifestyle.socialCircle, 'E');

    const bad = parseChatTurn('{"reply":"ok","lifestyle":{"riverSide":"South","socialCircle":"east"}}');
    assert.equal(bad?.lifestyle.riverSide, undefined);
    assert.equal(bad?.lifestyle.socialCircle, undefined);
  });

  it('keeps only love/hate verdicts on area cards', () => {
    const r = parseChatTurn('{"reply":"ok","areaCards":{"Brixton":"love","Hackney":"maybe","":"hate"}}');
    assert.deepEqual(r?.areaCards, { Brixton: 'love' });
  });
});

describe('areaCards — both the list and the map shape', () => {
  it('reads the list shape that structured outputs requires', () => {
    const r = parseChatTurn(
      '{"reply":"ok","areaCards":[{"name":"Brixton","verdict":"hate"},{"name":"Nunhead","verdict":"love"}]}',
    );
    assert.deepEqual(r?.areaCards, { Brixton: 'hate', Nunhead: 'love' });
  });

  it('still reads the older map shape, so the schema can be turned off', () => {
    const r = parseChatTurn('{"reply":"ok","areaCards":{"Peckham":"love"}}');
    assert.deepEqual(r?.areaCards, { Peckham: 'love' });
  });

  it('drops malformed entries in the list rather than failing the turn', () => {
    const r = parseChatTurn(
      '{"reply":"ok","areaCards":[{"name":"Brixton","verdict":"maybe"},{"name":"","verdict":"love"},null,{"name":"Ladywell","verdict":"love"}]}',
    );
    assert.deepEqual(r?.areaCards, { Ladywell: 'love' });
  });

  it('treats nulls from the schema as "not known yet"', () => {
    const r = parseChatTurn('{"reply":"ok","lifestyle":{"streetVibe":null,"zone1Ok":null,"nightsOut":"rarely"}}');
    assert.equal(r?.lifestyle.streetVibe, undefined);
    assert.equal(r?.lifestyle.zone1Ok, undefined);
    assert.equal(r?.lifestyle.nightsOut, 'rarely');
  });
});

describe('needsFollowUp — the Agent saying "do not advance yet"', () => {
  const base = {
    reply: 'The Common side or nearer the Junction?',
    lifestyle: {}, areaCards: [],
  };

  it('is read when the model sets it', () => {
    const out = parseChatTurn(JSON.stringify({ ...base, needsFollowUp: true }));
    assert.equal(out?.needsFollowUp, true);
  });

  it('defaults to false rather than undefined', () => {
    // The card branches on it. Undefined would be falsy anyway, but an
    // explicit false is what the rest of the code expects to read.
    assert.equal(parseChatTurn(JSON.stringify(base))?.needsFollowUp, false);
  });

  it('is false for anything that is not literally true', () => {
    // A model returning "true" as a string must not hold the script.
    assert.equal(parseChatTurn(JSON.stringify({ ...base, needsFollowUp: 'true' }))?.needsFollowUp, false);
    assert.equal(parseChatTurn(JSON.stringify({ ...base, needsFollowUp: 1 }))?.needsFollowUp, false);
  });
});
