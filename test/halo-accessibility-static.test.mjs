import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storefront = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
const storefrontCss = readFileSync(new URL('../home-rebuild.css', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('../admin.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');

function controlHasLabel(html, tag, attributes, offset) {
  if (/\btype=["']hidden["']/.test(attributes)) return true;
  if (/\baria-(?:label|labelledby)=["'][^"']+/.test(attributes)) return true;
  const id = attributes.match(/\bid=["']([^"']+)["']/)?.[1];
  if (id && new RegExp(`<label\\b[^>]*\\bfor=["']${id}["']`).test(html)) return true;
  const openLabel = html.lastIndexOf('<label', offset);
  const closeLabel = html.lastIndexOf('</label>', offset);
  return openLabel > closeLabel;
}

test('storefront and admin controls have programmatic names', () => {
  for (const [pageName, html] of [['storefront', storefront], ['admin', admin]]) {
    const controls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
    for (const control of controls) {
      const [, tag, attributes] = control;
      assert.equal(controlHasLabel(html, tag, attributes, control.index), true,
        `${pageName} ${tag} ${attributes.match(/\bid=["']([^"']+)/)?.[1] || ''} needs a label`);
    }
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
    for (const [, attributes, contents] of buttons) {
      const text = contents.replace(/<[^>]*>/g, '').trim();
      assert.ok(text || /\baria-label=["'][^"']+/.test(attributes) || /\baria-labelledby=["'][^"']+/.test(attributes),
        `${pageName} button ${attributes.match(/\bid=["']([^"']+)/)?.[1] || ''} needs an accessible name`);
    }
  }
});

test('keyboard focus, modal navigation and reduced-motion support are present in source', () => {
  assert.match(storefrontCss, /:focus-visible/);
  assert.match(adminCss, /button:focus-visible[\s\S]*outline:\s*3px solid/);
  assert.match(storefrontCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /event\.key !== 'Tab'/);
});

test('admin section navigation exposes tab state and arrow-key movement', () => {
  assert.match(admin, /role="tablist"/);
  assert.equal([...admin.matchAll(/role="tab"/g)].length, [...admin.matchAll(/role="tabpanel"/g)].length);
  assert.match(admin, /aria-selected="true"[\s\S]*aria-controls="admin-panel-products"/);
  assert.match(admin, /role="tabpanel" aria-labelledby="admin-tab-deliveries"[^>]*hidden/);
  assert.match(adminJs, /button\.setAttribute\('aria-selected', String\(selected\)\)/);
  assert.match(adminJs, /panel\.hidden = !selected/);
  assert.match(adminJs, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(admin, /admin\.js\?v=10/);
});
