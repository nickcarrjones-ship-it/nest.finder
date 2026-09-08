import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areaAskedAbout, briefForPrompt, buildAreaBrief } from '../agentChat/areaBrief';
import type { Profile } from '../types';

const profile = (over: Partial<Profile> = {}): Profile => ({ members: [], ...over });

describe('spotting the area someone is asking about', () => {
  it('finds a name in an ordinary question', () => {
    assert.equal(areaAskedAbout("I've been thinking about Peckham Rye lately"), 'Peckham Rye');
  });

  it('understands the name a Londoner would actually use', () => {
    // Nobody asks about "Fulham Broadway" — they ask about Fulham, which is
    // not itself an area we hold. Matching the first word of a compound
    // name is what makes the obvious question work.
    assert.equal(areaAskedAbout('what about Fulham?'), 'Fulham Broadway');
    assert.equal(areaAskedAbout('how about Peckham?'), 'Peckham Rye');
  });

  it('does not read ordinary English as a place name', () => {
    // "Covent Garden" ends in a word people use about gardens; "Green Park"
    // in one they use about parks. Reading either as a question about an
    // area would answer something nobody asked.
    assert.equal(areaAskedAbout('somewhere quieter with a garden'), null);
    assert.equal(areaAskedAbout('we love parks and green space'), null);
  });

  it('answers a loosely-named place rather than saying nothing', () => {
    // "Battersea" matches Battersea Park and Battersea Power Station, and
    // returning null meant the person got a card offering to add Battersea
    // to their areas with no reply beside it (Nick, 2026-09-07). They are
    // the same locality; answering about one beats answering about neither,
    // and the reply names which one so a wrong pick is correctable.
    assert.equal(areaAskedAbout('what about Battersea?'), 'Battersea Park');
    assert.ok(areaAskedAbout('what do you think of Clapham?')?.startsWith('Clapham'));
  });

  it('prefers the longer name, so a specific place is not swallowed', () => {
    // "Clapham Common" must not be read as "Clapham", which resolves
    // elsewhere entirely — the High Street end, not the Common.
    const found = areaAskedAbout('how does Clapham Common compare?');
    assert.equal(found, 'Clapham Common');
  });

  it('returns nothing when no area is named', () => {
    assert.equal(areaAskedAbout('we want somewhere quieter with a garden'), null);
  });
});

describe('the brief is measured, not remembered', () => {
  it('states the river side and Zone 1 as facts', () => {
    const b = buildAreaBrief('Greenwich', profile());
    assert.equal(b.riverSide, 'south');
    assert.equal(b.inZone1, false);
  });

  it('reports what we hold nothing on rather than skipping it', () => {
    // A model told what is missing is far less likely to invent it.
    const b = buildAreaBrief('Greenwich', profile());
    assert.ok(Array.isArray(b.missing));
  });

  it('names the traits an area is closest on, in English', () => {
    const b = buildAreaBrief('Balham', profile({ areaCards: { Earlsfield: 'love' } }));
    const match = b.resemblance[0];
    assert.ok(match.score > 0 && match.score <= 1);
    // Readable phrases, not dimension keys — this text goes to the model
    // and can end up close to what the household reads.
    assert.ok(match.traits.length > 0);
    assert.equal(/[A-Z_]{4,}/.test(match.traits), false);
  });

  it('compares against every area they said they love', () => {
    const b = buildAreaBrief('Balham', profile({ areaCards: { Tooting: 'love', Earlsfield: 'love' } }));
    // Names come back RESOLVED — "Tooting" is stored loosely but the engine
    // works on the canonical station, so the comparison is against the real
    // place rather than a name we half-matched.
    assert.equal(b.resemblance.length, 2);
    assert.ok(b.resemblance.some((r) => r.anchor === 'Earlsfield'));
    assert.ok(b.resemblance.some((r) => r.anchor.startsWith('Tooting')));
    // Best match first — that's the one worth naming in an answer.
    for (let i = 1; i < b.resemblance.length; i += 1) {
      assert.ok(b.resemblance[i - 1].score >= b.resemblance[i].score);
    }
  });

  it('never compares an area to itself', () => {
    const b = buildAreaBrief('Tooting', profile({ areaCards: { Tooting: 'love' } }));
    assert.equal(b.resemblance.find((r) => r.anchor === 'Tooting'), undefined);
  });
});

