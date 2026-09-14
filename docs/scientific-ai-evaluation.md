# Scientific evaluation rules for the injury-risk AI

## Purpose

Movement Science Lab should not become "more AI" by adding model complexity without evidence. The research system should become more scientific by making each additional predictor or algorithm earn its place through prospective, leakage-resistant evaluation.

The current system remains **research only**. None of the analyses in this document authorize diagnosis, treatment decisions, or patient-facing injury probabilities.

## Methodological anchors

The evaluation strategy is aligned with the principles emphasized by modern prediction-model guidance and current sports-injury evidence:

- TRIPOD+AI (BMJ 2024) emphasizes transparent reporting of prediction-model development and evaluation, including discrimination, calibration, and clinical utility rather than a single accuracy number. https://www.bmj.com/content/385/bmj-2023-078378
- PROBAST+AI (BMJ 2025) separates model development from model evaluation and explicitly emphasizes participants/data sources, predictors, outcomes, analysis, leakage, calibration, applicability, and fairness. https://www.bmj.com/content/388/bmj-2024-082505
- A 2026 systematic review of AI for sports-injury prediction found that only one of 18 included empirical studies had low overall risk of bias and identified internal-only validation and inconsistent reporting as major limitations. PMID 42274208. https://pubmed.ncbi.nlm.nih.gov/42274208/
- A 2026 scoping review of AI and sensor-based injury-risk modelling found that training exposure, previous injury, and recovery/readiness indicators were common predictors, while external validation remained rare. PMID 42200910. https://pubmed.ncbi.nlm.nih.gov/42200910/
- A 2026 football injury-prediction review similarly identified training load, prior injury, biomechanical/neuromuscular, anthropometric, psychological, and biological predictors. PMID 42478081. https://pubmed.ncbi.nlm.nih.gov/42478081/

These sources support multimodal prospective modelling, but they do **not** validate Movement Science Lab's specific webcam model or establish a clinically useful threshold.

## Scientific hierarchy

### 1. Validate the measurement before the predictor

A camera feature cannot become a credible risk predictor merely because it correlates with an outcome in one dataset. The webcam measurement must first have its own repeatability, measurement-error, and reference-agreement characterization under the supported capture protocol.

### 2. Define the prediction problem before fitting

The target injury, population, index time, outcome horizon, predictor cutoff, inclusion criteria, and outcome adjudication process must be fixed before model evaluation. The cohort audit rejects post-index predictors, unresolved labels, duplicate prediction opportunities, and unapproved overlapping future windows.

### 3. Require adequate prospective information

The study protocol must declare justified minimum total, positive-outcome, and negative-outcome participant counts before training. The software does not invent a universal events-per-variable rule after looking at the dataset.

### 4. Compare against simpler baselines

A camera model is not scientifically useful just because it achieves an AUROC above 0.5. The camera features must be compared against an otherwise identical model containing the available non-camera predictors.

`ml/camera_incremental_value.py` therefore evaluates:

- `historyTrainingBaseline` when those variables are available;
- `cameraOnly` as a descriptive research model;
- `nonCameraReference` using all eligible non-camera predictors;
- `expandedMultimodal` using the same reference predictors plus camera-derived predictors.

The scientifically important comparison is **expanded multimodal vs non-camera reference**, not camera-only performance.

### 5. Keep the comparison paired

Reference and expanded models are evaluated on the same participants under the same participant-grouped outer-fold contract. Camera-derived longitudinal variables such as single-leg-squat change are treated as camera predictors rather than being allowed to hide inside a generic longitudinal domain.

The comparison reports three primary incremental metrics:

- `deltaAuROC = expanded AUROC - reference AUROC`;
- `deltaAuPRC = expanded AUPRC - reference AUPRC`;
- `brierImprovement = reference Brier - expanded Brier`.

Positive values favor the expanded camera model for all three quantities.

AUPRC is especially relevant for uncommon outcomes, while Brier score is a proper scoring rule that evaluates probabilistic prediction on the same population. Brier score is not treated as a stand-alone measure of calibration or clinical utility.

### 6. Quantify uncertainty at the participant level

Incremental metrics use paired participant-cluster bootstrap intervals so repeated prediction windows from the same person are not treated as independent observations.

The internal research classification is deliberately conservative:

- `internal-evidence-supported`: all primary point estimates are non-negative and at least two primary 95% intervals are entirely above zero;
- `internal-evidence-against`: all primary point estimates are non-positive and at least two primary 95% intervals are entirely below zero;
- `mixed`: supported improvement and supported harm appear in different primary metrics;
- `inconclusive`: anything else.

This classification is **not** a clinical significance threshold.

### 7. Do not equate incremental prediction with causality

Even if camera features improve prediction, that does not mean the movement pattern causes injury or that changing the movement will prevent injury. Predictive contribution, causal effect, and treatment benefit are different scientific questions.

### 8. Stress-test transportability

Internal participant-grouped evaluation is followed by:

- leave-one-site-out transport stress testing when multiple sites exist;
- chronological temporal transport testing using earlier fully resolved data to predict later data;
- independent external evaluation without outcome-driven refitting;
- same-camera/pose-domain measurement validation.

A site holdout within one development program and a temporal holdout within one cohort are not mislabeled as independent external validation.

### 9. Evaluate calibration separately from discrimination

AUROC or AUPRC alone cannot establish that estimated probabilities are numerically trustworthy. The model reports calibration intercept, calibration slope, expected calibration error, Brier score, and prevalence-based Brier skill in addition to discrimination.

### 10. Clinical utility comes later

Decision-curve or other clinical-utility analysis should only be interpreted after a plausible intended use and meaningful decision thresholds have been defined. An arbitrary threshold chosen only to optimize test-set accuracy is not evidence of clinical benefit.

## What the AI is allowed to learn now

The research pipeline can learn patterns from prospectively collected multimodal predictors including:

- previous injury history;
- training exposure/load;
- pain, soreness, sleep, and readiness measures;
- strength and balance measures;
- versioned camera biomechanics;
- longitudinal changes measured before the prediction index.

It can compare model families and quantify whether new predictor domains improve out-of-fold prediction.

## What the AI is not allowed to claim now

Until independent external evaluation, camera-domain measurement validation, governance review, and a separately reviewed intended-use decision are complete, it must not claim:

- a clinically validated injury probability;
- a diagnosis;
- that a measured movement pattern causes injury;
- that changing that movement will prevent injury;
- that a statistically significant internal improvement equals clinical usefulness.

The product contract remains fail-closed for individual injury probability.
