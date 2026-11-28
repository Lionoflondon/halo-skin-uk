'use strict';

const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function logHaloServerFailure(logger, status, errorCode) {
  if (!Number.isInteger(status) || status < 500 || status > 599) return;
  const safeCode = typeof errorCode === 'string' && SAFE_ERROR_CODE.test(errorCode)
    ? errorCode
    : 'internal_error';
  logger.error('HALO backend request failed', { status, errorCode: safeCode });
}

module.exports = { logHaloServerFailure };
