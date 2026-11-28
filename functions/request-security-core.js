'use strict';

class AppCheckAccessError extends Error {
  constructor() {
    super('App Check verification failed. Refresh the page and try again.');
    this.name = 'AppCheckAccessError';
  }
}

async function requireVerifiedAppCheck(request, verifyToken) {
  const token = request?.get?.('x-firebase-appcheck');
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192) throw new AppCheckAccessError();
  try {
    await verifyToken(token);
  } catch (_) {
    throw new AppCheckAccessError();
  }
}

module.exports = { AppCheckAccessError, requireVerifiedAppCheck };
