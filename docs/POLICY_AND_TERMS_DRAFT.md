# EXO — Terms, Privacy, and Acceptable Use (draft)

**Status:** **Superseded** — canonical legal copy lives in **exosites-agency** (`src/translations/pages/appPrivacy.ts`, `appTerms.ts`), published at https://exosites.ch/eng/app-privacy and `/eng/app-terms`. Keep this file for historical reference only; do not publish from here.

**Status (archived draft):** Draft for **legal review only**. Not legal advice. Replace all `[BRACKETED]` placeholders before publication.  
**Product:** EXO (desktop / local web UI; optional cloud auth and third-party AI).  
**Related engineering truth:** [`SECURITY.md`](../SECURITY.md) (data flows, telemetry allowlist, Gmail/Drive, Sentry).  
**Publication:** Point `VITE_PRIVACY_POLICY_URL` at a hosted page containing these documents (or split into separate URLs). Optional: `VITE_TERMS_OF_SERVICE_URL` for a dedicated Terms URL; the first-run **Privacy & diagnostics** step requires users to accept before **Next** / **Skip** on that step, and stores `acceptedLegalTermsVersion` in app settings (see `LEGAL_TERMS_BUNDLE_VERSION` in `frontend/src/constants.ts`).

**Version:** `[1.0]` · **Effective date:** `[DATE]` · **Last reviewed:** `[DATE]`

---

## How to use this file

1. Fill in entity name, address, contacts, governing law, and retention numbers with counsel.  
2. Reconcile every claim with `SECURITY.md` and your shipped build (especially telemetry, crash reporting, and OAuth).  
3. Host publicly and update the in-app link (`VITE_PRIVACY_POLICY_URL`).  
4. Keep a **change log** at the bottom when you revise (users and app stores may require notice of material changes).

---

# Part A — Terms of Service

## A1. Agreement

These Terms of Service (“**Terms**”) govern your use of EXO and related services (collectively, the “**Service**”) provided by `[COMPANY LEGAL NAME]` (“**we**,” “**us**,” “**our**”). By installing, accessing, or using the Service, you agree to these Terms and our Privacy Policy (Part B). If you do not agree, do not use the Service.

## A2. Eligibility; organizational use

You represent that you have legal capacity to agree in your jurisdiction. If you use the Service on behalf of an organization, you represent that you have authority to bind that organization.

## A3. The Service

The Service helps you organize files using local processing and, depending on your settings, optional integrations and AI features. Features may differ by platform, build, region, subscription, or beta program. We may modify or discontinue features with reasonable notice where practicable.

## A4. Accounts, licensing, and beta access

Some builds require sign-in, a license key, or entitlement checks against endpoints we operate. You are responsible for safeguarding credentials and for activity under your account. You must provide accurate registration information where required.

## A5. License to you

Subject to these Terms, we grant you a personal or internal business license to use the Service, non-exclusive, non-transferable (except as law allows), revocable, and limited to the scope of your plan.

## A6. Restrictions

You will not, and will not assist others to:

- Violate law or third-party rights.
- Reverse engineer, decompile, or disassemble the Service except where applicable law overrides this restriction.
- Circumvent technical limits, security controls, licensing, metering, or access controls.
- Use the Service to develop a competing product by extracting non-public interfaces or training on our software in ways that breach these Terms.
- Interfere with or overload the Service or our systems (including denial-of-service style use).

## A7. Your files and content

You retain your rights in your files and other content you process (“**User Content**”). You grant us permission to process User Content **only** as needed to provide the features you invoke (for example: reading files you select, sending excerpts to a model provider you configure, or storing staging copies as described in product documentation).

You represent you have the rights necessary to process User Content and to connect third-party accounts.

## A8. AI outputs and human review

The Service may produce automated suggestions, classifications, or text using AI. **Outputs may be wrong, incomplete, biased, or unsafe for your use case.** You are solely responsible for reviewing outputs before you act on them (including moving, deleting, or sharing files). The Service is **not** legal, medical, tax, accounting, or other professional advice.

## A9. Third-party services

