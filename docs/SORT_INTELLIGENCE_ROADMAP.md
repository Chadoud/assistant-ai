# Sort intelligence roadmap — traceability register

**Created:** 2026-07-02  
**Status:** Active  
**Owner:** Backend / sort pipeline  
**North star:** User drops files → correct folders → fixes exceptions only. Bulk-apply should work on ≥80% of a typical batch without manual country/property surgery.

**Related docs**

| Doc | Role |
|-----|------|
| [SORT_GA_GATES.md](SORT_GA_GATES.md) | Release pass/fail gates |
| [SORT_STRUCTURE_TEMPLATES.md](SORT_STRUCTURE_TEMPLATES.md) | Structure template precedence |
| [CLOUD_SORT_VPS_PLAN.md](CLOUD_SORT_VPS_PLAN.md) | VPS extract + thin client (Phase 4 infra) |
| [CLOUD_LLM_ONLY.md](CLOUD_LLM_ONLY.md) | Inference on VPS only |
| [adr/003-hybrid-image-extraction.md](adr/003-hybrid-image-extraction.md) | Hybrid OCR + vision baseline |
| [accuracy-eval-playbook.md](accuracy-eval-playbook.md) | Eval workflow |
| `.cursor/plans/hilal_structure_remediation.plan.md` | Hilal batch KPI (superseded by this register for global work) |

**Status legend:** `Todo` | `In progress` | `Done` | `Blocked` | `Deferred`

---

## Progress summary

| Phase | Focus | Tasks | Done | In progress | Todo |
|-------|--------|------:|-----:|------------:|-----:|
| **0** | Signal library + eval contract | 8 | 7 | 0 | 1 |
| **1** | Extraction quality (adaptive vision) | 7 | 5 | 0 | 2 |
| **2** | Batch reconciliation (1 LLM/job) | 6 | 5 | 0 | 1 |
| **3** | Learn from user corrections | 5 | 0 | 0 | 5 |
| **4** | VPS extract + shared core | 6 | 0 | 0 | 6 |
| **Total** | | **32** | **17** | **0** | **15** |

_Update the table when tasks change status._

---

## Why this exists

The sort pipeline today:

```
extract (local OCR/vision)
  → briefing (LLM)
  → structure classify (LLM per file)
  → assist (regex/heuristics)
  → assemble → analyze_gates
  → batch cluster (regex) → caps
```

**Root limits (not fixed by more Hilal regex):**

| Limit | Symptom | Example |
|-------|---------|---------|
| **A. Extraction ceiling** | Downstream only as good as OCR/vision | `الغرائقة` vs `الغردقة` — audit vs fingerprint disagree |
| **B. Per-file black box** | Model never reasons over the batch | Building 7, fragmented properties |
| **C. Regex rescue layer** | Every OCR variant needs a new rule | Boat guard skipped when subject preset |

**Target architecture — three layers:**

1. **Signal** — shared deterministic cues (geo, property, doc_kind, subject)
2. **Per-file reasoning** — structured LLM output on quality-adaptive extract
3. **Batch reconciliation** — one LLM pass per job to merge property clusters and fix outliers

**Efficiency rule:** Highest ROI = **(1) structured vision on degraded scans** + **(2) one batch reconcile call per job**. Stop growing per-row regex.

---

## Global metrics (track in eval + telemetry)

| Metric | Target (structure sorts) | Source |
|--------|--------------------------|--------|
| `uncertain_rate` | ≤20% on corpus | `classify_eval/kpi_guardrails.py` |
| `geo_conflict_rate` | ≤2% | `classify_audit_json` on sort-plan CSV |
| `structure_parse_failed_rate` | ≤1% | job rows |
| `cluster_cohesion` | ≥80% utility batch in one property cluster | `structure-summary` / CSV |
| `two_level_path_rate` (3-level template) | 0% | assemble validation |
| `false_country_rate` | ≤3% on geo-tagged fixtures | `egypt_electricity_uae_regression.json` |
| `user_override_rate` | ↓ week over week (beta) | telemetry (bucketed, no paths) |
| p95 `analyze_classify_ms` | ≤ budget in [SORT_THROUGHPUT.md](SORT_THROUGHPUT.md) | job timings |

