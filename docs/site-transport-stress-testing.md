# Leave-one-site-out transport stress testing

A model can look acceptable under participant-grouped cross-validation and still fail when moved to a different clinic, team, institution, camera setup, or operating workflow. Movement Science Lab therefore includes a leave-one-site-out stress test when `site_id` is available.

## What this test does

For each eligible site:

1. remove every row and participant from that site,
2. use only the remaining sites for model-family selection,
3. fit calibration only from the remaining sites,
4. choose the operating threshold only from the remaining sites,
5. fit the selected model on the remaining sites,
6. evaluate once on the held-out site,
7. report site-specific discrimination, calibration/probability quality, sensitivity/specificity, participant-cluster uncertainty, and available subgroup results.

A participant appearing in more than one `site_id` is a hard failure because it would leak that participant across the site boundary.

## Reportability rules

The current engineering implementation requires:

- at least three sites overall,
- at least two development sites remaining after each holdout,
- at least ten participants at a held-out site,
- both outcome classes at the held-out site,
- at least two participants with and two participants without the outcome at a held-out site.

Sites that do not meet these requirements are retained in the report as `not-reportable`; they are not silently removed from the denominator.

These are internal engineering minimums for generating a stress-test report, not clinical sample-size recommendations.

## Interpretation

This is **not external validation** when all sites originate from the same development cohort or data-generating program. The report therefore hard-codes:

- `validationClaim: internal-site-transport-stress-only`
- `externalValidation: false`
- `eligibleForUserFacingInjuryProbability: false`

A good result can justify further validation work. It cannot substitute for a distinct external cohort evaluated with the frozen-model pathway in `ml/evaluate_external_injury_model.py`.

## Why minimum-across-site performance matters

The aggregate summary reports minimum, median, and maximum performance across reportable sites. The minimum is intentionally visible because a high pooled or median score can hide one setting where the model transports poorly.

No automatic clinical acceptability threshold is assigned to the site stress test. Site-level failures should be investigated for cohort mix, measurement protocol, prevalence, camera/device differences, missingness, and workflow differences before any attempt to retrain or recalibrate.
