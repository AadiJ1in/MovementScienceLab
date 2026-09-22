# ACL-only prediction research program

## Primary target

Movement Science Lab now treats the prediction problem as:

> Future medically confirmed **noncontact or indirect-contact ACL rupture** after a prespecified prediction index.

Direct-contact ACL ruptures are excluded from the primary target because the model is intended to study intrinsic, exposure, and movement-related susceptibility rather than major external trauma.

## Why this is not a webcam-only problem

A clinically credible ACL model cannot be built from 2D pose alone. The research feature contract includes:

- prior ACL rupture/reconstruction history;
- standardized landing/hop video biomechanics;
- hip adductor/abductor and eccentric knee-flexor strength;
- countermovement-jump and landing kinetics;
- sport exposure and fatigue/load;
- age/sex/sport/competition context;
- longitudinal changes;
- optional clinical/anatomic measurements when legitimately available.

Pose confidence, camera FPS, lighting, and image sharpness are measurement-quality variables rather than biological predictors.

## Mathematical target

The intended prospective model is an exposure-adjusted discrete-time hazard model:

`P(ACL tear in horizon) = 1 - exp(-E * h0 * exp(beta0 + sum(beta_j*z_j)))`

where:

- `E` is sport exposure during the risk window;
- `h0` is the baseline hazard scale;
- `z_j` are pre-index ACL-specific predictors;
- `beta_j` are coefficients learned from prospectively observed ACL outcomes.

A fixed-horizon nested machine-learning benchmark compares regularized logistic regression, random forest, and Extra Trees as engineering candidates. Model family, calibration, and threshold selection are performed within training data, with participants kept together across folds.

## Literature-seeded transparent reference

Collings et al. (Med Sci Sports Exerc. 2022;54(8):1242-1251; doi:10.1249/MSS.0000000000002908) prospectively studied elite female footballers and reported associations involving prior ACL injury, hip adductor:abductor ratio, countermovement-jump peak take-off force, dynamic knee valgus, and ipsilateral trunk flexion. The application converts those odds ratios to a transparent relative log-odds reference signal.

This reference is **not** an absolute probability model. It was derived in a specific population and requires refitting and calibration in the intended target population.

A separate large prospective ML study, Jauhiainen et al. (Am J Sports Med. 2022;50(11):2917-2926; doi:10.1177/03635465221112095), analyzed extensive screening data from 791 female elite handball/soccer players with 60 ACL injuries. Its best mean test AUC-ROC was only 0.63, despite 3D biomechanics and multiple ML algorithms. This is an important guardrail: adding more algorithms does not solve ACL prediction when the necessary time-varying information is absent.

## Video data strategy

Online ACL injury videos are useful for **mechanism understanding** and defining which movement phases to measure. They are not a valid prospective future-injury training set because they contain injury cases without a matched, prospectively followed denominator.

The Notre Dame Jump Analysis dataset is a stronger candidate for video-to-biomechanics/force-surrogate development because it includes multi-view jump video and force-plate measurements, but its institutional licensing must be completed before ingest/training. It still does not by itself establish future ACL-tear probability.

Published soccer ACL video studies are used to inform mechanism-focused feature engineering. Broadcaster/Wyscout/Panini footage is not ingested without training/redistribution rights.

The older public OpenPose ACL-risk repository is retained only as an algorithmic comparison. Its LESS/AHP-style weighted score is not treated as a prospective ACL probability model.

## Required evidence before clinical probability display

1. Enough prospectively observed ACL events to justify the chosen model complexity.
2. Medical confirmation and exact event timing.
3. Mechanism adjudication separating noncontact/indirect from direct-contact injury.
4. Participant-grouped nested internal validation.
5. Probability calibration and participant-level uncertainty intervals.
6. Camera measurement agreement/robustness validation for the exact capture protocol.
7. Temporal and site transport testing.
8. Independent external cohort validation.
9. Subgroup robustness analysis where sample size permits.
10. Clinical governance and evidence that the output changes decisions safely/usefully.

Until those conditions are met, the application may display research signals and model-development evidence, but not a clinically validated ACL-tear probability.
