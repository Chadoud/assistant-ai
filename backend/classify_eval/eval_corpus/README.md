# Eval corpus (local, optional)

This directory is for **your** frozen evaluation files—not committed to git by default.

## How to use

1. Create a subfolder (e.g. `sample_2026_04/`) and copy representative files: PDFs (text + scan), images, office exports.
2. Run the app against that folder; export **sort-plan CSV** after the job.
3. Store baseline metrics using [docs/accuracy-eval-playbook.md](../../../docs/accuracy-eval-playbook.md).
4. **Do not commit** personally identifiable or sensitive documents. If you need a shared team corpus, use a private storage bucket or encrypted archive outside the repo.

`python -m classify_eval.run_eval --json-out report.json` includes aggregate **metrics** (margin distribution, confusion pairs) over JSON fixtures in `classify_eval/fixtures/`.

## Optional gold file

Keep `my_gold.json` next to your corpus (same format as [gold_labels.example.json](../gold_labels.example.json)) and pass it to:

```bash
python -m classify_eval.summarize_export plan.csv --gold my_gold.json
```
