# App privacy supplement — legitimate interest (publish on exosites.ch)

**Effective:** 2026-06-25  
**Legal basis update:** Product diagnostics (usage analytics + crash reports) processed on **legitimate interest** (GDPR Art. 6(1)(f) / Swiss FADP equivalent), not consent.  
**Publish target:** `exosites-agency/src/translations/pages/appPrivacy.ts` (EN + FR tables). Deploy exosites.ch after merge.

---

## EN — insert or replace “Diagnostics & analytics” section

### Diagnostics and product improvement

We process **coarse usage analytics** and **crash reports** to operate, secure, and improve Exo (reliability, bug fixes, understanding which features are used). Our legal basis is **legitimate interest** — not consent.

**What we collect (never file paths or organized content):**

- App version, platform, locale, navigation/tab signals (coarse events)
- Sort job outcomes in buckets (e.g. file count ranges, duration ranges)
- Crash stacks and technical context (scrubbed; breadcrumbs without paths)
- Optional: account ID when you are signed in (internal identifier, not repeated in every event field)

**What we do not collect in diagnostics:** file names, folder paths, email addresses in telemetry, assistant message content, or OAuth tokens.

**Balancing:** Data is minimized, aggregated where possible, retained for **90 days** on our servers (local device copy also pruned on a 90-day schedule). You can **object** anytime in the desktop app: **Settings → Privacy** — uncheck Usage analytics and/or Crash reports.

**Account data rights:**

- **Access / portability:** Settings → Account → **Download my data** (JSON export of cloud-held metadata).
- **Erasure:** Settings → Account → **Delete account** removes your cloud account, linked telemetry, feedback, crash reports, and sync metadata. Local wipe: Settings → Privacy → **Erase local data**.

**Contact / objections:** studio@exosites.com — subject “Privacy objection” or “Data request”.

---

## FR — section équivalente

### Diagnostics et amélioration du produit

Nous traitons l’**analytique d’usage générique** et les **rapports de plantage** pour exploiter, sécuriser et améliorer Exo. Base légale : **intérêt légitime** (art. 6(1)(f) RGPD / équivalent nLPD), pas le consentement.

**Données collectées (jamais chemins de fichiers ni contenu organisé) :** version, plateforme, langue, navigation (événements génériques), résultats de tri par tranches, rapports de plantage techniques (nettoyés).

**Non collecté :** noms de fichiers, chemins, e-mail dans la télémétrie, contenu de l’assistant, jetons OAuth.

**Équilibre :** minimisation, agrégation, conservation **90 jours** sur nos serveurs. **Opposition** : application bureau → **Réglages → Confidentialité** — décocher Analytique d’usage et/ou Rapports de plantage.

**Droits :** **Télécharger mes données** et **Supprimer le compte** sous Réglages → Compte. Effacement local : **Effacer les données locales**.

**Contact :** studio@exosites.com — objet « Opposition confidentialité » ou « Demande de données ».

---

## Counsel sign-off (record)

| Field | Value |
|-------|-------|
| Reviewer | Product engineering (acting counsel per owner request) |
| Date | 2026-06-25 |
| Legal basis | Legitimate interest for coarse diagnostics; contract for account/auth |
| Objection UX | Settings → Privacy toggles (desktop) |
| Erasure | Account delete purges telemetry, feedback, crash_reports, app_sessions |
| Approved | Yes — publish supplement on exosites.ch EN/FR |

**Note:** External counsel may re-review; update this file if redlines are received.
