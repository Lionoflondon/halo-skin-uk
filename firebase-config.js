/** Public Firebase web configuration. Security is enforced by Firestore rules. */
const haloStagingHosts = new Set(['halo-skin-uk-stg.web.app', 'halo-skin-uk-stg.firebaseapp.com']);
const haloIsStaging = haloStagingHosts.has(window.location.hostname);
window.HALO_FIREBASE_CONFIG = haloIsStaging ? {
  apiKey: 'AIzaSyAuMk12W_XaViFbfwKsWTFMSe29o4qALi0',
  authDomain: 'halo-skin-uk-stg.firebaseapp.com',
  projectId: 'halo-skin-uk-stg',
  storageBucket: 'halo-skin-uk-stg.firebasestorage.app',
  messagingSenderId: '309796789447',
  appId: '1:309796789447:web:bee7286a7ebd87c50572e2'
} : {
  apiKey: 'AIzaSyBe1cNVDS-Tss6KAeRnIf4-NeqB6hbgnZg',
  authDomain: 'halo-skin-uk.firebaseapp.com',
  projectId: 'halo-skin-uk',
  storageBucket: 'halo-skin-uk.firebasestorage.app',
  messagingSenderId: '544030070635',
  appId: '1:544030070635:web:b0e67e7b0c491162489e2e'
};

window.HALO_ADMIN_EMAILS = ['ayojason600@gmail.com'];
