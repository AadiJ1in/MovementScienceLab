# Prospective injury-model research plan

## Purpose

Movement Science Lab should distinguish two different ML problems:

1. **Movement-quality classification** — whether a captured repetition resembles reference vs. deviation-labeled movement data.
2. **Future-injury risk estimation** — whether prospectively measured information before an index time predicts a newly observed injury during a defined future horizon.

The second problem requires prospective outcome labels. A model trained only on movement-quality labels must never be relabeled as an injury predictor.

## Evidence informing the feature architecture

The current research architecture is intentionally multimodal rather than `knee angle → injury probability`.

Recent reviews report that injury-prediction work commonly uses training/exposure load, previous injury, physiological or wellness/readiness measures, and biomechanical or neuromuscular factors. They also emphasize heterogeneous methods and limited external validation:

- **Bingöl et al., 2026 — ACL ML systematic review**. Ten studies; reported AUCs varied widely, with concerns around small samples, overfitting, confidence intervals, class imbalance, and external validation. PMID 42531926. https://pubmed.ncbi.nlm.nih.gov/42531926/
- **Injury Prediction and Risk Modelling in Team Sports Using AI and Sensor-Based Monitoring, 2026 — scoping review**. Common predictors included external workload, exposure, previous injury, and wellness/physiological markers; external validation was rare. PMID 42200910. https://pubmed.ncbi.nlm.nih.gov/42200910/
- **From data to prevention, 2026 — systematic review of AI sports-injury prediction**. Most included prediction studies had important risk-of-bias limitations and relied heavily on internal validation; the review calls for external validation and explainable AI. PMID 42274208. https://pubmed.ncbi.nlm.nih.gov/42274208/
- **Risk factors for patellofemoral pain in the military, 2024 — systematic review/meta-analysis**. Greater frontal-plane knee-projection angle during single-leg squat was identified as a PFP risk factor in male military personnel with moderate evidence, but population/protocol transfer must be treated cautiously. PMID 39007801. https://pubmed.ncbi.nlm.nih.gov/39007801/
- **Y-Balance asymmetry and FPKPA prospective cohort, 2020**. In 135 male military recruits, Y-Balance asymmetry and larger single-leg-squat FPKPA were associated with later PFP. PMID 32504961. https://pubmed.ncbi.nlm.nih.gov/32504961/

These sources justify *candidate predictor domains*. They do not validate the current webcam metric as a clinical injury probability.

## Supported predictor domains

The research benchmark accepts pre-index measurements from the following domains when legally and scientifically available:

- previous injury history
- pain/soreness/readiness
- training and exposure load at multiple windows
- strength and dynamic-balance measurements
- quality-gated single-leg-squat camera biomechanics
- longitudinal changes in the same measurements

Raw 7-day and 28-day load variables are retained instead of hard-coding one workload-ratio interpretation into the model.

## Leakage controls

- All repeated rows from a participant stay in the same validation fold.
- Every predictor must be obtainable **before** the prediction index time.
- Outcome-derived, post-injury, diagnosis-after-event, or future-window features are prohibited.
- Pose-derived measurements must be produced by a versioned measurement implementation.
- Camera quality and pose confidence are retained as measurement-quality information, not silently discarded.

## Validation sequence

1. Define a target injury and an explicit prediction horizon.
2. Build only pre-index features.
3. Benchmark regularized logistic regression, random forest, and Extra Trees using participant-grouped out-of-fold evaluation.
4. Calibrate using predictions generated from participants excluded from the corresponding training fold.
5. Report AUROC, AUPRC relative to event prevalence, Brier score/skill, sensitivity, specificity, balanced accuracy, and confusion matrix.
6. Keep the output research-only if internal performance is weak.
7. Even after a strong internal result, require an independent external cohort.
8. Separately validate camera-derived features through the same browser/MediaPipe measurement domain used in production.
9. Only after clinical, statistical, governance, and regulatory review should an individual future-injury probability be considered for patient-facing use.

## Internal engineering gate

The repository contains a conservative internal promotion gate (AUROC, AUPRC lift, sensitivity, specificity, and Brier skill). These values are **software/research development guardrails, not clinical efficacy thresholds**. Passing them only makes a model a candidate for further validation. It does not authorize diagnosis, treatment decisions, or an individual injury-risk percentage.

## Current product rule

Until external and camera-domain validation are both completed, the production application may show measured biomechanics, capture quality, longitudinal changes, and evidence-linked research associations. It must not present the prospective research model as a validated patient-specific injury probability.
