# ACL prediction program v2

Movement Science Lab now treats ACL prediction as a single-injury research program rather than a generic whole-body injury score.

## Prediction questions

There are two separate models:

1. **First-time ACL model** — participant has no ACL rupture/reconstruction before the prediction index.
2. **Secondary ACL model** — participant has a previous ACL rupture/reconstruction before the prediction index.

They must not be collapsed into one equation just because prior ACL history is a strong risk factor. Post-reconstruction biomechanics and exposure represent a different prediction problem, and prospective secondary-ACL evidence does not show that the same knee-specific cutting variables necessarily retain predictive value.

## Mathematical target

The preferred exposure-adjusted target is

`P(ACL tear in horizon) = 1 - exp[-E * h0 * exp(eta)]`

with

`eta = beta0 + sum(beta_j * z_j) + selected pre-specified interaction terms`

where:

- `E` = observed sport exposure during the risk horizon;
- `h0` = baseline ACL hazard per exposure unit learned in the development cohort;
- `z_j` = standardized pre-index predictor;
- `beta_j` = coefficient learned from prospective ACL outcomes.

Candidate interactions can include `valgus × low-flexion`, `valgus × trunk`, and `fatigue × valgus`, but these are hypotheses rather than biomechanical laws. Their inclusion must be pre-specified and evaluated inside participant-grouped training folds.

The existing Collings-derived equation in `lib/acl/acl-risk-equation.ts` remains a **relative literature-seeded signal**, not a calibrated probability. Reported odds ratios are useful priors/reference values, but they do not provide a portable model intercept or baseline hazard for arbitrary populations.

## Why the old high-KAM formula is not an ACL formula

The Myer clinic algorithm is useful for estimating **high knee-abduction-moment status** from knee valgus motion, knee flexion ROM, body mass, tibial length, and quadriceps:hamstring ratio. It should not be relabeled as an ACL-tear probability equation. A later prospective analysis specifically evaluated pKAM against ACL injury and did not establish it as a direct injury predictor.

Movement Science Lab therefore treats KAM-related measurements as candidate mechanistic features only.

## What the webcam should measure

A standardized front/side landing or cutting protocol can supply candidate 2D features:

- dynamic frontal knee-deviation proxy;
- sagittal knee flexion at initial contact / early stance when event detection is validated;
- knee flexion excursion;
- trunk flexion/lean proxy;
- pelvic-line motion;
- interlimb asymmetry;
- rep-to-rep variability.

A normal monocular webcam does **not** directly measure:

- knee abduction moment;
- ground-reaction force;
- ACL strain;
- internal knee rotation moment;
- true laboratory 3D kinematics;
- tibial slope or notch morphology.

Those quantities require direct instruments or separately validated surrogate models.

## Additional information required for a serious ACL model

The machine-readable contract is `data/acl-required-information.json`. It includes:

- exact prospective ACL outcome timing and medical confirmation;
- first-time vs secondary cohort scope;
- sex, age, sport, competition level, limb dominance, and site;
- standardized video biomechanics;
- hip and knee strength;
- jump/landing kinetics;
- sport exposure and fatigue;
- optional clinical/intrinsic variables such as family history, joint laxity, genu recurvatum, anterior tibial displacement, tibial slope, and notch morphology;
- optional 3D/EMG variables that should not be silently replaced by webcam proxies.

## Online video policy

Online ACL injury video is useful for learning **mechanism**, not future risk. Injury clips are selected after the event and lack the prospective noninjured denominator needed to answer “who will tear an ACL later?” They may be used only when rights allow, for tasks such as:

- identifying foot-strike / early-stance injury phases;
- mechanism classification;
- pose robustness;
- feature engineering and capture-protocol design.

The Notre Dame jump dataset is particularly relevant for video-to-biomechanics / force-surrogate research because it contains multi-angle evaluative jumps with force-plate data, but access is controlled by an institutional license. The repository does not bypass that agreement.

Open motion-capture / force-plate datasets after ACL reconstruction can also improve secondary-ACL measurement research, but they are not prospective future-injury labels.

## Performance reality check

A 2022 prospective ML study using an extensive 3D motion-analysis and physical screening battery in 791 elite female handball/soccer players with 60 ACL injuries reported mean AUROC 0.63 for its best classifier. This is a key guardrail: more model complexity, more webcam features, or a neural network do not automatically solve ACL prediction.

The research target is therefore not “make the number look accurate.” The target is to obtain genuinely prospective signal, show calibration and uncertainty, and prove that performance transports to an independent population.

## Validation sequence

Before a clinical probability can be shown:

1. freeze first-time and secondary protocols separately;
2. validate webcam measurements against an appropriate reference system;
3. collect prospective ACL outcomes with exact event timing and mechanism adjudication;
4. determine sample size from prevalence, predictor dimensionality, expected signal, calibration precision, and repeated-measure structure;
5. run participant-grouped nested development;
6. report discrimination, calibration, Brier score, uncertainty, and subgroup robustness;
7. test temporal/site transport;
8. test an independent external cohort;
9. perform clinical-governance and utility review.

Until that sequence is complete, the site should describe outputs as research signals or research estimates, not clinically validated individual ACL-tear probabilities.