describe('conflicts are computed, never left to the model', () => {
  // "You told me south of the river" is either true or it isn't. A model
  // hedging that is worse than useless, so the app decides it.
  it('catches the wrong side of the river', () => {
    const b = buildAreaBrief('Camden Town', profile({ lifestyle: { riverSide: 'south' } }));
    assert.ok(b.conflicts.some((c) => c.includes('river')));
  });

  it('says nothing about the river when they are happy either side', () => {
    const b = buildAreaBrief('Camden Town', profile({ lifestyle: { riverSide: 'either' } }));
    assert.equal(b.conflicts.some((c) => c.includes('river')), false);
  });

  it('catches an area they had already ruled out themselves', () => {
    const b = buildAreaBrief('Croydon', profile({ areaCards: { Croydon: 'hate' } }));
    assert.ok(b.conflicts.some((c) => c.includes('ruled this area out')));
  });

  it('finds no conflict when nothing was ever ruled out', () => {
    assert.deepEqual(buildAreaBrief('Greenwich', profile()).conflicts, []);
  });
});

describe('what the model is handed', () => {
  it('leads the prompt with the area and flags conflicts in capitals', () => {
    const text = briefForPrompt(
      buildAreaBrief('Camden Town', profile({ lifestyle: { riverSide: 'south' } })),
    );
    assert.ok(text.startsWith('AREA: Camden Town'));
    assert.ok(text.includes('CONFLICTS WITH WHAT THEY TOLD US'));
  });

  it('is plain lines, not JSON — it is being read, not parsed', () => {
    const text = briefForPrompt(buildAreaBrief('Greenwich', profile()));
    assert.equal(text.trim().startsWith('{'), false);
    assert.ok(text.includes('Zone 1:'));
  });
});

describe('schools travel with the brief', () => {
  // area-schools.json is the largest data asset in the app and, until
  // 2026-09-07, exactly one file read it: the panel on the area card. The
  // Agent could not answer "what are the schools like in Angel?" despite
  // the answer sitting on the card the person had just been looking at.
  it('names real schools with their real judgements', () => {
    const b = buildAreaBrief('Angel', profile());
    assert.ok(b.schools.length > 0);
    const first = b.schools[0];
    assert.ok(first.name.length > 0);
    assert.equal(typeof first.distanceKm, 'number');
    // State schools carry a real judgement; independents carry none, and
    // that is the honest state rather than a gap to fill.
    assert.ok(first.rating ? first.rating.headline.length > 0 : first.independent === true);
  });

  it('quotes the judgement verbatim across all three Ofsted eras', () => {
    // Since September 2025 "the rating" is three incompatible things: a
    // full grade, a check that only confirms an older one ("School remains
    // Good"), and a report card with no overall word. Normalising them
    // would state something Ofsted itself declined to say.
    const text = briefForPrompt(buildAreaBrief('Angel', profile()));
    assert.ok(/Schools within reach:/.test(text));
    assert.ok(/remains|Outstanding|Good|standard/.test(text));
  });

  it('admits when we hold no schools for an area, rather than staying silent', () => {
    // 22 of 585 areas have no rated mainstream school within reach. Silence
    // would let the model reach for what it thinks it remembers.
    const b = buildAreaBrief('Dulwich Village', profile());
    assert.equal(b.schools.length, 0);
    assert.ok(b.missing.includes('schools near this area'));
  });

  it('caps how many travel, so the brief stays an answer not a directory', () => {
    for (const area of ['Angel', 'Tooting Bec', 'Brixton']) {
      assert.ok(buildAreaBrief(area, profile()).schools.length <= 4);
    }
  });

  it('never derives a score from them', () => {
    // "A number nobody can check is exactly the kind of claim this project
    // exists to avoid" — the brief carries the schools themselves, never a
    // rating out of ten for the model to repeat.
    const b = buildAreaBrief('Angel', profile());
    assert.equal('schoolsScore' in b, false);
    assert.equal(briefForPrompt(b).includes('/10'), false);
  });
});

describe('which schools matter', () => {
  // "Schools" is really two questions. A household with a four-year-old and
  // one with a fourteen-year-old want opposite answers about the same
  // street, and the app could not tell them apart — it held the nearest
  // three by distance, which with primaries ~5x denser meant almost only
  // primaries, for half of London (Nick, 2026-09-07).
  it('now holds secondaries, not just the denser primaries', () => {
    const b = buildAreaBrief('Angel', profile());
    const phases = new Set(b.schools.map((s) => s.phase));
    assert.ok(phases.has('Secondary'), 'no secondary school reached the brief');
  });

  it('leads with the phase they said matters', () => {
    const b = buildAreaBrief('Angel', profile({
      lifestyle: { schoolsPriority: 'now', schoolPhase: 'secondary' },
    }));
    assert.equal(b.schools[0].phase, 'Secondary');
  });

  it('asks which phase only when schools are on their mind', () => {
    // A question with no consequence is worse than no question.
    const raised = buildAreaBrief('Angel', profile({ lifestyle: { schoolsPriority: 'now' } }));
    assert.equal(raised.schoolPhaseUnknown, true);

    const neverMentioned = buildAreaBrief('Angel', profile());
    assert.equal(neverMentioned.schoolPhaseUnknown, false);

    const notAFactor = buildAreaBrief('Angel', profile({ lifestyle: { schoolsPriority: 'no' } }));
    assert.equal(notAFactor.schoolPhaseUnknown, false);
  });

  it('stops asking once they have answered', () => {
    const answered = buildAreaBrief('Angel', profile({
      lifestyle: { schoolsPriority: 'now', schoolPhase: 'both' },
    }));
    assert.equal(answered.schoolPhaseUnknown, false);
  });
});

