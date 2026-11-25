import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('storefront only describes verified delivery terms and current CIRCUM availability', () => {
  assert.match(html, /Same-day delivery with CIRCUM coming soon/);
  assert.match(html, /Standard delivery: £2\.99 at checkout/);
  assert.match(html, /Circum Same Day · Unavailable/);
  assert.match(html, /not available for HALO checkout yet/i);
  assert.match(html, /value="circum" disabled/);
  assert.doesNotMatch(html, /complimentary.{0,30}delivery|Same-day London delivery with Circum|Live tracking|Proof of delivery|delivery notifications/i);
  assert.doesNotMatch(app, /delivery-remaining|45 - total/);
});
