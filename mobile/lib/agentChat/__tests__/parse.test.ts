import { describe, it } from 'node:test';
import { clarifyQuestion } from '../clarify';
import assert from 'node:assert/strict';
import { parseChatTurn, endOnUser, weaveReply } from '../parse';

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

describe('clarifyQuestion — the app asks, so there is nothing to wait for', () => {
  it('names the parts a Londoner would name', () => {
    const q = clarifyQuestion(['Clapham Common', 'Clapham High Street', 'Clapham Junction']);
    assert.match(q, /Common/);
    assert.match(q, /Junction/);
    assert.doesNotMatch(q, /Clapham Common/, 'the shared word is said once, not three times');
  });

  it('drops the shared word from either end', () => {
    // "Clapham Common" but "North Ealing" — the stem moves.
    const q = clarifyQuestion(['Ealing Broadway', 'North Ealing', 'South Ealing']);
    assert.match(q, /Broadway/);
    assert.doesNotMatch(q, /North Ealing/, 'said as "North", not "North Ealing"');
  });

  it('offers "all of it", because that is a real answer', () => {
    // The engine handles several anchors; forcing a single choice would
    // throw away something the user actually meant.
    assert.match(clarifyQuestion(['Clapham Common', 'Clapham South']), /all of it/i);
  });

  it('checks rather than assumes when only one place matches', () => {
    // "Liverpool" resolving to Liverpool Street is the dangerous case.
    const q = clarifyQuestion(['Liverpool Street']);
    assert.match(q, /Liverpool Street/);
    assert.match(q, /London/, 'makes clear we mean the London one');
  });

  it('keeps the list short enough to hold in your head', () => {
    const q = clarifyQuestion(['A X', 'B X', 'C X', 'D X', 'E X']);
    assert.ok(!q.includes('E'), 'five options are not read out in full');
  });
});

describe('conversationComplete — knowing when to show the last two taps', () => {
  const base = { reply: 'Thanks — just two quick taps left.', lifestyle: {}, areaCards: [] };

  it('is read when the model says it is finished', () => {
    const out = parseChatTurn(JSON.stringify({ ...base, conversationComplete: true }));
    assert.equal(out?.conversationComplete, true);
  });

  it('defaults to false, so an old reply never ends the conversation early', () => {
    assert.equal(parseChatTurn(JSON.stringify(base))?.conversationComplete, false);
  });

  it('is false for anything that is not literally true', () => {
    // A string "yes" must not finish a conversation that is still going.
    assert.equal(
      parseChatTurn(JSON.stringify({ ...base, conversationComplete: 'yes' }))?.conversationComplete,
      false,
    );
  });
});

describe('a thread sent to the model must end on the user', () => {
  const u = (t: string) => ({ role: 'user' as const, text: t });
  const a = (t: string) => ({ role: 'assistant' as const, text: t });

  // The exact 400: the setup screen shows the next scripted question the
  // instant an answer is sent, so the thread ends on the assistant — a
  // last-assistant-turn prefill, which Sonnet 5 rejects.
  it('drops the question we have just asked but nobody has answered', () => {
    const got = endOnUser([u('Clapham'), a('What is it about there that you like?')]);
    assert.deepEqual(got.map((m) => m.text), ['Clapham']);
  });

  it('drops a whole run of trailing assistant turns', () => {
    const got = endOnUser([u('Clapham'), a('Which one?'), a('Also, evenings?')]);
    assert.deepEqual(got.map((m) => m.text), ['Clapham']);
  });

  it('leaves a thread that already ends on the user alone', () => {
    const thread = [u('Clapham'), a('And evenings?'), u('Quiet ones')];
    assert.deepEqual(endOnUser(thread), thread);
  });

  it('returns nothing when the user has not spoken yet', () => {
    assert.deepEqual(endOnUser([a('Hi, which areas do you love?')]), []);
  });
});

describe('weaveReply — one paragraph, no visible seam', () => {
  // The separate "not from our data" box is gone (Nick, 2026-09-09 — it
  // "looked awful"). This is what replaced it: one string, so there is
  // nothing left in the render path that COULD show a seam.
  it('joins answer and unmeasured into one string', () => {
    assert.equal(
      weaveReply({ answer: 'Balham is south of the river.', unmeasured: "It's known for its high street." }),
      "Balham is south of the river. It's known for its high street.",
    );
  });

  it('is just the answer when there is nothing beyond the brief', () => {
    assert.equal(weaveReply({ answer: 'Balham is south of the river.', unmeasured: null }), 'Balham is south of the river.');
  });

  it('is just the unmeasured half when the brief had nothing at all', () => {
    assert.equal(weaveReply({ answer: '', unmeasured: 'General knowledge only.' }), 'General knowledge only.');
  });

  it('treats a blank unmeasured the same as none', () => {
    assert.equal(weaveReply({ answer: 'Balham is south of the river.', unmeasured: '   ' }), 'Balham is south of the river.');
  });

  it('is empty when both are empty, never a stray space', () => {
    assert.equal(weaveReply({ answer: '', unmeasured: null }), '');
  });
});
