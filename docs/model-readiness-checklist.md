# Prospective injury-model readiness checklist

This checklist is a release blocker for any future work that attempts to convert the research benchmark into a patient-facing injury-risk product.

## Cohort definition

- [ ] Target injury is defined before modeling.
- [ ] Prediction horizon is explicit.
- [ ] Prediction index time is explicit.
- [ ] Row-level `feature_cutoff_time` is confirmed to be at or before `index_time`.
- [ ] `outcome_window_end` exactly matches the declared horizon.
- [ ] Positive labels are reconciled with an adjudicated future injury event time.
- [ ] Reused outcome-event IDs and overlapping windows are audited.
- [ ] Any repeated-risk design that permits overlapping windows is pre-specified and reported as correlated repeated prediction opportunities.
- [ ] Outcome adjudication method is documented.
- [ ] Participant inclusion/exclusion criteria are documented.
- [ ] Dataset/license/provenance are recorded.
- [ ] The canonical cohort-audit JSON is retained with the model artifact.

## Independent information and pre-fit planning

- [ ] The independence unit is explicitly defined; repeated rows are not reported as independent participants.
- [ ] Participant-level counts include participants with and without at least one positive outcome window.
- [ ] Site-level event imbalance is reported before model performance is inspected.
- [ ] Predictor missingness is reported before model performance is inspected.
- [ ] A context-specific sample-size/information justification is documented; a universal events-per-predictor rule is not substituted for it.
- [ ] The exact candidate predictor list is frozen before performance evaluation.
- [ ] Predictor order and preprocessing/transformation rules are frozen before performance evaluation.
- [ ] Candidate model families are frozen before performance evaluation.
- [ ] Post-hoc feature expansion to improve observed performance is prohibited.
- [ ] A versioned feature plan explicitly authorizes model fitting; an information-audit-only plan cannot be used to fit a model.
- [ ] Any change to the outcome, horizon, feature set, transformations, or candidate model families creates a new versioned plan and is clearly separated from prior performance results.

## Camera measurement validity

- [ ] Camera/pose implementation has a version identifier.
- [ ] Single-leg squat protocol matches the intended measurement definition.
- [ ] A measurement-validation report contains only one `camera_measurement_version`.
- [ ] Low-confidence repetitions are rejected rather than imputed as normal movement.
- [ ] Test-retest data use a pre-specified session pair.
- [ ] Absolute-agreement ICC, SEM, and MDC95 are reported for test-retest measurements.
- [ ] Test-retest bias and 95% Bland-Altman limits of agreement are reported.
- [ ] Same-camera-domain agreement is quantified against an accepted reference measurement when a criterion reference is available.
- [ ] Reference agreement reports bias, limits of agreement, MAE, RMSE, and participant-cluster uncertainty.
- [ ] Correlation is not interpreted as a substitute for agreement.
- [ ] Measurement error is characterized across supported devices and capture conditions.
- [ ] Any algorithm/protocol change that can alter the measurement creates a new version and triggers renewed validation.
- [ ] Clinical acceptability limits, if used, were specified before the validation results were inspected.

## Internal model evaluation

- [ ] Repeated observations from one participant never cross outer folds.
- [ ] Model-family selection occurs only inside outer training data.
- [ ] Calibration occurs only inside outer training data.
- [ ] Operating-threshold selection occurs only inside outer training data.
- [ ] AUROC and AUPRC are reported.
- [ ] AUPRC is interpreted relative to event prevalence.
- [ ] Brier score and Brier skill are reported.
- [ ] Calibration intercept, calibration slope, and ECE are reported.
- [ ] Sensitivity, specificity, balanced accuracy, and confusion matrix are reported.
- [ ] 95% participant-cluster bootstrap intervals are reported.
- [ ] Subgroup audit is reported with explicit insufficient-sample states.
- [ ] Missingness is reported by predictor.

## Scientific added-value testing

- [ ] Camera-derived predictors are compared against an otherwise identical reference model containing all eligible non-camera predictors.
- [ ] Camera-derived longitudinal changes remain assigned to the camera feature set rather than being hidden in a generic longitudinal domain.
- [ ] Reference and camera-expanded models use the same participants and the same deterministic participant-grouped outer-fold contract.
- [ ] Camera-only performance is reported descriptively but is not treated as evidence that the camera adds value beyond established predictors.
- [ ] Paired incremental `deltaAuROC`, `deltaAuPRC`, and Brier improvement are reported.
- [ ] Incremental uncertainty is estimated with participant-cluster bootstrap intervals.
- [ ] Mixed or inconclusive incremental results are not promoted as evidence of benefit.
- [ ] Predictive incremental value is not described as causality or proof that changing the measured movement prevents injury.

## Generalization

- [ ] Leave-one-site-out stress testing is reported when multi-site development data are available.
- [ ] Site holdout is not mislabeled as external validation when sites come from the same development data-generating program.
- [ ] A pre-specified chronological cutoff is used for temporal transport testing when longitudinal calendar data are available.
- [ ] Temporal development rows have fully resolved outcome windows by the cutoff; straddling unresolved windows are excluded.
- [ ] Model family, calibration, and threshold are frozen from the earlier period before later-period temporal evaluation.
- [ ] Temporal holdout within the same data-generating program is not mislabeled as independent external validation.
- [ ] Independent external cohort has been evaluated without refitting to its outcomes.
- [ ] External model-family choice, calibration, features, and operating threshold remain frozen from development.
- [ ] External cohort identity differs from the development cohort and the input file is not the development file.
- [ ] Participant independence from the development cohort is verified.
- [ ] External population/protocol differences are documented.
- [ ] Calibration transport is assessed externally.
- [ ] Performance is evaluated across relevant subgroups and sites.
- [ ] Failure modes and out-of-distribution conditions are documented.

## Governance before any individual risk output

- [ ] Clinical review completed.
- [ ] Statistical/model-risk review completed.
- [ ] Bias/fairness review completed.
- [ ] Privacy/security review completed.
- [ ] Intended-use statement completed.
- [ ] Regulatory pathway reviewed for the intended claim.
- [ ] Monitoring/drift/rollback plan exists.
- [ ] Human-oversight and escalation workflow exists.

## Product rule

Passing this checklist does not automatically authorize an injury probability. The software contract remains fail-closed until a separate reviewed product decision deliberately changes it.
