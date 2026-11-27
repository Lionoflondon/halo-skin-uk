import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('Firestore rules require verified email, second factor and the approved HALO admin identity', () => {
  assert.match(rules, /request\.auth\.token\.email_verified\s*==\s*true/);
  assert.match(rules, /request\.auth\.token\.firebase\.get\('sign_in_second_factor',\s*''\)\s*!=\s*''/);
  assert.match(rules, /request\.auth\.token\.email\s*==\s*'ayojason600@gmail\.com'/);
});

test('only published catalogue products are readable without HALO admin access', () => {
  assert.match(rules, /allow read: if resource\.data\.published\s*==\s*true\s*\|\|\s*isHaloAdmin\(\)/);
});

test('client product writes cannot set or change inventory accounting fields', () => {
  assert.match(rules, /allow create: if isHaloAdmin\(\)[\s\S]*stockQuantity\s*==\s*null[\s\S]*reservedQuantity\s*==\s*0/);
  assert.match(rules, /affectedKeys\(\)[\s\S]*hasAny\(\['stockQuantity',\s*'reservedQuantity',\s*'inventoryCountedAt',\s*'inventoryCountedBy'\]\)/);
  assert.match(rules, /allow delete: if isHaloAdmin\(\)[\s\S]*stockQuantity\s*==\s*0[\s\S]*reservedQuantity\s*==\s*0/);
});

test('all non-catalogue Firestore documents are denied by default', () => {
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});
