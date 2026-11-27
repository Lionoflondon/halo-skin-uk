'use strict';

const { createHash, createHmac, randomUUID } = require('node:crypto');

const sha256 = value => createHash('sha256').update(value).digest('hex');
const integrationReference = (operation, id) => {
  if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('A stable HALO reference is required.');
  return `integration_${sha256(JSON.stringify([operation, id]))}`;
};
const positivePence = value => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Enter a positive whole amount in pence.');
  return value;
};
function verifyRothBusinessIdentity(actualBusinessId, expectedBusinessId, { requireActual = false } = {}) {
  if (typeof expectedBusinessId !== 'string' || !expectedBusinessId.trim()) throw new Error('HALO ROTH business identity is not configured.');
  if (requireActual && (typeof actualBusinessId !== 'string' || !actualBusinessId.trim())) throw new Error('ROTH did not return its merchant business identity.');
  if (actualBusinessId && actualBusinessId !== expectedBusinessId) throw new Error('ROTH merchant credential resolved to a different Rothcross business.');
  return expectedBusinessId;
}

function createRothMerchantClient({ baseUrl, keyId, secret, fetchImpl = fetch, clock = () => new Date(), nonceFactory = randomUUID }) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new Error('ROTH merchant API requires HTTPS.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || origin.origin !== baseUrl.replace(/\/$/, '')) {
    throw new Error('Configure the ROTH API origin only.');
  }
  if (typeof keyId !== 'string' || !keyId.trim() || keyId.length > 200 || /[\r\n]/.test(keyId) ||
      typeof secret !== 'string' || !secret) {
    throw new Error('HALO ROTH merchant credentials are not configured.');
  }

  async function request(method, pathname, body = null) {
    const target = new URL(pathname, origin);
    if (target.origin !== origin.origin || !pathname.startsWith('/v1/') || target.hash || target.username || target.password) {
      throw new Error('ROTH request must use a versioned endpoint on the configured origin.');
    }
    const rawBody = body === null ? '' : JSON.stringify(body);
    const timestamp = clock().toISOString();
    const nonce = nonceFactory();
    const canonical = [method.toUpperCase(), target.pathname, timestamp, nonce, sha256(rawBody)].join('\n');
    const signature = createHmac('sha256', secret).update(canonical).digest('hex');
    const response = await fetchImpl(target.href, {
      method: method.toUpperCase(), redirect: 'error',
      headers: {
        'X-ROTH-Key-Id': keyId,
        'X-ROTH-Timestamp': timestamp,
        'X-ROTH-Nonce': nonce,
        'X-ROTH-Signature': signature,
        ...(body === null ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === null ? {} : { body: rawBody })
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) { throw new Error('ROTH returned an unreadable response.'); }
    if (!response.ok) {
      const error = new Error(String(payload.title || payload.code || `ROTH API returned ${response.status}`));
      error.status = response.status;
      error.code = typeof payload.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(payload.code)
        ? payload.code
        : 'roth_api_error';
      throw error;
    }
    return payload;
  }

  return {
    request,
    integration(action, body) {
      if (!/^(startLink|handle|balance|reward|rewardByHandle|reserve|confirm|cancel|refund|receipt)$/.test(action)) {
        throw new Error('Unsupported ROTH integration operation.');
      }
      return request('POST', `/v1/integration/${action}`, body);
    },
    settlements() { return request('GET', '/v1/settlements'); }
  };
}

function haloRothIntegration(client) {
  return {
    startLink(externalId) {
      if (typeof externalId !== 'string' || !externalId.trim()) throw new Error('An authenticated HALO customer account is required.');
      return client.integration('startLink', { externalId });
    },
    wallet(externalId) {
      if (typeof externalId !== 'string' || !externalId.trim()) throw new Error('An authenticated HALO customer account is required.');
      return client.integration('balance', { externalId });
    },
    issueReward({ handle, rewardId, amountPence, campaignId, reason }) {
      if (typeof handle !== 'string' || !handle.trim() || typeof campaignId !== 'string' || !campaignId.trim() ||
          typeof reason !== 'string' || !reason.trim()) throw new Error('A customer handle, campaign and reason are required.');
      return client.integration('rewardByHandle', {
        handle: handle.trim(), rewardId: integrationReference('reward', rewardId),
        amountPence: positivePence(amountPence), campaignId: campaignId.trim(), reason: reason.trim()
      });
    },
    reserve({ externalId, orderId, amountPence }) {
      if (typeof externalId !== 'string' || !externalId.trim()) throw new Error('An authenticated linked HALO customer is required.');
      return client.integration('reserve', {
        externalId, orderId: integrationReference('order', orderId), amountPence: positivePence(amountPence)
      });
    },
    confirm({ orderId, reservationId }) {
      if (typeof reservationId !== 'string' || !reservationId.trim()) throw new Error('A ROTH reservation is required.');
      return client.integration('confirm', { reservationId, orderId: integrationReference('order', orderId) });
    },
    cancel({ orderId, reservationId }) {
      if (typeof reservationId !== 'string' || !reservationId.trim()) throw new Error('A ROTH reservation is required.');
      return client.integration('cancel', { reservationId, orderId: integrationReference('order', orderId) });
    },
    refund({ refundId, journalId, amountPence, reason }) {
      if (typeof journalId !== 'string' || !journalId.trim() || typeof reason !== 'string' || !reason.trim()) {
        throw new Error('A ROTH journal and refund reason are required.');
      }
      return client.integration('refund', {
        refundId: integrationReference('refund', refundId), journalId: journalId.trim(),
        amountPence: positivePence(amountPence), reason: reason.trim()
      });
    },
    receipt(journalId) {
      if (typeof journalId !== 'string' || !journalId.trim()) throw new Error('A ROTH journal reference is required.');
      return client.integration('receipt', { journalId: journalId.trim() });
    },
    settlements() { return client.settlements(); }
  };
}

module.exports = { createRothMerchantClient, haloRothIntegration, integrationReference, verifyRothBusinessIdentity };
