# Sort Structure Templates

Users can define a **folder structure template** in Settings → Sort instructions instead of writing long custom sort prompts.

## Concepts

- **Module** — one level in the output tree (e.g. Client, then Project — or any other subject → sub-subject stack).
- **Theme** — what the AI extracts at that level (`document_type`, `person`, `organization`, `project`, `country`, `property`, `year`, `auto`, `custom`, …).
- **Max folders** — optional hard cap; overflow groups into `Other {Theme}` (e.g. `Other Clients`).
- **Structure pack** — importable JSON preset (like rule packs). Bundled examples: Client → Project, Vendor → Document type, Country → Property, Document type → Year; build any stack in the UI or import your own pack.

### Example structures (all supported)

| Outer level | Inner level | Use case |
|-------------|-------------|----------|
| Client | Project | Agency / freelance deliverables |
| Vendor | Document type | AP invoices, contracts, receipts |
| Person | Year | Personal archives |
| Country | Property | Real estate (2-level legacy preset) |
| Country | Property → AI decides | Real estate with subject folders (recommended) |
| Document type | Year | Tax and finance (example preset) |
| Custom label | Custom label | Any domain — you name the themes |

## Default behavior

When the template is **off**, sorting uses the built-in classifier unchanged.

Structure sorting is **opt-in**: enable **Folder structure** in Settings. The same engine applies to every preset stack (Client → Project → Subject, Country → Property → Subject, etc.).

### Three-level real estate (recommended)

- **Country** — issuing country or property location
- **Property** — one stable label per building/plot (not apartment OCR)
- **AI decides** — subject: Electricity, Ownership, Payments, Contracts, Identity, Correspondence, Other

Example path: `Egypt/Building 32 — Hospital Street/Electricity`

Batch **property clustering** merges files about the same plot/building within one job before folder caps run.

## Precedence

1. Extract + classify (structured when template enabled)
2. Confidence gates
3. Automation rules (override entire path or skip to review)
4. Cap finalize (batch, after all files analyzed)
5. Review / apply

## API

Jobs accept optional `sort_structure_template` on analyze/sort/Gmail/Drive requests. Stored in `JobConfig`.

`GET /job/{id}/structure-summary` returns root folder counts and cap rewrite stats (no filenames).

## Voice sorts

When the desktop app is running, Settings → Sort instructions are mirrored to the backend via
``POST /sort/desktop-defaults``. Voice ``start_local_file_sort`` merges those defaults (structure
template, rules, custom prompt, output folder, OCR, etc.) so voice-triggered sorts match the Sort tab.

If the backend has not received a sync yet (e.g. browser-only dev), voice sorts use built-in defaults.
