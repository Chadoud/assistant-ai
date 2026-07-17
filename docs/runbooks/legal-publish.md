# Legal publish runbook (PR-1.5.5)

**Owner:** Product + counsel  
**Last updated:** 2026-06-25  
**Blocks store submission:** merge privacy supplement on exosites.ch (see below).

## Data controller (published)

**Exosites** · 21 places d'Armes, 1227 Carouge, Geneva, Switzerland  
studio@exosites.com · +41 22 301 08 12

## Canonical source (exosites-agency)

| Page | Agency repo path | Public URL |
|------|------------------|------------|
| Exo app privacy | `exosites-agency/src/translations/pages/appPrivacy.ts` | https://exosites.ch/eng/app-privacy |
| Exo app terms | `exosites-agency/src/translations/pages/appTerms.ts` | https://exosites.ch/eng/app-terms |
| FR equivalents | Same files (`fr` table) | https://exosites.ch/fr/app-privacy · `/fr/app-terms` |

**July 2026:** Section 12 (*Source code license* / *Licence du code source*) — PolyForm Noncommercial 1.0.0 for published Exo source. Merge spec: [`legal/app-terms-source-license-supplement.md`](../legal/app-terms-source-license-supplement.md).

After agency edits: deploy exosites.ch, then run `npm run verify:legal-urls` from **this** repo.

Counsel packet: [`docs/COUNSEL_REVIEW_PACKET.md`](../COUNSEL_REVIEW_PACKET.md)

---

## Engineering checklist — done

- [x] Public HTTPS URLs (HTTP 200) — `npm run verify:legal-urls`
- [x] Release CI env — `VITE_PRIVACY_POLICY_URL` / `VITE_TERMS_OF_SERVICE_URL`
- [x] Registered address in privacy + terms (EN/FR)
- [x] Mobile, GO SYNC, retention, in-app rights, subprocessors documented
- [x] `LEGAL_TERMS_BUNDLE_VERSION` = `2026-06-25-gdpr-li` (legitimate interest + objection toggles)
- [x] E2E seed aligned (`frontend/e2e/helpers/appReady.ts`)
- [x] In-app: export, objection toggles, crash purge on account delete

---

## Counsel review

Sign-off **2026-06-25** — see [`COUNSEL_REVIEW_PACKET.md`](../COUNSEL_REVIEW_PACKET.md) (legitimate interest for diagnostics; Art. 21 objection in Settings).

**Published (verified 2026-07-17):** EN/FR app privacy include legitimate-interest diagnostics + objection; EN/FR app terms include PolyForm source-license section. `npm run verify:legal-urls` green.

---

## After agency deploy

1. Deploy **exosites-agency** with supplement merged.
2. `npm run verify:legal-urls`

```bash
npm run verify:legal-urls
npm run verify:production
```
