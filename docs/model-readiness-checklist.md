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

## Camera measurement validity

- [ ] Camera/pose implementation has a version identifier.
- [ ] Single-leg squat protocol matches the intended measurement definition.
- [ ] Low-confidence repetitions are rejected rather than imputed as normal movement.
- [ ] Same-camera-domain agreement is quantified against an accepted reference measurement.
- [ ] Repeatability/retest reliability is quantified.
- [ ] Measurement error is characterized across supported devices and capture conditions.

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

## Generalization

- [ ] Independent external cohort has been evaluated without refitting to its outcomes.
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
