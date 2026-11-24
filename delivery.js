(function () {
  const METHODS = Object.freeze({
    circum: Object.freeze({ id: 'circum', label: '⚡ Circum Same Day', price: 4.99 }),
    standard: Object.freeze({ id: 'standard', label: '📦 Standard Delivery', price: 2.99 })
  });
  const config = () => window.HALO_DELIVERY_CONFIG || {};
  async function postJson(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Delivery service returned ${response.status}`);
    return response.json();
  }
  async function checkServiceArea(address) {
    const cfg = config();
    if (cfg.serviceAreaEndpoint) {
      const result = await postJson(cfg.serviceAreaEndpoint, { address });
      return { eligible: result.eligible === true, reason: result.reason || '' };
    }
    if (typeof cfg.serviceAreaChecker === 'function') {
      return { eligible: (await cfg.serviceAreaChecker(address)) === true, reason: 'configured-checker' };
    }
    return { eligible: false, reason: 'checker-not-configured' };
  }
  window.HaloDelivery = { METHODS, checkServiceArea };
})();
