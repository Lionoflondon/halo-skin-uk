# GitHub secret-scanning alert #2 remediation

**Verified:** 25 November 2026 (UTC)  
**Repository:** `Lionoflondon/halo-skin-uk`  
**Alert:** [#2 — Google API Key](https://github.com/Lionoflondon/halo-skin-uk/security/secret-scanning/2)  
**Outcome:** Resolved as `false_positive` after applying and verifying staging-only controls.

## Finding and intended use

GitHub located the value in `firebase-config.js:5`, commit `16a1884eb0d13f0868781e575e47e8bcc6d40c2c`. It is the Firebase-generated browser API key for the HALO Staging Web app in project `halo-skin-uk-stg` (project number `309796789447`, app ID `1:309796789447:web:bee7286a7ebd87c50572e2`). The key identifies the Firebase project for the web SDK; it is not a server credential. The repository separately selects the production project's browser key on production hosts. The staging workflow injects the staging Firebase configuration at deploy time.

Firebase documents these web API keys as public configuration values when they are restricted to Firebase APIs; authorization for Firestore data comes from Security Rules and App Check, not the API key. See [Firebase API-key guidance](https://firebase.google.com/docs/projects/api-keys).

## Staging key restrictions

Before remediation, the staging key had no application/referrer restriction and an API allowlist of 27 targets, including unrelated `sqladmin.googleapis.com`.

The staging key now has these HTTP referrers:

- `https://halo-skin-uk-stg.web.app/*`
- `https://halo-skin-uk-stg.firebaseapp.com/*`

Its API allowlist contains 26 Firebase-related targets; `sqladmin.googleapis.com` was removed. No key string is recorded here. Firebase Authentication's authorized-domain list was independently read and contains exactly `halo-skin-uk-stg.web.app` and `halo-skin-uk-stg.firebaseapp.com`. The hosted staging storefront loaded after the restriction change.

## Use and billing review

Cloud Monitoring request-count metrics from key creation (`2026-11-20T12:36:53Z`) through `2026-11-25T14:30:00Z` showed one request: `identitytoolkit.googleapis.com`, method `ProjectConfigService.GetProjectConfig`, HTTP 400, at `2026-11-24T21:43:39Z`. No other calls were present, and no calls appeared after the restriction change by the review cutoff. The metric does not identify a caller or referrer, so the failed request cannot be attributed; it does not show a successful request or burst.

The authenticated Firebase Payment billing report, filtered to project `halo-skin-uk-stg`, showed **£0.00 for the last 30 days** at `2026-11-25T14:30Z`. The project's £10 monthly budget is scoped to project `309796789447` and has alert thresholds at 50%, 80%, and 100% (£5/£8/£10). These alerts are notifications, not a hard spending cap.

## Firebase data protections and production boundary

The staging Firestore release previously allowed the administrator client to edit product stock fields directly. On `2026-11-25T14:27:56Z`, only `firestore.rules` was deployed to `halo-skin-uk-stg`. The deployed ruleset `e10b5fe8-9db6-4119-b88c-c9b4abe68a82` now hash-matches this branch's `firestore.rules`, which blocks client-side stock counter edits and limits all other collections to no client access.

Production was not changed. Its deployed Firestore rules still match `origin/main` at the time of verification. The production Firebase project and API key were not touched.

HALO staging App Check is **not configured**: the Firebase console shows the web app as “Not registered”, and `firebaseappcheck.googleapis.com` is disabled in the project. No App Check API or other paid service was enabled; no reCAPTCHA site key/secret was available. This remains a separate staging readiness gap and must be completed before enforcing App Check or accepting hosted customer transactions.

## Rotation and alert resolution

The key was not rotated. The review found it to be the expected public Firebase browser key, not a private credential; its Firebase API allowlist and staging-only referrers have now been verified. No unexpected successful usage or staging cost was found. GitHub alert #2 was therefore resolved as `false_positive`, with an alert comment recording the restrictions, usage, spend, staging-rules update, production boundary, and outstanding App Check gap.

GitHub alert #1 remains open and is outside this staging remediation. It is associated with HALO's separate production Firebase browser key; production restrictions have not been changed.
