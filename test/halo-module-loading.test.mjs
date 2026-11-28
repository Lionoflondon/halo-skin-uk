import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('storefront loads app.js as a module when it uses static imports', () => {
  assert.match(app, /^import\s+\{\s*isSyntheticStagingSalesEnabled\s*\}\s+from\s+['"]\.\/sales-mode\.mjs['"]/);
  assert.match(html, /<script\s+type="module"\s+src="app\.js\?v=20261127-module-fix"><\/script>/);
});
