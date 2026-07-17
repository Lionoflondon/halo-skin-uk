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
  async function handleVerifiedPayment(payment, order) {
    if (!payment || payment.status !== 'succeeded' || !payment.id) throw new Error('A verified successful payment is required');
    const cfg = config();
    if (!cfg.paymentSuccessEndpoint) throw new Error('Halo payment-success endpoint is not configured');
    return postJson(cfg.paymentSuccessEndpoint, { paymentId: payment.id, order });
  }
  window.HaloDelivery = { METHODS, checkServiceArea, handleVerifiedPayment };
})();