describe('fee-paying schools', () => {
  const withFees = { schoolsPriority: 'now' as const, considerFeePaying: true };

  it('stays out until they say fees are on the table', () => {
    // Putting Alleyn's in front of someone who never said they would
    // consider fees reads as an assumption about what they can afford.
    const never = buildAreaBrief('East Dulwich', profile({ lifestyle: { schoolsPriority: 'now' } }));
    assert.equal(never.schools.some((s) => s.independent), false);
  });

  it('appears once they have said yes', () => {
    const asked = buildAreaBrief('East Dulwich', profile({ lifestyle: withFees }));
    assert.ok(asked.schools.some((s) => s.independent));
  });

  it('never claims an Ofsted grade for one', () => {
    // ISI inspects most independents and does not grade at all — it reports
    // whether each standard is met — so there is no Outstanding/Good
    // equivalent. Inventing one would be the unverifiable claim this data
    // was built to avoid.
    const b = buildAreaBrief('East Dulwich', profile({ lifestyle: withFees }));
    for (const s of b.schools.filter((x) => x.independent)) {
      assert.equal(s.rating, null);
    }
    const text = briefForPrompt(b);
    if (b.schools.some((s) => s.independent)) {
      assert.ok(/does not grade/.test(text), 'the brief must say why there is no grade');
    }
  });
});

describe('every area can answer a secondary-school question', () => {
  it('reaches past the radius rather than saying nothing', () => {
    // 95 areas had no secondary within 1.2km. "The nearest is 2km away, in
    // the next place along" is a useful answer; silence is not. The
    // distance always travels with it, so nothing is hidden.
    const areas = ['Angel', 'West Dulwich', 'Chessington North', 'Upminster', 'Hampton'];
    for (const a of areas) {
      const b = buildAreaBrief(a, profile({ lifestyle: { schoolsPriority: 'now' } }));
      const hasSecondary = b.schools.some((s) => s.phase === 'Secondary' || s.phase === 'All-through');
      assert.ok(hasSecondary, `${a} has no secondary school in its brief`);
    }
  });
});

describe('what it costs, and whether they can afford it', () => {
  const buying = (maxPrice: number): Profile => profile({
    propertyCriteria: {
      channel: 'buy', minPrice: 150_000, maxPrice,
      minBeds: 2, maxBeds: 3, minBaths: 1, maxBaths: 2,
      tenures: [], features: [], setAt: 1,
    },
  });

  it('reports the median sold price with its sample size', () => {
    const b = buildAreaBrief('Tooting Broadway', profile());
    assert.ok(b.prices);
    assert.ok(b.prices.median > 100_000);
    // The count travels so the model can be told 30 sales is not 700.
    assert.ok(b.prices.sales >= 30);
  });

  it('flags an area that costs multiples of their budget', () => {
    // The whole point: until now a £500k budget could be shown
    // Knightsbridge and nothing said a word.
    const b = buildAreaBrief('Knightsbridge', buying(600_000));
    assert.ok(b.conflicts.some((c) => c.includes('budget')));
  });

  it('says nothing when the area is within budget', () => {
    const b = buildAreaBrief('Tooting Broadway', buying(900_000));
    assert.equal(b.conflicts.some((c) => c.includes('budget')), false);
  });

  it('never compares a sale price to a monthly rent', () => {
    // A renter told the median SALE is above their £2,000 a month is being
    // shown two different numbers as though they were one.
    const renting = profile({
      propertyCriteria: {
        channel: 'rent', minPrice: 500, maxPrice: 2_000,
        minBeds: 2, maxBeds: 3, minBaths: 1, maxBaths: 2,
        tenures: [], features: [], setAt: 1,
      },
    });
    const b = buildAreaBrief('Knightsbridge', renting);
    assert.equal(b.conflicts.some((c) => c.includes('budget')), false);
  });

  it('says nothing about price when no budget has been set', () => {
    assert.equal(buildAreaBrief('Knightsbridge', profile()).conflicts.some((c) => c.includes('budget')), false);
  });

  it('leaves prices out entirely where there were too few sales to say', () => {
    // Bank, Canary Wharf and the rest of the commercial core.
    assert.equal(buildAreaBrief('Bank', profile()).prices, undefined);
  });
});