**Hilal manual gate** (reference batch): see [SORT_GA_GATES.md § Phase 3b](SORT_GA_GATES.md).

| Check | Pass |
|-------|------|
| 25/25 complete, 0 errors | |
| Uncertain ≤ 5 | |
| Egypt `Building 32 — Hospital Street` paths ≥ 10 | |
| Unique Egypt property names (utility batch) ≤ 2 | |
| Building 7 count = 0 | |
| Row #1 = Egypt B32/Electricity | |
| One `structure_cluster_id` on utility batch | |
| No 2-level B32 paths | |
| Passports → `{Country}/Identity Documents/Identity` or Uncertain | |
| Boat + Cairo correspondence out of B32 cluster | |

**Latest reference runs**

| Job ID | Date | Notes |
|--------|------|-------|
| `8d717fed` | 2026-07-02 | Pre-remediation; row #1 UAE regression |
| `03311eb2` | 2026-07-02 | Row #1 fixed; Building 7, 2-level B32, boat merge remain |

---

## Recommended schedule

| Weeks | Phase | Outcome |
|------:|-------|---------|
| 1–2 | **0** | Unified signals; Hilal fixtures in CI; regex drift stopped |
| 3–5 | **1** | Adaptive structured vision on low-quality scans |
| 6–9 | **2** | Batch reconcile — cross-file “smart” layer |
| 10–14 | **3** | Correction memory from review UI |
| Parallel | **4** | VPS extract after shared core from 0–2 |

**Minimum viable intelligence (ship these two):** Phase **0.1** + **1.2** + **2.1–2.3**.

---

## Phase 0 — Stop the bleeding (signal library + eval contract)

**Goal:** One source of truth for geo/property cues; every fix is a fixture; quick logic bugs closed.

