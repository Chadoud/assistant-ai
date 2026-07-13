# Infomaniak hosting — deploy map

Two separate Infomaniak products. **Do not mix credentials or paths.**

Replace `YOUR_IK_ID` / host placeholders with values from Infomaniak Manager (keep real values in gitignored `.env.deploy` files only).

| Site | Product | Deploy config | Script |
|------|---------|---------------|--------|
| `api.exosites.ch` | Node.js | `cloud-node/.env.deploy` | `npm run deploy:cloud-api` |
| `datasuite.exosites.ch` | Web (PHP 8.4) | `datasuite/.env.deploy` | `npm run deploy:datasuite` |
| `exosites.ch` | Web (marketing) | *(manual / separate pipeline)* | **Do not deploy DataSuite here** |

## Web hosting (PHP)

- **FTP host:** `YOUR_IK_ID.ftp.infomaniak.com`
- **DataSuite deploy user:** `YOUR_IK_ID_datasuite_ro` → `datasuite/.env.deploy`
- **Admin / marketing FTP:** use a separate full-access FTP user (do not use it for routine DataSuite deploy)
- **DataSuite docroot:** `sites/datasuite.exosites.ch`

### Create the DataSuite FTP user (Infomaniak → exosites.ch → FTP / SSH → Ajouter)

| Field | Value |
|-------|--------|
| Environnement | Apache \| PHP |
| Accès | FTP + SSH |
| Utilisateur | `YOUR_IK_ID_datasuite_ro` (**no spaces**) |
| Mot de passe | team secret (never commit) |

Optional hardening: switch to **FTP only** and restrict the home folder to `sites/datasuite.exosites.ch`.

**Two users, two jobs:**

| Purpose | Username pattern |
|---------|------------------|
| FTP deploy (Web hosting) | `YOUR_IK_ID_datasuite_ro` |
| MariaDB read-only (dashboard) | `YOUR_IK_ID_datasuite` |

### MariaDB read-only (separate from FTP user)

1. Infomaniak → **Bases de données** → **Utilisateurs** → add `YOUR_IK_ID_datasuite` (MariaDB user; separate from FTP deploy user)
2. phpMyAdmin (admin login) → run `cloud-node/migrations/006_datasuite_grants.sql.example` after substituting your prefix/DB name
3. Verify: `npm run test:datasuite-db` (reads `datasuite/.env.db` if present)
4. Switch dashboard DB creds:

```bash
cp datasuite/.env.db.example datasuite/.env.db   # fill DATASUITE_DB_PASSWORD
npm run datasuite:generate-env
UPLOAD_ENV=1 npm run deploy:datasuite
```

```bash
npm run probe:datasuite-ftp
UPLOAD_ENV=1 VERIFY_AFTER_DEPLOY=1 npm run deploy:datasuite
```

Runtime secrets (DB, admin hash): `datasuite/.env.server` — `npm run datasuite:generate-env`, upload with `UPLOAD_ENV=1`.

### Weekly digest (optional cron on Node host)

Infomaniak → Node.js → `api.exosites.ch` → Cron:

```bash
0 9 * * 1 cd sites/api.exosites.ch && node scripts/datasuite-weekly-digest.js
```

Or from your machine: `npm run digest:datasuite` (SSH to api host).

Pipe stdout to e-mail or Slack — no secrets in output.

## Node.js (API)

- **SSH host:** from Infomaniak → Node.js → `api.exosites.ch` (copy into `cloud-node/.env.deploy`, never commit)
- **Path:** `sites/api.exosites.ch`

```bash
npm run deploy:cloud-api
```

Migrations (including DataSuite **views** only): applied on this host via `apply-migration-006.js`. No dashboard PHP on Node.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| rsync datasuite to Node SSH | Use Web FTP only; `npm run cleanup:datasuite-node-orphan` |
| Same FTP password as Node SSH | Web FTP credentials from **Hébergement Web → FTP** |
| Write DB user on datasuite forever | Use MariaDB `YOUR_IK_ID_datasuite` + grants, regenerate env, redeploy |
| Legacy `sites/crash-ingest` on Web FTP | Removed — ingest is `api.exosites.ch/v1/crash-reports` |

## Cleanup commands

```bash
npm run verify:datasuite-infra          # Node SSH clean + datasuite live
npm run cleanup:datasuite-node-orphan   # remove mistaken Node SSH copy
CONFIRM=1 npm run cleanup:legacy-crash-ftp   # remove legacy crash PHP sites on Web FTP
```

See [DATASUITE_DASHBOARD.md](./DATASUITE_DASHBOARD.md) for product dashboard details.
