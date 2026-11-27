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

## Current-state follow-up — 26 November 2026

- GitHub API read confirms alert #2 is still `resolved` as `false_positive`, resolved by `Lionoflondon` on 25 November. The alert location is `firebase-config.js:5`; the alert's historical blob contains the staging Firebase browser key, and the current branch still contains the same public Firebase web configuration. No key value is copied into this report.
- The alert's resolution comment states that API/referrer restrictions and Firebase Auth domains were verified, one unsuccessful HTTP 400 request was observed, staging spend was £0.00 over 30 days, and App Check remained unregistered. These are the recorded prior review results, not new live-console evidence from this follow-up.
- Current local source confirms the key is used as Firebase browser SDK configuration, and `firestore.rules` requires the allowlisted verified MFA admin claim and denies all other collection access. Local rules are not proof of the currently deployed ruleset.
- Firebase CLI read-only checks on 26 November show the HALO staging Web App is ACTIVE and `functions:list` is empty. The hosted purchase flow therefore remains unavailable. This does not validate API-key restrictions, Cloud Monitoring metrics, billing, or deployed rules.
- Fresh Google Cloud verification could not be performed: the Codex browser surface reports no browser available, and `gcloud` cannot read/write its local credentials database under the current filesystem permissions. The prior report's restriction, metric, spend, and deployed-rules claims remain unrefreshed. App Check was explicitly recorded as unregistered in the prior review and remains an open staging security gate.
- No key rotation, alert mutation, Firebase rules change, App Check enablement, paid-service activation, or production change was made in this follow-up. Do not treat this follow-up as independent confirmation of the prior false-positive resolution.

## Authenticated Google Cloud Console refresh — 27 November 2026

- Codex Browser verified the staging web API key is still restricted to the two HALO staging Hosting referrers and Firebase Authentication authorizes only those two staging domains. Its current API allowlist shows 24 Firebase/related APIs. The prior 25 November review recorded 26 after removing the unrelated Cloud SQL Admin API; the difference requires reconciliation before asserting the exact current allowlist. The browser key value was not copied.
- The Cloud APIs chart showed low project-level request traffic and no visible errors in the last 24 hours. It does not attribute requests to this key or identify callers. The current project billing report showed £0.00 for 1–27 November. No API request charge appeared, but key-specific legitimate use cannot be proven from these aggregate views.
- The Firebase Console visually showed active staging Firestore rules equivalent to the repository rules, and the London-region staging database remains empty and delete-protected. App Check remains unregistered; no site key was available. No setting or resource was changed.
- Historical GitHub evidence records alert #2 as resolved `false_positive` on 25 November, but GitHub was signed out in Codex Browser during this refresh, so its current state/comments could not be inspected. No alert mutation was made. The technical evidence still supports that the finding is a public Firebase browser configuration key and that staging HTTP referrers are restricted; the usage review is project aggregate rather than key-specific.
- The key was not rotated: the finding is a Firebase browser configuration key, and the current host restriction matches the isolated staging app. Treat key-specific use attribution and current GitHub alert state as unverified until authenticated GitHub access is restored. Production key/configuration remains untouched.

## Live GitHub alert and Cloud Console confirmation — 27 November 2026

- The signed-in Codex Browser live alert page shows alert #2 as **Dismissed**. Its timeline records `Lionoflondon` closing it as `false positive` on 25 November 2026 at 14:31 GMT. The comment records the public HALO staging Firebase key rationale, staging-only referrers, matching Auth domains, rules update, production boundary, one failed HTTP 400 request, £0.00 spend over 30 days, and unregistered App Check. GitHub identifies the secret type as `google_api_key` and validity as `Unknown`.
- The alert location is `firebase-config.js:5` in commit `16a1884eb0d13f0868781e575e47e8bcc6d40c2c`. Current Cloud Console identifies the credential as Firebase's auto-created Browser key and shows the exact two HALO staging referrers. Its 24 allowed APIs are Firebase/Firebase-associated web APIs. This refresh confirms the allowlist count; the earlier report's count of 26 was stale. The key value is not repeated.
- The 24-hour APIs dashboard shows low aggregate project traffic (Firebase Extensions 8, Firestore 5, Resource Manager 4, Functions 3, Secret Manager 1), zero visible error rate and zero maximum error-chart values. Those are project-wide observations, not key-specific caller records. The authenticated staging billing report remains £0.00 for 1–27 November. No unexpected successful key usage or related billable activity is evidenced by these views; caller attribution is not available.
- The staging key remains HTTP-referrer restricted to the two staging Hosting domains, Firebase Auth remains restricted to those same domains, deployed staging Firestore rules were visually verified, and App Check remains unregistered. The key is a public Firebase web SDK configuration value, not a server secret. No rotation, alert mutation, paid-service enablement, production change, or deployment was performed. The existing false-positive disposition is confirmed; App Check and key-specific usage attribution remain separately open technical gaps.
