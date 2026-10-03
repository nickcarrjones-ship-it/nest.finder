import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrubCounts } from '../parse';

describe('no spreadsheet answers', () => {
  it('rewords the answer Nick actually got', () => {
    const got = 'It has an unusually high share of pubs and bars among its 386 places to eat and drink, and across 58 different cuisines.';
    const out = scrubCounts(got);
    assert.equal(out, 'It has an unusually high share of pubs and bars among its hundreds of places to eat and drink, and across loads of different cuisines.');
    assert.doesNotMatch(out, /\d/);
  });

  it('leaves the numbers that are answers alone', () => {
    const fine = 'Rated 4.6 on Google, about 42 minutes to Canary Wharf, typical flats around £520,000, 31 street crimes a year per 1,000 people.';
    assert.equal(scrubCounts(fine), fine);
  });

  it('says small counts plainly', () => {
    assert.equal(scrubCounts('there are 12 pubs and 5 cafés'), 'there are plenty of pubs and a handful of cafés');
  });
});
