# External injury-model evaluation

Internal cross-validation is not external validation. The repository therefore uses a separate evaluator for a frozen prospective injury research model.

## Required separation

The external evaluator must not:

- refit the prediction model,
- reselect the model family,
- refit probability calibration,
- choose a new operating threshold from external outcomes,
- change the feature list after seeing external performance.

`ml/evaluate_external_injury_model.py` applies the model, calibration map, feature contract, and threshold exactly as exported from development.

## Development-cohort identity

The canonical training command stamps the research model with:

- a human-defined development cohort ID,
- SHA-256 of the development input file,
- the camera/measurement implementation version,
- the existing research-only and no-user-facing-probability flags.

The external evaluator blocks the report's identity/domain gate when:

- the external cohort ID equals the development cohort ID,
- the external input file is byte-identical to the development input,
- the camera/measurement version differs from the model's development version,
- participant independence from the development cohort has not been explicitly attested.

The participant-independence attestation is necessary because participant identifiers are intentionally not embedded in the model artifact. For high-stakes studies, cohort governance should verify this against the source registries rather than relying on filenames or de-identified IDs alone.

## External cohort quality

The external CSV must pass the same prospective timing/leakage audit as the development cohort. A mislabeled or post-index external dataset does not become valid simply because it is geographically separate.

The evaluator reports:

- AUROC,
- AUPRC and event prevalence,
- Brier score and Brier skill,
- sensitivity and specificity at the **frozen development threshold**,
- balanced accuracy,
- calibration intercept and slope,
- expected calibration error,
- participant-cluster bootstrap intervals,
- available subgroup audits,
- cohort identity/domain blockers.

## Same-domain versus transport studies

The evaluator currently treats a different camera/measurement implementation as a blocker for the same-domain external-validation gate. A different measurement implementation can still be scientifically useful, but it should be labeled as a separate transport/measurement-domain study rather than silently pooled with same-domain validation.

## Product rule

An external report cannot enable a patient-facing injury probability. The report explicitly preserves `eligibleForUserFacingInjuryProbability: false`.

External evaluation is one requirement in a longer chain that still includes clinical review, calibration/utility assessment in the intended setting, bias/fairness review, measurement validation, governance, and any applicable regulatory work.
