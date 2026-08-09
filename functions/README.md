# functions

Cloud Functions (TypeScript, Node 20) for the C-language online judge quiz system.

## Environment variables

Set these via `firebase functions:secrets:set` (for the two secrets) or
`firebase functions:config:env` / a `.env` file consumed by
`functions/src/config.ts` before deploying:

| Variable | Purpose |
|---|---|
| `GRADER_SERVICE_URL` | Base URL of the external Grader service (contracts/grader-api.md) |
| `GRADER_AUTH_TOKEN` | Sent as `X-Auth-Token` on every Grader request |
| `ALLOWED_EMAIL_DOMAIN` | Login email domain allowed by `Login.tsx` and identity checks (default `hoseo.edu`) |
| `TEACHER_EMAILS` | Comma-separated allowlist checked by `requireTeacher` (research.md §17) |

## `accessLogs.expiresAt` TTL policy (research.md §8)

`accessLogs` documents carry an `expiresAt` field (write time + 6 months) so they
can be deleted automatically instead of being cleaned up by a scheduled function.
Firestore's native TTL feature is **not** configured via `firebase deploy` or
`firestore.indexes.json` — it must be set once per database, either in the
Firebase console (Firestore → the `accessLogs` collection → "Time-to-live") or
via the CLI:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=accessLogs \
  --enable-ttl \
  --project=<your-project-id>
```

Verify it took effect:

```bash
gcloud firestore fields ttls describe expiresAt \
  --collection-group=accessLogs \
  --project=<your-project-id>
```

This has not been run against a real project from this environment — there is
no deployed Firebase project or `gcloud` credential available here. Run it once
against the real project before relying on automatic expiry.

## Deploying

```bash
npm run build
firebase deploy --only functions,firestore:rules,firestore:indexes
```
