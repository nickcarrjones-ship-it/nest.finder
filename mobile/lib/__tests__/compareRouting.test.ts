import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areasAskedAbout } from '../agentChat/areaBrief';
import { friendTopic } from '../agentChat/friend';
import { asksForAnAmenity } from '../agentChat/amenities';
import { asksForARoute } from '../routes';

// Nick, 2026-10-02: answered with four pubs in one area, no comparison.
const SAID = 'compare the pub scene of earlsfield to east dulwich and which has a better vibe for what im looking for';

describe('a comparison of two areas on one subject', () => {
  it('finds both areas, the subject, and nothing that would send it elsewhere', () => {
    const areas = areasAskedAbout(SAID);
    assert.ok(areas.includes('Earlsfield'), areas.join());
    assert.ok(areas.includes('East Dulwich'), areas.join());
    assert.ok(friendTopic(SAID), 'pubs is a friend topic');
    // Pubs, not a service like a GP or a gym (the store's isServiceAmenity).
    const ask = asksForAnAmenity(SAID);
    assert.ok(!ask || ['restaurants', 'cafés', 'pubs', 'takeaways'].includes(ask.label));
    assert.equal(asksForARoute(SAID), false);
  });
});
