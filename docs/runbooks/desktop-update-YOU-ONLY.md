# Desktop update pipeline — only you can do these

Code for Phase 0–2 is in the repo. Finish these ops/human steps, then every release is tag → smoke → promote.

## Must do once

1. **Commit + push** this pipeline work (ask the agent if you want a commit).
2. Ops already done for you:
   - Staging dir + secret
   - LKG dir `exo-assistant-lkg` on Infomaniak
   - GitHub Environment `desktop-updates-production` with you as required reviewer  
     https://github.com/Chadoud/assistant-ai/settings/environments
3. Optional: add secret `EXOSITES_DOWNLOADS_LKG_PATH` =
   `./sites/exosites.ch/downloads/exo-assistant-lkg` (CI defaults work without it)
4. Confirm secrets: `EXOSITES_DOWNLOADS_STAGING_PATH`, `EXOSITES_DOWNLOADS_PATH`, SSH + feed key

## First end-to-end test (after push)

1. Tag a real version (or wait for next release): `vX.Y.Z`
2. Check staging `latest.json` updated; **prod unchanged**
3. Smoke staging DMG / feed
4. Actions → **Promote desktop feed** → promote `X.Y.Z` → **approve** environment
5. Check prod `latest.json` == `X.Y.Z`
6. (Optional) Actions → rollback → confirm prod reverts to LKG

## Every release after that

Follow [desktop-update-promote.md](./desktop-update-promote.md).