The Service may interoperate with third parties (for example Google for Gmail/Drive OAuth, or model providers for cloud AI). Those services are governed by their own terms and privacy policies. We are not responsible for third-party services or their availability.

## A10. Fees

If you purchase paid features, fees and billing terms are presented at checkout. Unless required by law, payments are non-refundable except as expressly stated at purchase. We may change prices prospectively with notice.

## A11. Privacy

Our collection and use of personal information is described in Part B (Privacy Policy), which is incorporated by reference.

## A12. Security

No method of transmission or storage is perfectly secure. You are responsible for device security, backups, and access control to your machine and accounts.

## A13. Disclaimer of warranties

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.

## A14. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW:

- WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION.
- OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (i) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (ii) `[USD $100]`.

Some jurisdictions do not allow certain limitations; in those cases, our liability is limited to the fullest extent permitted.

## A15. Indemnity

You will defend and indemnify us against claims and liabilities arising from your User Content, your misuse of the Service, or your violation of these Terms or law, subject to `[CARVE-OUTS PER COUNSEL]`.

## A16. Suspension and termination

We may suspend or terminate access for breach, risk to security, legal requirements, or abuse. You may stop using the Service at any time. Provisions that by nature should survive will survive termination.

## A17. Export and sanctions

You represent that you are not barred from using the Service under applicable export control or sanctions laws.

## A18. Changes

We may update these Terms. We will post the updated Terms and update the “Last reviewed” date. If changes are material, we will provide reasonable notice (for example in-app or by email). Continued use after the effective date constitutes acceptance unless applicable law requires otherwise.

## A19. Governing law and disputes

**Select one approach with counsel:**

- **Option 1 — Courts:** These Terms are governed by the laws of `[STATE/COUNTRY]`, excluding conflict-of-law rules. Courts in `[VENUE]` have exclusive jurisdiction, subject to mandatory consumer protections.
- **Option 2 — Arbitration:** Disputes will be resolved by binding arbitration in `[LOCATION]` under `[RULES]`, on an individual basis. Class actions and jury trials are waived to the extent permitted by law, with exceptions for small claims court.

## A20. Contact

`[COMPANY LEGAL NAME]`  
`[STREET]` · `[CITY, REGION, POSTAL]` · `[COUNTRY]`  
Legal / general: `[LEGAL EMAIL]`  
Privacy requests: `[PRIVACY EMAIL]`

---

# Part B — Privacy Policy

## B1. Who we are

`[COMPANY LEGAL NAME]` is the data controller for personal data described here (unless we state we act as a processor for your organization under a separate agreement).

## B2. Scope

This policy describes how we collect, use, disclose, and retain personal information when you use the Service. It applies to the desktop application, local API, and any web surfaces we operate for authentication or marketing tied to the product.

Technical detail on **what the product touches** is summarized in [`SECURITY.md`](../SECURITY.md).

## B3. Plain-language summary (non-binding)

- The app is built to process your files **primarily on your device**.  
- **Optional analytics** are coarse and **included when you use Exo** (described in Settings → Privacy & account); they do not include file names, paths, folder names, prompts, or model text when configured as documented.  
- **Gmail and Google Drive** access happens **only when you start** the relevant import or sort flows, not as continuous background scanning.  
- **Crash reporting** is included when the build supports it, as described in the Privacy Policy.  
- **Agent capabilities** (mail, calendar, files, device actions) are controlled in **Settings → Features**; OAuth tokens stay on your device.  
- After a tool runs, the assistant may use a short redacted summary in the next reply (always on — not a separate setting).  
- We use personal information to run the Service, secure it, comply with law, and improve the product.

If this summary conflicts with the binding sections below, the binding sections control.

## B4. Information we collect

### B4.1 You provide

- Account credentials and profile information (if account features exist).
- In-app feedback text you submit.
- Communications with support.

### B4.2 Automatically from the app and device

- App version, UI language, coarse usage events (if enabled), diagnostics you choose to copy, and similar technical metadata.
- Device/OS information needed for compatibility and support.

### B4.3 From files and integrations (when you use features)

