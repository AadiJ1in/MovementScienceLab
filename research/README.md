# Generated research outputs

This directory is reserved for local or CI-generated research artifacts that should not become source-of-truth configuration.

The active model/data contract lives in `data/data-source-matrix.json`. Source-verified but intake-only research datasets live in `data/research-source-intake-matrix.json`.

Generate a current feature-contract report with:

```bash
python ml/feature_contract_report.py > research/model-feature-contract.json
```

`model-feature-contract.json` is ignored because it is derived from the source matrices and active code contracts. Commit changes to the source matrices or model contract itself instead of editing generated output.

## Stamp a research JSON artifact

Use `ml/artifact_provenance.py` to attach exact source-registry hashes, source status, canonical data-piece IDs, and input-file hashes to a JSON result:

```bash
python ml/artifact_provenance.py \
  report.json \
  report.stamped.json \
  --source soccermon \
  --data-piece soccermon-injury-event \
  --data-piece prospective-outcome-and-timing \
  --input-file cohort.csv
```

The stamper fails closed on unknown source/data-piece IDs and refuses to overwrite an existing `provenance.sourceRegistry` block. Intake-only sources remain explicitly labeled `verified-intake-only`; recording their provenance never activates them for training or runtime use.
