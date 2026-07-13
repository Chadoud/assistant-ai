# GO SYNC relay deploy

The sync relay lives in **cloud-node** (`/v1/sync/*` routes). Deploy with the account API.

## 1. Database migration

Migration **004** runs automatically with `./scripts/deploy-cloud-api.sh` (after 002–003).

Manual fallback:

```bash
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < cloud-node/migrations/004_sync_relay.sql
# or
node cloud-node/scripts/apply-migration-004.js
```

Creates `sync_devices`, `sync_blobs`, `sync_cursors` (ciphertext only).

## 2. Deploy API

```bash
./scripts/deploy-cloud-api.sh
```

Ensure `JWT_SECRET` and DB credentials match production.

## 3. Restart Node app (required)

Migration 004 alone is not enough — the Infomaniak panel must load the new `server.js`:

1. **Infomaniak Manager** → Node.js → **api.exosites.ch** → **Restart**
2. Or: `VERIFY_AFTER=1 ./scripts/restart-cloud-api.sh` (when SSH restart is allowed)

Without restart, `/health` will not include `sync_relay` and `/v1/sync/*` returns 404.

## 4. Verify endpoints (Bearer access token required)

```bash
npm run verify:go-sync
# or manually:
curl -s -H "Authorization: Bearer $TOKEN" https://api.exosites.ch/v1/sync/status
curl -s -H "Authorization: Bearer $TOKEN" "https://api.exosites.ch/v1/sync/blobs/pull?cursor=0&limit=10"
```

`GET /health` includes `"sync_relay": true` when migration 004 is applied.

## 5. Desktop + mobile

- Desktop: `EXOSITES_CLOUD_URL=https://api.exosites.ch` (or staging).
- Mobile: `--dart-define-from-file=mobile/env/production.json` or staging JSON.

## 6. Rollback

Do not drop tables in production without backup. To disable relay, remove route mount in `cloud-node/server.js` and redeploy — clients will fail pull/push with HTTP errors.
