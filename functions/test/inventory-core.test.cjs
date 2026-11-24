'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inventoryCountAdjustment, releaseInventory, reserveInventory } = require('../inventory-core');

test('reserves only counted stock and calculates the remaining quantity', () => {
  assert.deepEqual(reserveInventory([{ id: 'lip-01', stockQuantity: 4, reservedQuantity: 2 }], [{ id: 'lip-01', title: 'Lip care', quantity: 3 }]), [
    { id: 'lip-01', quantity: 3, stockQuantityAfter: 1, reservedQuantityAfter: 5 }
  ]);
});

test('rejects unknown or insufficient stock without guessing a count', () => {
  assert.throws(() => reserveInventory([{ id: 'lip-01' }], [{ id: 'lip-01', title: 'Lip care', quantity: 1 }]), /Stock is unavailable/);
  assert.throws(() => reserveInventory([{ id: 'lip-01', stockQuantity: 1 }], [{ id: 'lip-01', title: 'Lip care', quantity: 2 }]), /Stock is unavailable/);
});

test('releases expired reservations and validates the stored count', () => {
  assert.deepEqual(releaseInventory({ stockQuantity: 2, reservedQuantity: 3 }, 3), { stockQuantity: 5, reservedQuantity: 0 });
  assert.throws(() => releaseInventory({ stockQuantity: null, reservedQuantity: 3 }, 3), /count is missing/);
});

test('records a physical stock count and later count adjustments', () => {
  assert.deepEqual(inventoryCountAdjustment(null, 0, 12), { previousPhysicalCount: null, physicalCount: 12, availableQuantity: 12, delta: null });
  assert.deepEqual(inventoryCountAdjustment(9, 3, 10), { previousPhysicalCount: 12, physicalCount: 10, availableQuantity: 7, delta: -2 });
  assert.throws(() => inventoryCountAdjustment(0, 2, 1), /less than units reserved/);
  assert.throws(() => inventoryCountAdjustment(12, 0, -1), /non-negative/);
});
