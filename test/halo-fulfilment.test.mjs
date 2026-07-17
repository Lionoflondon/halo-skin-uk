import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfilPaidHaloOrder } from '../server/halo-fulfilment.mjs';

function fixture({ eligible = true } = {}) {
  const calls = [];
  const adapters = {
    orders: {
      markPaid: async (id, paymentId) => (calls.push(['markPaid', id, paymentId]), { id }),
      updateDelivery: async (id, data) => calls.push(['updateDelivery', id, data]),
      get: async id => ({ id, customer: { email: 'customer@example.com' } })
    },
    standardFulfilment: { dispatch: async order => calls.push(['standardFulfilment', order.id]) },
    warehouse: { getActive: async () => (calls.push(['warehouse']), { contact: { name: 'Halo Warehouse' }, address: { line1: 'Warehouse' } }) },
    circum: {
      checkServiceArea: async address => (calls.push(['area', address]), { eligible }),
      createDelivery: async payload => (calls.push(['circum', payload]), { id: 'circum_123', trackingUrl: 'https://tracking.example/circum_123' }),
      broadcastDelivery: async id => calls.push(['broadcast', id])
    },
    notifications: { sendDeliveryUpdate: async (...args) => calls.push(['notify', ...args]) }
  };
  return { calls, adapters };
}
const baseOrder = { id: 'halo_1', customer: { email: 'customer@example.com' }, shippingAddress: { city: 'London' } };

test('rejects Circum fulfilment before successful payment', async () => {
  const { calls, adapters } = fixture();
  await assert.rejects(() => fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'pending' }, order: { ...baseOrder, deliveryMethod: 'circum' }, adapters }), /Payment must be verified/);
  assert.equal(calls.length, 0);
});

test('paid London-eligible order creates warehouse-to-customer delivery and broadcasts it', async () => {
  const { calls, adapters } = fixture();
  const result = await fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'succeeded' }, order: { ...baseOrder, deliveryMethod: 'circum' }, adapters });
  assert.equal(result.circumDeliveryId, 'circum_123');
  assert.equal(result.deliveryStatus, 'Awaiting Rider');
  assert.equal(calls.filter(call => call[0] === 'circum').length, 1);
  assert.equal(calls.filter(call => call[0] === 'broadcast').length, 1);
  const createPayload = calls.find(call => call[0] === 'circum')[1];
  assert.equal(createPayload.pickup.contact.name, 'Halo Warehouse');
  assert.equal(createPayload.dropoff.address.city, 'London');
  const saved = calls.find(call => call[0] === 'updateDelivery')[2];
  assert.equal(saved.shippingPrice, 4.99);
  assert.equal(saved.deliveryStatus, 'Preparing');
  assert.ok(calls.findIndex(call => call[0] === 'circum') < calls.findIndex(call => call[0] === 'broadcast'));
});

test('outside-area order never creates Circum delivery', async () => {
  const { calls, adapters } = fixture({ eligible: false });
  await assert.rejects(() => fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'succeeded' }, order: { ...baseOrder, deliveryMethod: 'circum' }, adapters }), /outside/);
  assert.equal(calls.some(call => call[0] === 'circum'), false);
  assert.equal(calls.some(call => call[0] === 'broadcast'), false);
});

test('standard order continues Halo fulfilment and never calls Circum', async () => {
  const { calls, adapters } = fixture();
  await fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'succeeded' }, order: { ...baseOrder, deliveryMethod: 'standard' }, adapters });
  assert.equal(calls.some(call => call[0] === 'standardFulfilment'), true);
  assert.equal(calls.some(call => call[0] === 'circum'), false);
  assert.equal(calls.some(call => call[0] === 'broadcast'), false);
  assert.equal(calls.find(call => call[0] === 'updateDelivery')[2].shippingPrice, 2.99);
});
