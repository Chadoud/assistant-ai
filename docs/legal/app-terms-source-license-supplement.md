# App Terms supplement — PolyForm Noncommercial source license

**Status:** Merged into **exosites-agency** (July 2026).  
**Publish target:** `src/translations/pages/appTerms.ts` (EN + FR `appTerms.s12.*`) and `src/pages/Legal/AppTermsPage.tsx` (`SECTION_IDS` includes `12`).

## Section added (EN)

**Title:** Source code license  

**Body:** In plain terms: any Exo source code we publish is for noncommercial use only. **Source: PolyForm Noncommercial License 1.0.0** (https://polyformproject.org/licenses/noncommercial/1.0.0). You may view, modify, and share that source for noncommercial purposes only. Commercial use of the published source — including a competing paid product or SaaS built from it — requires a separate written agreement with Exosites (studio@exosites.com). These Terms govern the Software you install; the PolyForm license governs published source. Bundled third-party open-source components stay under their own licenses.

## Section added (FR)

**Title:** Licence du code source  

**Body:** En bref : tout code source Exo que nous publions est réservé à un usage non commercial. **Source : PolyForm Noncommercial License 1.0.0** (https://polyformproject.org/licenses/noncommercial/1.0.0). Vous pouvez consulter, modifier et partager ce code source uniquement à des fins non commerciales. Toute utilisation commerciale du code publié — y compris un produit payant concurrent ou un SaaS dérivé — exige un accord écrit distinct avec Exosites (studio@exosites.com). Les présentes conditions régissent le logiciel que vous installez ; la licence PolyForm régit le code source publié. Les composants open source tiers inclus restent soumis à leurs propres licences.

## After deploy

1. Deploy **exosites-agency** to exosites.ch.
2. Confirm https://exosites.ch/eng/app-terms and `/fr/app-terms` show section 12.
3. From this repo: `npm run verify:legal-urls`.

**Counsel / app re-accept:** Adding a source-code section may not require bumping `LEGAL_TERMS_BUNDLE_VERSION` for end users (most never clone source). Confirm with counsel before forcing re-accept in the desktop app.
