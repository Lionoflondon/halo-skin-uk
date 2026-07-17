/** Halo-only delivery configuration. Never place Circum secrets in this file. */
window.HALO_DELIVERY_CONFIG = {
  serviceAreaEndpoint: '',
  paymentSuccessEndpoint: '',
  adminOrdersEndpoint: '',
  postcodeLookupEndpoint: 'https://api.postcodes.io/postcodes/',
  previewSupportedRegions: ['London'],

  // Local preview fallback. Production eligibility must use Circum's approved
  // service-area endpoint so supported surrounding areas remain configurable.
  serviceAreaChecker: async ({ address, city, postcode, country }) => {
    if (country !== 'United Kingdom') return false;
    const enteredCity = (city || '').trim().toLowerCase();
    if (!enteredCity || !postcode) return false;

    try {
      const compactPostcode = postcode.replace(/\s+/g, '').toUpperCase();
      const response = await fetch(`${window.HALO_DELIVERY_CONFIG.postcodeLookupEndpoint}${encodeURIComponent(compactPostcode)}`);
      if (!response.ok) return false;
      const data = await response.json();
      const region = data?.result?.region || '';
      const regionSupported = window.HALO_DELIVERY_CONFIG.previewSupportedRegions.includes(region);
      const returnedAreas = [data?.result?.admin_district, data?.result?.parish, region]
        .filter(Boolean)
        .map(value => value.toLowerCase());
      const cityMatches = enteredCity.includes('london') || returnedAreas.some(area => area.includes(enteredCity) || enteredCity.includes(area));
      return regionSupported && cityMatches;
    } catch (_) {
      return false;
    }
  }
};
