const stagingHosts = new Set([
  'halo-skin-uk-stg.web.app',
  'halo-skin-uk-stg.firebaseapp.com'
]);

export function isSyntheticStagingSalesEnabled({ hostname, projectId, checkoutEnabled, appCheckSiteKey }) {
  return stagingHosts.has(String(hostname || '').toLowerCase()) &&
    projectId === 'halo-skin-uk-stg' && checkoutEnabled === true &&
    typeof appCheckSiteKey === 'string' && appCheckSiteKey.trim().length > 0;
}