| Task ID | Title | Status | Depends | Acceptance |
|---------|-------|--------|---------|------------|
| P0-0.1.1 | Create `backend/sort_signals/` package (`geo.py`, `property.py`, `subject.py`, `doc_kind.py`) | Done | — | Module imports only patterns + helpers; no LLM |
| P0-0.1.2 | Migrate `classify_audit` geo patterns → `sort_signals.geo` | Done | P0-0.1.1 | `infer_document_regions` unchanged behavior + OCR variants (`الغرائقة`, `مدبرية`) |
| P0-0.1.3 | Migrate `property_fingerprint` regexes → `sort_signals.property` | Done | P0-0.1.1 | `test_property_fingerprint.py` green |
| P0-0.1.4 | Wire `assist`, `cluster`, `passport_country` to `sort_signals` | Done | P0-0.1.2, P0-0.1.3 | No duplicate geo/property regex outside `sort_signals/` |
| P0-0.2.1 | Add Hilal regression fixture (`structure_corpus` or `classify_eval/fixtures/hilal_batch.json`) | Done | — | Documents rows #1, #3, #4, #13, #24 expected paths |
| P0-0.2.2 | Extend `egypt_electricity_uae_regression.json` for geo_override cases | Todo | P0-0.1.2 | CI fails if UAE on Hurghada MOJ form |
| P0-0.2.3 | Document “no sort fix without fixture” in `accuracy-eval-playbook.md` | Done | P0-0.2.1 | One paragraph + link to this doc |
| P0-0.3.1 | Fix cluster boat exclusion (check before subject shortcut) | Done | — | `test_portfolio_cluster_skips_boat_certificate` + row #13 scenario |
| P0-0.3.2 | Fix 2-level B32 paths (subject infer before cluster rewrite) | Done | — | Row #4 → `…/Electricity` via `كهرياء` subject cue |
| P0-0.3.3 | Weak-text bank slip → Uncertain or Egypt via signals (row #24) | Done | P0-0.1.2 | No invented UAE without passport/MRZ |

**Phase 0 verify**

```bash
cd backend && python -m pytest -q \
  tests/test_sort_structure*.py \
  tests/test_property_fingerprint.py \
  tests/test_passport_country.py \
  tests/test_analyze_policy_structure.py \
  tests/test_geo_sort_accuracy.py
bash scripts/verify-sort-structure-templates.sh
python -m classify_eval.kpi_guardrails \
  --sort-plan classify_eval/fixtures/baseline_sort_plan.csv \
  --max-uncertain-rate 0.60 --max-error-rate 0.10 --max-p90-ms 5000
```

**Phase 0 exit:** Hilal fixture green in CI; zero duplicate geo regexes; `03311eb2` gaps (#3, #4, #13, #24) addressed or tracked with owner.

---

## Phase 1 — Extraction quality gate (highest global ROI)

**Goal:** Raise the input ceiling so classify/briefing reason on structured fields, not OCR noise.

| Task ID | Title | Status | Depends | Acceptance |
|---------|-------|--------|---------|------------|
| P1-1.1.1 | Unified `extraction_confidence` scorer in `ingest_common.py` | Done | P0 done | Single score: OCR density, script, vision flag, briefing usability |
| P1-1.1.2 | Wire scorer to `effective_quality_for_gates` and analyze row patch | Todo | P1-1.1.1 | Sort-plan CSV exposes consistent quality |
| P1-1.2.1 | Structured vision extract schema (`doc_kind`, `issuer_country`, `property_cues[]`, `subject_cues[]`) | Done | P1-1.1.1 | `sort_structure/vision_extract.py` |
| P1-1.2.2 | Trigger structured vision when `extraction_confidence < 0.45` on image/PDF scan | Done | P1-1.2.1 | Gate `EXOSITES_STRUCTURED_VISION_ENABLE` (default off) |
| P1-1.2.3 | Merge structured fields into excerpt as `[Structured]` block for briefing/classify | Done | P1-1.2.2 | Classify uses hints; schema caps enforced |
| P1-1.3.1 | Arabic OCR user-words / Red Sea utility vocabulary for Tesseract | Todo | — | `backend/tests/test_ingest_tesseract_arabic.py` extended |
| P1-1.3.2 | Document vision budget impact in `SORT_THROUGHPUT.md` | Todo | P1-1.2.2 | p95 extract + classify documented |

**Phase 1 exit:** Corpus `uncertain_rate` ↓ ≥5pp vs baseline; Hilal vision-only passports file or stay honestly Uncertain; clean PDFs unchanged.

---

## Phase 2 — Batch reconciliation (cross-file intelligence)

**Goal:** One LLM call per job reconciles property clusters; deterministic safety unchanged.

| Task ID | Title | Status | Depends | Acceptance |
|---------|-------|--------|---------|------------|
| P2-2.1.1 | Design `reconcile_structure_batch(job, contract)` API + JSON schema | Done | P0, P1 | `sort_structure/reconcile.py` |
| P2-2.2.1 | Implement reconcile module `backend/sort_structure/reconcile.py` | Done | P2-2.1.1 | Mocked LLM unit tests |
| P2-2.2.2 | Input: row summaries (no filenames); cluster proposals from `finalize_structure_property_clusters` pre-pass | Done | P2-2.2.1 | Privacy: no paths in prompt |
| P2-2.2.3 | Output: per-row `{country, property, subject, confidence, outlier}` + post-assemble gate check | Done | P2-2.2.1 | `normalize_rel_dest` + caps unchanged |
| P2-2.3.1 | Wire into `job_service/_impl.py` after per-file analyze, before `finalize_structure_caps` | Done | P2-2.2.3 | `EXOSITES_STRUCTURE_BATCH_RECONCILE_ENABLE` (default on) |
| P2-2.3.2 | Skip reconcile when job < 3 files or all rows high confidence | Done | P2-2.3.1 | No extra LLM on tiny jobs |

**Phase 2 exit:** Hilal ≥12 B32 paths, one cluster ID, Building 7 = 0, boat excluded; France villa single-file fixture unchanged; job p95 classify + ≤3s for 25 files.

---

## Phase 3 — Learn from exceptions (compounding accuracy)

**Goal:** User corrections improve the next sort without manual taxonomy tuning.

| Task ID | Title | Status | Depends | Acceptance |
|---------|-------|--------|---------|------------|
| P3-3.1.1 | Telemetry: `sort_user_override` (bucketed: country/property/subject/uncertain) | Todo | — | [event-registry.md](analytics/event-registry.md); no paths |
| P3-3.2.1 | Local correction store (output root scoped, Electron safeStorage or backend sqlite) | Todo | P3-3.1.1 | Clearable in Settings |
| P3-3.2.2 | Inject correction hints into `reconcile_structure_batch` | Todo | P2, P3-3.2.1 | Second Hilal run: override rate ↓ ≥30% |
| P3-3.3.1 | Weekly script: frequent overrides → proposed eval fixtures | Todo | P3-3.1.1 | `scripts/propose-sort-fixtures.py` or doc-only first |
| P3-3.4.1 | Security review: correction store + telemetry | Todo | P3-3.2.1 | `project-security.mdc` sign-off |

**Phase 3 exit:** Documented privacy model; measurable override reduction on repeat batches.

---

## Phase 4 — Cloud extract + shared core (infra parallel)

**Goal:** Same intelligence on desktop and VPS; better OCR environment. **Do not start until Phase 0–2 logic lives in importable shared modules.**

| Task ID | Title | Status | Depends | Acceptance |
|---------|-------|--------|---------|------------|
| P4-4.1.1 | Extract `sort_signals` + `sort_structure` reconcile into `exo-sort-core` package | Todo | P0, P2 | Local + VPS import same code |
| P4-4.2.1 | VPS extract API (`POST /v1/sort/extract`) per [CLOUD_SORT_VPS_PLAN.md](CLOUD_SORT_VPS_PLAN.md) | Todo | P4-4.1.1 | Contract tests vs local `ingestor` |
| P4-4.2.2 | Hybrid vision + structured extract on worker | Todo | P1, P4-4.2.1 | ADR-003 parity |
| P4-4.3.1 | `sort_service_mode=cloud_full` desktop path | Todo | P4-4.2.1 | No local tesseract during entitled sort |
| P4-4.4.1 | Update `SORT_GA_GATES.md` for VPS corpus ±2% | Todo | P4-4.3.1 | `ga-staging-fixture-gate` on worker |
| P4-4.4.2 | Retention + privacy sign-off ([CLOUD_SORT_PRIVACY.md](CLOUD_SORT_PRIVACY.md)) | Todo | P4-4.2.1 | Upload TTL ≤15 min |

**Phase 4 exit:** 100 mixed files on VPS with no local extract; GA gates updated.

---

## What we stop doing

| Stop | Do instead |
|------|------------|
| Hilal-specific regex per CSV row | Fixture + `sort_signals` entry |
| Duplicate geo in audit vs fingerprint | `sort_signals.geo` only |
| Growing `assist.py` override branches | Batch reconcile + correction memory |
| Chasing 100% on vision-only passports | Honest Uncertain + bulk-apply the clear 80% |
| Sort intelligence PR without eval delta | `kpi_guardrails` + structure tests |

---

## PR slice order (suggested)

| Order | PR scope | Unblocks |
|------:|----------|----------|
| 1 | P0-0.1.1–0.1.4 `sort_signals` | All later phases |
| 2 | P0-0.3.1–0.3.3 cluster/assist bugs | Hilal KPI |
| 3 | P0-0.2.1–0.2.2 fixtures + CI | Regression safety |
| 4 | P1-1.1 + P1-1.2 structured vision | Global accuracy |
| 5 | P2-2.1–2.3 batch reconcile | Cross-file smart |
| 6 | P3-3.1–3.2 correction loop | Compounding |
| 7 | P4 parallel VPS extract | Scale + unified OCR |

---

## Honest expectations (after full roadmap)

| Batch type | After Phase 0–2 | After Phase 3–4 |
|------------|-----------------|-----------------|
| Clean PDFs, English | ~95% bulk-apply | ~98% |
| Phone photos, multilingual (Hilal class) | ~75–85% bulk-apply | ~85–90% |
| Vision-only identity (no MRZ) | Uncertain (correct) | Better with structured vision |
| Unrelated mixed receipts | Separate or Uncertain | Same |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-03 | Phase 1 core + Phase 2 batch reconcile shipped (flags default off) |
| 2026-07-02 | Phase 0 complete: `sort_signals` package, Hilal fixtures, boat/UAE/OCR fixes |
| 2026-07-02 | Initial register from Hilal `03311eb2` analysis + global architecture plan |