- File metadata and content needed for sorting/classification (including text extracted from documents).
- OAuth tokens and integration identifiers for connected accounts (stored locally as described in `SECURITY.md`).
- Staging copies of cloud-downloaded files on disk for sorting, as implemented.

### B4.4 AI and model providers (when enabled)

If you configure cloud AI providers or use features that send text to third-party models, **the provider may process prompts and related content** under its own policy. We encourage you to review provider terms.

### B4.5 Telemetry

We collect **allowlisted** event names and restricted properties consistent with our telemetry schema (see `SECURITY.md`). This is designed to avoid file-path and content leakage in analytics events. Usage analytics are part of using Exo as described in Settings → Privacy & account and this policy — not a separate opt-in toggle in the app.

Telemetry may be stored locally (for example SQLite on the machine running the backend) and/or forwarded depending on deployment. **Retention may not be automatically trimmed** in all builds—treat local databases as under your control in self-hosted or local-only setups.

### B4.6 Crash reports (build-dependent)

When supported by your build, crash reports may contain stack traces and contextual diagnostics. Crash reporting is described in the Privacy Policy and Settings → Privacy & account. Configure scrubbing and DSN usage per your deployment.

## B5. How we use information

We use personal information to:

- Provide, operate, and secure the Service.
- Authenticate users, enforce licenses, and prevent fraud/abuse.
- Process files and integrations you initiate.
- Improve reliability and performance using analytics and crash reporting described in the Privacy Policy.
- Communicate about the Service and respond to requests.
- Comply with law and enforce our terms.

## B6. Legal bases (EEA/UK, where applicable)

We rely on:

- **Contract** (providing the Service).
- **Legitimate interests** (security, abuse prevention, product improvement compatible with user expectations), balanced against your rights.
- **Consent** where required (for example optional analytics/crash reporting or certain cookies on web properties).
- **Legal obligation** where applicable.

## B7. Sharing

We may share information with:

- **Service providers** that help us operate the Service (hosting, email, auth, analytics, crash reporting, model APIs you select).
- **Professional advisers** where required.
- **Authorities** when required by law or to protect rights and safety.

We **do not sell personal information** as defined by U.S. state privacy laws (if that remains true for your business—confirm with counsel).

## B8. International transfers

If personal data moves across borders, we implement appropriate safeguards (for example Standard Contractual Clauses) where required.

## B9. Retention

Retention depends on feature and deployment. Examples counsel should finalize:

| Category | Indicative retention |
|----------|----------------------|
| Account record | `[e.g., life of account + X]` |
| Telemetry (local SQLite) | `[operational / manual rotation]` |
| OAuth tokens | Until disconnect or expiry |
| Staging downloads | Until run completes / per product behavior |
| Support emails | `[X months]` |

## B10. Security

We implement reasonable administrative, technical, and organizational measures. You must keep your device and accounts secure.

## B11. Your rights

Depending on your location, you may have rights to access, correct, delete, port, restrict, or object to certain processing, and to withdraw consent. Contact `[PRIVACY EMAIL]`. We may verify requests and will respond within timelines required by law.

**Appeals:** Where applicable, you may appeal a denied request by contacting us at `[PRIVACY EMAIL]` with “Appeal” in the subject.

## B12. U.S. state privacy rights

Residents of certain U.S. states may have additional rights (including opt-out of sale/sharing, if ever applicable). We describe categories collected and purposes above; a CPRA-style detailed disclosure table should be added here for production if you serve California residents at scale.

## B13. Children

The Service is not directed to children under `[13 / 16]` (pick with counsel). We do not knowingly collect personal information from children in violation of law.

## B14. Automated decision-making

The Service uses automated processing to suggest organization actions. It does not produce legally significant solely automated decisions under GDPR Article 22 unless you later add such features—**update this section if that changes.**

## B15. Changes

We will update this policy when practices change and revise the effective date. Material changes will be notified as required by law.

## B16. Contact

`[COMPANY LEGAL NAME]` · `[ADDRESS]`  
Privacy: `[PRIVACY EMAIL]`  
EU/UK representative (if required): `[DETAILS]`

