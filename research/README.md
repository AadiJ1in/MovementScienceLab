# Generated research outputs

This directory is reserved for local or CI-generated research artifacts that should not become source-of-truth configuration.

The canonical model/data contract lives in `data/data-source-matrix.json`. Generate a current feature-contract report with:

```bash
python ml/feature_contract_report.py > research/model-feature-contract.json
```

`model-feature-contract.json` is ignored because it is derived from the canonical matrix and active code contracts. Commit changes to the canonical matrix or model contract itself instead of editing generated output.
