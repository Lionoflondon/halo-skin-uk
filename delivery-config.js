/** Halo-only delivery configuration. Never place Circum secrets in this file. */
window.HALO_DELIVERY_CONFIG = {
  serviceAreaEndpoint: '',
  paymentSuccessEndpoint: '',
  adminOrdersEndpoint: '',

  // Local preview fallback. Production eligibility must use Circum's approved
  // service-area endpoint so supported surrounding areas remain configurable.
  serviceAreaChecker: async ({ city, country }) => {
    const supportedCities = ['london', 'greater london'];
    return country === 'United Kingdom' && supportedCities.includes((city || '').trim().toLowerCase());
  }
};