---

# Part C — Acceptable Use Policy

You agree not to use the Service to:

1. Violate any applicable law, regulation, or governmental order (including export/sanctions).  
2. Infringe intellectual property, privacy, publicity, or other rights.  
3. Distribute malware, exploit vulnerabilities, or attempt unauthorized access to systems, accounts, or data.  
4. Generate or facilitate fraud, phishing, impersonation, harassment, or hate.  
5. Process unlawful content or content you lack rights to process.  
6. Circumvent licensing, metering, rate limits, or security controls.  
7. Scrape, probe, or overload our systems in ways that harm availability.  
8. Use the Service to train competing generalized models **on our software or non-public documentation** in violation of these Terms (narrow as counsel advises).

We may investigate violations and suspend or terminate access.

---

# Part D — Cookies, local storage, and similar technologies

The desktop app uses **local storage** on your device for settings and similar state. A website or embedded authentication page may use **cookies** or similar technologies for session security and basic functionality. Where law requires consent for non-essential cookies, we will provide a consent mechanism on those web surfaces.

Use browser controls and in-app privacy settings to manage preferences where available.

---

# Part F — Mobile app and GO SYNC (addendum for counsel)

**Scope:** Exo mobile (`com.exosites.exosites_mobile`) and **GO SYNC** multi-device sync (Pro entitlement).

## F1. Mobile app

The mobile app provides read-oriented access to synced memories (Today, Memory, Search) and optional future Capture features. File sorting remains primarily on desktop. Mobile requires a cloud account for sign-in.

## F2. GO SYNC — end-to-end encryption

- A **sync master key** is established when the user pairs mobile with desktop (QR flow). The key is stored in device secure storage (Keychain / Keystore) and is **not** sent to our servers in plaintext.
- The cloud **relay** stores **ciphertext only** (encrypted blob envelopes). We cannot read synced memory content on the server.
- Device registration records a device name, platform, and optional push token for future notifications — not file content.

## F3. Mobile data collection (store disclosures)

Align with [`MOBILE_STORE_PRIVACY.md`](MOBILE_STORE_PRIVACY.md): account email (OAuth), tokens, device ID, encrypted sync blobs, optional crash reports (opt-in). Microphone permission may be declared for a future Capture feature; until shipped, the feature remains inactive.

## F4. Your responsibilities

You are responsible for safeguarding paired devices. Unpairing or account deletion removes relay ciphertext per our retention policy; local mobile cache is cleared when you sign out or wipe data in app settings.

---

# Part E — Attorney review checklist (before publication)

- [ ] Entity names, addresses, registration, and contacts are final.  
- [ ] Governing law, venue, and dispute mechanism are chosen and consistent.  
- [ ] Liability caps and warranty disclaimers are valid in each target market.  
- [ ] Refund/subscription rules match each sales channel (direct, app store, enterprise).  
- [ ] Telemetry: event list, props, storage location, retention, and opt-in UX match shipped code (`SECURITY.md`, telemetry schema).  
- [ ] Crash reporting: DSN usage, scrubbing, and user toggle match shipped code.  
- [ ] OAuth: token storage, disconnect behavior, and data minimization are accurately described.  
- [ ] AI providers: list the vendors you integrate and describe what content may be sent.  
- [ ] CPRA/CO/VA/CT/UT disclosures and links are complete if you operate nationally in the U.S.  
- [ ] GDPR/UK GDPR: legal bases, DSR process, transfers, DPIA if needed.  
- [ ] Children’s privacy threshold matches rating and marketing.  
- [ ] “No sale” / targeted advertising statements match reality.  
- [ ] Material change notice process matches what you can operationalize.  
- [ ] Mobile GO SYNC (Part F): E2E encryption, relay zero-knowledge, pairing UX match shipped code.
- [ ] Archive prior versions and dates for auditability.

---

## Document history

| Version | Date | Summary |
|---------|------|---------|
| `[1.0]` | `[DATE]` | Initial combined draft for counsel review. |
