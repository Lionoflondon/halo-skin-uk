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
    shopify: { continueStandardFulfilment: async order => calls.push(['shopify', order.id]) },
    circum: {
      checkServiceArea: async address => (calls.push(['area', address]), { eligible }),
      createDelivery: async payload => (calls.push(['circum', payload]), { id: 'circum_123', trackingUrl: 'https://tracking.example/circum_123' })
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

test('paid London-eligible order creates Circum delivery and stores tracking metadata', async () => {
  const { calls, adapters } = fixture();
  const result = await fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'succeeded' }, order: { ...baseOrder, deliveryMethod: 'circum' }, adapters });
  assert.equal(result.circumDeliveryId, 'circum_123');
  assert.equal(calls.filter(call => call[0] === 'circum').length, 1);
  const saved = calls.find(call => call[0] === 'updateDelivery')[2];
  assert.equal(saved.shippingPrice, 4.99);
  assert.equal(saved.deliveryStatus, 'Preparing');
});

test('outside-area order never creates Circum delivery', async () => {
  const { calls, adapters } = fixture({ eligible: false });
  await assert.rejects(() => fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'succeeded' }, order: { ...baseOrder, deliveryMethod: 'circum' }, adapters }), /outside/);
  assert.equal(calls.some(call => call[0] === 'circum'), false);
});

test('standard order continues Shopify fulfilment and never calls Circum', async () => {
  const { calls, adapters } = fixture();
  await fulfilPaidHaloOrder({ payment: { id: 'pay_1', status: 'succeeded' }, order: { ...baseOrder, deliveryMethod: 'standard' }, adapters });
  assert.equal(calls.some(call => call[0] === 'shopify'), true);
  assert.equal(calls.some(call => call[0] === 'circum'), false);
  assert.equal(calls.find(call => call[0] === 'updateDelivery')[2].shippingPrice, 2.99);
});
