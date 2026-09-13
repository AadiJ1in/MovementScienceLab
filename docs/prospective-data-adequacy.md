# Prospective injury-model data adequacy gate

## Purpose

Nested participant-grouped validation can reduce leakage and optimism, but it cannot rescue a development cohort that contains too little outcome information. A small number of future injury events can still produce unstable discrimination, calibration, threshold, and subgroup estimates.

Movement Science Lab therefore requires an explicit **a-priori sample-size rationale** before the prospective injury-model training entry point will run.

This is separate from the cohort timing/leakage audit. Both must pass.

## What the gate requires

The study protocol must supply:

- minimum total participants,
- minimum participants with the prospective outcome,
- minimum participants without the prospective outcome,
- a text justification identifying the protocol, calculation, simulation, or other a-priori rationale used to choose those minimums.

The code deliberately does **not** hard-code a universal events-per-variable rule. Prediction-model sample-size needs depend on the intended outcome prevalence, candidate parameterization, anticipated model performance, shrinkage/overfitting target, validation design, and intended precision. Those decisions should be made before model fitting rather than reverse-engineered from the observed results.

## Participant-level counting

For this gate, repeated prediction windows do not create additional participants. A participant is counted as outcome-positive if any eligible prospective window contains the outcome label. Repeated-window participants are reported explicitly because those rows are correlated and must remain participant-grouped during validation.

## Training behavior

`ml/train_prospective_injury_model.py` now requires:

```text
--minimum-total-participants
--minimum-positive-participants
--minimum-negative-participants
--sample-size-justification
```

The script writes a `*.data-adequacy.json` report next to the model report by default. Model development stops before fitting if any pre-specified minimum is missed or if the justification is blank.

The resulting research artifact records both the pre-specified minimums and the observed participant/outcome counts so later reviewers can see whether the study reached the target that was defined before training.

## Interpretation

Passing this audit means only that the cohort met its own pre-specified minimum information target. It does **not** establish:

- clinical validity,
- adequate precision for every subgroup,
- transportability to another site or population,
- webcam measurement validity,
- calibration transport,
- clinical utility,
- or eligibility to display an individual future-injury probability.

Those remain separate gates in the prospective model-readiness workflow.
