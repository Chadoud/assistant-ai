# Cloud auth release checklist

Use this before shipping a desktop build that requires account sign-in (`api.exosites.ch`).

## Phase 0 — Deploy API + Google OAuth (Infomaniak)

### 1. SSH deploy access

```bash
cp cloud-node/.env.deploy.example cloud-node/.env.deploy
# Edit SSH_USER, SSH_HOST, REMOTE_PATH
ssh-add ~/.ssh/your_infomaniak_key   # if using keys
```

Deploy from repo root:

```bash
./scripts/deploy-cloud-api.sh
```

If remote `npm install` fails, set `SKIP_REMOTE_NPM=1` in `.env.deploy` and restart the Node app in **Infomaniak Manager → api.exosites.ch**.

### 2. Runtime env (Infomaniak Manager → Node.js → Variables)

Required for password auth (already working if `/auth/login` returns 401/200):

| Variable | Notes |
|----------|--------|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `DB_*` | MariaDB connection |
| `APP_BASE_URL` | `https://api.exosites.ch` |

Required for **Google sign-in**:

| Variable | Notes |
|----------|--------|
| `GOOGLE_CLIENT_ID` | Google Cloud → OAuth client (Web application) |
| `GOOGLE_CLIENT_SECRET` | Same client |
| `AUTH_STATE_SECRET` | Optional; falls back to `JWT_SECRET` |

Google Cloud **Authorized redirect URI**:

```text
https://api.exosites.ch/auth/google/callback
```

Optional Apple: see `cloud-node/.env.example` (`APPLE_*`).

### 3. Verify production

```bash
chmod +x scripts/verify-cloud-auth-api.sh
./scripts/verify-cloud-auth-api.sh
```

Expected:

- `GET /health` → `ok: true`
- `GET /v1/public/auth-config` → `"google": true` (when Google configured)
- `GET /auth/start/google` → HTTP 302 to Google
- `POST /auth/register` → HTTP 200 with `access_token`

### 4. Desktop smoke test

1. Delete `~/Library/Application Support/Exo` (fresh first run).
2. Launch **Exo** from `/Applications` (not a mounted DMG).
3. Account screen → **Continue with Google** or email **Create account**.
4. Welcome wizard appears after sign-in.

---

## Packaged app checks (Phases 1–4)

After `npm run package:mac`:

```bash
node scripts/verify-packaged-preload.cjs
```

Confirms `Contents/Resources/preload.js` exists (account gate IPC works).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| No Google button | `auth-config` 404 or `google: false` | Deploy latest `cloud-node/` + set `GOOGLE_*` env |
| Welcome before login | Missing `preload.js` in bundle | Rebuild with `extraResources` preload copy |
| Email register works, Google 404 | Social routes not deployed | `./scripts/deploy-cloud-api.sh` |
| SSH deploy `Permission denied` | Key/password | Fix `cloud-node/.env.deploy` or Infomaniak SSH keys |

---

## Legacy EXO sessions

Automatic copy from `~/Library/Application Support/EXO/` was **removed**. Users sign in again on first Exo launch, or an admin can manually copy `cloud_session.json` if needed.
