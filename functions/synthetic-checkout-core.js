'use strict';

const HALO_STAGING_PROJECT_ID = 'halo-skin-uk-stg';

function isSyntheticStagingCheckoutEnabled({ projectId, enabled }) {
  return projectId === HALO_STAGING_PROJECT_ID && enabled === 'true';
}

module.exports = { HALO_STAGING_PROJECT_ID, isSyntheticStagingCheckoutEnabled };
