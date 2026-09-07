import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readDataGaps, recordDataGap, rankGaps, clearDataGaps, type GapStorage } from '../dataGaps';

/** In-memory stand-in, injected rather than mocked at the loader. */
const store = new Map<string, string>();
const mem: GapStorage = {
  getItem: async (k) => store.get(k) ?? null,
  setItem: async (k, v) => { store.set(k, v); },
  removeItem: async (k) => { store.delete(k); },
};

describe('what the app cannot answer, counted', () => {
  beforeEach(async () => { store.clear(); await clearDataGaps(mem); });

  it('starts with nothing', async () => {
    const log = await readDataGaps(mem);
    assert.deepEqual(log.subjects, {});
    assert.equal(log.answeredCleanly, 0);
  });

  it('counts a clean answer as the denominator, not as a gap', async () => {
    // Without it a rising gap count could just mean rising usage.
    await recordDataGap('Angel', [], false, mem);
    const log = await readDataGaps(mem);
    assert.equal(log.answeredCleanly, 1);
    assert.deepEqual(log.subjects, {});
  });

  it('tallies each missing subject, and how often it needed the model', async () => {
    await recordDataGap('Angel', ['crime', 'schools near this area'], true, mem);
    await recordDataGap('Brixton', ['crime'], false, mem);
    const ranked = rankGaps(await readDataGaps(mem));
    assert.equal(ranked[0].subject, 'crime');
    assert.equal(ranked[0].count, 2);
    assert.equal(ranked[0].fellBackToModel, 1);
  });

  it('counts the areas people keep asking thin questions about', async () => {
    await recordDataGap('Angel', ['crime'], false, mem);
    await recordDataGap('Angel', ['noise'], false, mem);
    const log = await readDataGaps(mem);
    assert.equal(log.areas.Angel, 2);
  });

  it('records a model fallback even when no dimension was named', async () => {
    // Something was missing; it just was not a gap we track by name.
    await recordDataGap('Angel', [], true, mem);
    const log = await readDataGaps(mem);
    assert.equal(log.subjects.unclassified.fellBackToModel, 1);
    assert.equal(log.answeredCleanly, 0);
  });

  it('never stores the question, or who asked it', async () => {
    // The finding is "twelve people asked about an area with no crime
    // data". Which twelve, and how they phrased it, adds nothing and would
    // turn a counter into a pile of personal data needing a lawful basis.
    await recordDataGap('Angel', ['crime'], true, mem);
    const raw = JSON.stringify(await readDataGaps(mem));
    assert.equal(/uid|user|question|asked.?text/i.test(raw), false);
  });

  it('orders the biggest gaps first — the reading order for a roadmap', async () => {
    await recordDataGap('A', ['rare'], false, mem);
    for (let i = 0; i < 3; i += 1) await recordDataGap('B', ['common'], false, mem);
    assert.deepEqual(rankGaps(await readDataGaps(mem)).map((g: { subject: string }) => g.subject),
      ['common', 'rare']);
  });
});
