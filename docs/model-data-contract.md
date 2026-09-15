# Matrix-driven model contracts

The canonical matrix in `data/data-source-matrix.json` is now treated as a testable contract for model inputs rather than documentation only.

## Prospective injury research

`ml/data_source_matrix.py` derives the prospective research domains from data-piece IDs matching:

```text
prospective-<domain>-domain
```

Hyphens in the matrix ID become underscores in the Python domain name. For example:

```text
prospective-camera-biomechanics-domain -> camera_biomechanics
```

`ml/test_matrix_model_contract.py` compares that canonical mapping against `prospective_injury_benchmark.FEATURE_DOMAINS` exactly. Any added, removed, renamed, or reordered predictor in one place without the other fails CI before research artifacts can be produced from a silently different feature contract.

## Movement-quality research

`lib/ai/movement-quality-model.ts` exports one ordered `MOVEMENT_QUALITY_FEATURE_NAMES` constant, and derives the TypeScript union type from that constant. The matrix contract test compares that ordered list against the canonical `movement-quality-feature-vector` fields.

This makes the model artifact contract, TypeScript type, and canonical provenance matrix move together.

## Matrix fingerprint

`data_source_matrix_sha256()` returns a SHA-256 fingerprint of the exact matrix file. Research scripts can stamp this fingerprint into future artifacts so results can be traced to the exact source/field registry used at evaluation time.

CLI examples:

```bash
python ml/data_source_matrix.py --feature-domains
python ml/data_source_matrix.py --movement-quality-features
python ml/data_source_matrix.py --hash
```

## Boundary

Alignment proves that code and provenance metadata refer to the same feature contract. It does not establish clinical validity, causal meaning, measurement equivalence, or future-injury prediction performance.
