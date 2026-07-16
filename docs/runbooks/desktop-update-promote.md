# Desktop update — stage, smoke, promote, rollback

**Pipeline:** tag → staging feed → you smoke → **Promote desktop feed** → production.

| Channel | URL |
|---------|-----|
| Staging | https://exosites.ch/downloads/exo-assistant-staging/latest.json |
| Production | https://exosites.ch/downloads/exo-assistant/latest.json |
| LKG (last prod) | https://exosites.ch/downloads/exo-assistant-lkg/latest.json (after first promote) |

Full checklist: [desktop-update-pipeline-checklist.md](./desktop-update-pipeline-checklist.md).

---

## One-time setup (you)

1. Staging dir + secret — already done if `.keep` works and `EXOSITES_DOWNLOADS_STAGING_PATH` exists.
2. Create LKG dir (SSH or local script):

   ```bash
   ./scripts/ensure-downloads-dirs-remote.sh
   ```

   Or on SSH:

   ```bash
   mkdir -p ./sites/exosites.ch/downloads/exo-assistant-lkg
   ```

3. Optional GitHub secret `EXOSITES_DOWNLOADS_LKG_PATH` =
   `./sites/exosites.ch/downloads/exo-assistant-lkg`  
   (CI defaults to this path if unset.)

4. GitHub → **Settings** → **Environments** → `desktop-updates-production`
   - Enable **Required reviewers** (add yourself)
   - Environment can use the same deploy secrets as the repo

---

## Every release

### 1. Prepare + tag

```bash
./scripts/bump-version.sh X.Y.Z
# edit CHANGELOG.md ## [X.Y.Z]
npm run verify:release-version -- --version X.Y.Z
git commit … && git tag vX.Y.Z && git push origin vX.Y.Z
```

Wait for **Build Installers** → `publish-staging` green.

### 2. Smoke staging

```bash
curl -sS https://exosites.ch/downloads/exo-assistant-staging/latest.json | head
```

On a Mac test machine (optional): build/run with  
`EXOSITES_UPDATE_FEED_URL=https://exosites.ch/downloads/exo-assistant-staging`  
or install the staging DMG from that URL.

Checklist:

- [ ] Staging `version` == tag
- [ ] `sig` present on `latest.json`
- [ ] Install / update works
- [ ] Sign-in + one core action OK
- [ ] Prod `latest.json` still the previous version

### 3. Promote to production

**GitHub Actions** → **Promote desktop feed** → Run workflow:

| Input | Value |
|-------|--------|
| action | `promote` |
| version | `X.Y.Z` |
| source | `github-release` (preferred) or `staging` |

Approve the **desktop-updates-production** environment when prompted.

Or locally (same SSH + feed key as CI):

```bash
./scripts/promote-desktop-feed.sh promote X.Y.Z
```

### 4. Verify prod

```bash
curl -sS https://exosites.ch/downloads/exo-assistant/latest.json | head
```

---

## Rollback

**Actions** → **Promote desktop feed** → `action=rollback` → approve environment.

Or:

```bash
./scripts/promote-desktop-feed.sh rollback
```

Requires a prior promote (LKG must contain `latest.json`).
