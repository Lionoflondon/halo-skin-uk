import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const functions = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');

test('storefront does not advertise or apply an unverified client-only discount', () => {
  assert.doesNotMatch(html, /discount-code|apply-discount|Discount code/i);
  assert.doesNotMatch(app, /HALO10|appliedDiscount|checkoutDiscount/);
  assert.match(app, /const subtotal = cart\.reduce\(\(sum, item\) => sum \+ item\.price \* item\.quantity, 0\)/);
});

test('server pricing is based on published pence prices with separately defined standard delivery', () => {
  assert.match(functions, /const subtotal = items\.reduce\(\(sum, item\) => sum \+ item\.pricePence \* item\.quantity, 0\)/);
  assert.match(functions, /totalPence: subtotal \+ STANDARD_DELIVERY_PENCE/);
  assert.doesNotMatch(functions, /discountCode|discountPence|coupon/);
});
