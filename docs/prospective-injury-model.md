# Prospective injury-model research plan

## Purpose

Movement Science Lab must distinguish two different ML problems:

1. **Movement-quality classification** — whether a captured repetition resembles reference vs. deviation-labeled movement data.
2. **Future-injury risk estimation** — whether prospectively measured information before an index time predicts a newly observed injury during a defined future horizon.

The second problem requires prospective outcome labels. A model trained only on movement-quality labels must never be relabeled as an injury predictor.

## Evidence informing the feature architecture

The current research architecture is intentionally multimodal rather than `knee angle → injury probability`.

Recent reviews report that injury-prediction work commonly uses training/exposure load, previous injury, physiological or wellness/readiness measures, and biomechanical or neuromuscular factors. They also emphasize heterogeneous methods, small samples, overfitting risk, incomplete uncertainty reporting, and limited external validation:

- **Bingöl et al., 2026 — ACL ML systematic review**. Ten studies; reported AUCs varied widely, with concerns around small samples, overfitting, confidence intervals, class imbalance, and external validation. PMID 42531926. https://pubmed.ncbi.nlm.nih.gov/42531926/
- **Injury Prediction and Risk Modelling in Team Sports Using AI and Sensor-Based Monitoring, 2026 — scoping review**. Common predictors included external workload, exposure, previous injury, and wellness/physiological markers; external validation was rare. PMID 42200910. https://pubmed.ncbi.nlm.nih.gov/42200910/
- **From data to prevention, 2026 — systematic review of AI sports-injury prediction**. Most included prediction studies had important risk-of-bias limitations and relied heavily on internal validation; the review calls for external validation and explainable AI. PMID 42274208. https://pubmed.ncbi.nlm.nih.gov/42274208/
- **Risk factors for patellofemoral pain in the military, 2024 — systematic review/meta-analysis**. Greater frontal-plane knee-projection angle during single-leg squat was identified as a PFP risk factor in male military personnel with moderate evidence, but population/protocol transfer must be treated cautiously. PMID 39007801. https://pubmed.ncbi.nlm.nih.gov/39007801/
- **Y-Balance asymmetry and FPKPA prospective cohort, 2020**. In 135 male military recruits, Y-Balance asymmetry and larger single-leg-squat FPKPA were associated with later PFP. PMID 32504961. https://pubmed.ncbi.nlm.nih.gov/32504961/

These sources justify *candidate predictor domains*. They do not validate the current webcam metric as a clinical injury probability.

The engineering/reporting plan also follows the intent of **TRIPOD+AI** and **PROBAST+AI**: model development must be separated from performance evaluation, validation must be explicit, uncertainty must be reported, and subgroup/fairness limitations must not be hidden. The repository's implementation is not itself a formal TRIPOD+AI or PROBAST+AI assessment.

## Supported predictor domains

The research benchmark accepts pre-index measurements from the following domains when legally and scientifically available:

- previous injury history
- pain/soreness/readiness
- training and exposure load at multiple windows
- strength and dynamic-balance measurements
- quality-gated single-leg-squat camera biomechanics
- longitudinal changes in the same measurements

Raw 7-day and 28-day load variables are retained instead of hard-coding one workload-ratio interpretation into the model.

## Leakage and optimism controls

- All repeated rows from a participant stay in the same outer validation fold.
- **Model-family selection occurs only inside the outer training participants.**
- **Probability calibration occurs only inside the outer training participants.**
- **Decision-threshold selection occurs only inside the outer training participants.**
- The untouched outer fold is used only for performance evaluation.
- Every predictor must be obtainable **before** the prediction index time.
- Cohort builders must explicitly attest that predictor timing has been audited; a model without this audit cannot pass the research readiness gate.
- Outcome-derived, post-injury, diagnosis-after-event, or future-window features are prohibited.
- Pose-derived measurements must carry a versioned camera/measurement implementation identifier.
- Camera quality and pose confidence are retained as measurement-quality information, not silently discarded.

This nested design is deliberately more conservative than selecting a model, calibration map, or threshold from the same out-of-fold predictions used to report final performance.

## Validation sequence

1. Define a target injury and an explicit prediction horizon.
2. Build only pre-index features.
3. Create participant-grouped outer folds.
4. Within each outer training set, run a second participant-grouped model-selection procedure comparing regularized logistic regression, random forest, and Extra Trees.
5. Within that outer training set, fit Platt calibration from grouped out-of-fold predictions and choose the operating threshold from those same training-only predictions.
6. Fit the selected model on the entire outer training set and evaluate once on the untouched outer validation participants.
7. Concatenate only those untouched outer-fold predictions to compute the internal performance estimate.
8. Report AUROC, AUPRC relative to event prevalence, Brier score/skill, sensitivity, specificity, balanced accuracy, calibration intercept/slope, expected calibration error, and confusion matrix.
9. Compute 95% uncertainty intervals using **participant-cluster bootstrap resampling**, rather than treating repeated rows from one participant as independent.
10. Audit available subgroup metadata such as sex, age group, sport, and site. Small or single-class strata must be reported as insufficient rather than assigned unstable metrics.
11. Keep the output research-only if internal performance or uncertainty is weak.
12. Even after a strong internal result, require an independent external cohort.
13. Separately validate camera-derived features through the same browser/MediaPipe measurement domain used in production.
14. Only after clinical, statistical, governance, and regulatory review should an individual future-injury probability be considered for patient-facing use.

## Reproducibility requirements

Every generated research artifact records:

- SHA-256 hash of the input dataset
- random seed
- NumPy, pandas, and scikit-learn versions
- exact feature list and feature-domain list
- camera/measurement implementation version
- outer-fold reports and selected model family per fold
- model-selection frequency
- missingness by feature
- subgroup audit results
- participant-cluster confidence intervals

The final all-data model is exported only as a **research artifact**. Its fit on all available data is never treated as an independent validation result.

## Internal engineering gate

The repository contains conservative internal development guardrails for AUROC, AUPRC lift, sensitivity, specificity, Brier skill, and the lower bound of the AUROC uncertainty interval. These values are **software/research development guardrails, not clinical efficacy thresholds**. Passing them only makes a model a candidate for further validation.

A model cannot pass the internal readiness gate unless it also reports nested validation, predictor-timing audit, participant-cluster uncertainty, subgroup audit, and calibration. Even then, independent external-cohort validation and same-camera-domain validation remain mandatory.

## Current product rule

Until external and camera-domain validation are both completed, the production application may show measured biomechanics, capture quality, longitudinal changes, and evidence-linked research associations. It must not present the prospective research model as a validated patient-specific injury probability.

Even after those validation steps, the current software contract remains fail-closed: `canDisplayIndividualInjuryProbability` is always `false` until a separate clinical/governance product decision explicitly changes that contract.
