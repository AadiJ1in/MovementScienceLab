from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class AclLiteraturePrior:
    feature: str
    log_odds_per_unit: float
    unit: str
    source: str
    note: str


SOURCE = "Collings et al. Med Sci Sports Exerc. 2022;54(8):1242-1251. doi:10.1249/MSS.0000000000002908"

# These are conversions of reported prospective odds ratios into log-odds
# reference slopes. They are NOT Movement Science Lab fitted coefficients and
# must never be presented as a clinically calibrated ACL probability model.
ACL_LITERATURE_PRIORS: dict[str, AclLiteraturePrior] = {
    "prior_acl_rupture": AclLiteraturePrior(
        feature="prior_acl_rupture",
        log_odds_per_unit=math.log(9.68),
        unit="binary history indicator",
        source=SOURCE,
        note="Reported odds ratio 9.68 for prior ACL injury in the study population.",
    ),
    "dynamic_knee_valgus_deg": AclLiteraturePrior(
        feature="dynamic_knee_valgus_deg",
        log_odds_per_unit=math.log(1.96) / 7.2,
        unit="degree",
        source=SOURCE,
        note="Reported odds ratio approximately 1.96 per 7.2 degree increase.",
    ),
    "ipsilateral_trunk_flexion_deg": AclLiteraturePrior(
        feature="ipsilateral_trunk_flexion_deg",
        log_odds_per_unit=math.log(1.60) / 2.4,
        unit="degree",
        source=SOURCE,
        note="Reported odds ratio 1.60 per 2.4 degree increase.",
    ),
    "cmj_peak_takeoff_force_bw": AclLiteraturePrior(
        feature="cmj_peak_takeoff_force_bw",
        log_odds_per_unit=math.log(1.77) / 0.13,
        unit="body weight",
        source=SOURCE,
        note="Reported odds ratio approximately 1.77 per 0.13 BW increase.",
    ),
    "hip_adductor_abductor_ratio": AclLiteraturePrior(
        feature="hip_adductor_abductor_ratio",
        log_odds_per_unit=-math.log(1.98) / 0.14,
        unit="ratio unit",
        source=SOURCE,
        note="Lower ratio was associated with higher odds; sign is reversed so increasing ratio lowers the reference log-odds signal.",
    ),
}


def literature_linear_predictor(values: dict[str, float | int]) -> float:
    """Return a relative research signal, not an absolute ACL probability."""
    return float(
        sum(
            ACL_LITERATURE_PRIORS[feature].log_odds_per_unit * float(values[feature])
            for feature in ACL_LITERATURE_PRIORS
            if feature in values
        )
    )


def target_exposure_adjusted_hazard_probability(
    *, linear_predictor: float, exposure_hours: float, baseline_hazard_per_hour: float
) -> float:
    """Mathematical target form for a future prospectively calibrated model.

    P(event in horizon) = 1 - exp(-E * h0 * exp(eta))

    h0 and beta coefficients must be learned from a prospective target cohort.
    Supplying them from literature alone does not create a validated probability.
    """
    if exposure_hours < 0 or baseline_hazard_per_hour < 0:
        raise ValueError("Exposure and baseline hazard must be non-negative.")
    cumulative_hazard = exposure_hours * baseline_hazard_per_hour * math.exp(
        max(-30.0, min(30.0, float(linear_predictor)))
    )
    return 1.0 - math.exp(-cumulative_hazard)
