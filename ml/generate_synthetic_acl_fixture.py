from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from acl_literature_priors import literature_linear_predictor


def generate_acl_fixture(
    output_csv: Path,
    *,
    participants: int = 240,
    seed: int = 20260922,
) -> pd.DataFrame:
    """Generate synthetic data only for end-to-end engineering tests.

    The generator intentionally embeds a learnable ACL signal so CI can prove
    the training pipeline is wired correctly. It is not evidence of real-world
    model performance and must never be shipped as a clinical model.
    """
    if participants < 60:
        raise ValueError("ACL integration fixture requires at least 60 participants.")

    rng = np.random.default_rng(seed)
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    rows: list[dict[str, object]] = []

    for index in range(participants):
        participant_id = f"acl-synth-{index:04d}"
        prior_acl = int(rng.random() < 0.10)
        dkv = float(np.clip(rng.normal(5.0 + prior_acl * 2.0, 5.0), -8, 24))
        trunk = float(np.clip(rng.normal(8.0 + prior_acl * 1.0, 3.2), 0, 22))
        cmj_force = float(np.clip(rng.normal(1.16, 0.15), 0.7, 1.7))
        hip_ratio = float(np.clip(rng.normal(1.02 - prior_acl * 0.04, 0.12), 0.55, 1.4))
        eccentric_knee_flexor = float(np.clip(rng.normal(2.1, 0.35), 0.9, 3.4))
        knee_ic = float(np.clip(rng.normal(25, 8), 5, 60))
        landing_excursion = float(np.clip(rng.normal(45, 10), 15, 85))
        hip_adduction = float(np.clip(rng.normal(8 + 0.25 * max(dkv, 0), 4), 0, 30))
        landing_asymmetry = float(np.clip(rng.normal(5 + prior_acl * 2, 3), 0, 20))
        variability = float(np.clip(rng.normal(3.5, 1.7), 0.2, 12))
        exposure_28d = float(np.clip(rng.normal(32, 9), 6, 65))
        exposure_7d = float(np.clip(exposure_28d / 4 * rng.normal(1, 0.18), 1, 22))
        rpe_28d = float(np.clip(exposure_28d * rng.normal(310, 45), 1000, 18000))
        rpe_7d = float(np.clip(exposure_7d * rng.normal(320, 50), 200, 6000))
        cuts = float(np.clip(rng.normal(80 + exposure_7d * 5, 35), 5, 350))
        fatigue = float(np.clip(rng.normal(4.0 + 0.003 * rpe_7d, 1.5), 0, 10))

        literature_eta = literature_linear_predictor(
            {
                "prior_acl_rupture": prior_acl,
                "dynamic_knee_valgus_deg": dkv,
                "ipsilateral_trunk_flexion_deg": trunk,
                "cmj_peak_takeoff_force_bw": cmj_force,
                "hip_adductor_abductor_ratio": hip_ratio,
            }
        )
        # Integration-only synthetic risk process. The intercept/noise are
        # deliberately arbitrary and must not be interpreted clinically.
        eta = (
            -3.7
            + 0.28 * literature_eta
            + 0.018 * (32 - knee_ic)
            + 0.025 * landing_asymmetry
            + 0.035 * fatigue
            + 0.005 * cuts
            + float(rng.normal(0, 0.35))
        )
        probability = 1 / (1 + np.exp(-eta))
        outcome = int(rng.random() < probability)

        index_time = base + timedelta(days=index % 120)
        window_end = index_time + timedelta(days=28)
        event_time = (
            index_time + timedelta(days=int(rng.integers(2, 27))) if outcome else None
        )
        rows.append(
            {
                "participant_id": participant_id,
                "acl_tear_within_horizon": outcome,
                "index_time": index_time.isoformat(),
                "feature_cutoff_time": index_time.isoformat(),
                "outcome_window_end": window_end.isoformat(),
                "acl_event_time": event_time.isoformat() if event_time else "",
                "injury_mechanism": "noncontact" if outcome else "none",
                "medical_confirmation": "mri" if outcome else "none",
                "sex": "F" if index % 2 == 0 else "M",
                "age_group": ["16-18", "19-24", "25-30"][index % 3],
                "sport": ["soccer", "basketball", "handball"][index % 3],
                "site_id": "synthetic-a" if index % 2 == 0 else "synthetic-b",
                "prior_acl_rupture": prior_acl,
                "prior_acl_reconstruction": prior_acl,
                "days_since_last_acl_event": int(rng.integers(120, 1800)) if prior_acl else 3650,
                "hip_adductor_strength_norm": float(np.clip(rng.normal(1.7, 0.25), 0.7, 2.8)),
                "hip_abductor_strength_norm": float(np.clip(rng.normal(1.65, 0.23), 0.7, 2.8)),
                "hip_adductor_abductor_ratio": hip_ratio,
                "eccentric_knee_flexor_strength_norm": eccentric_knee_flexor,
                "cmj_peak_takeoff_force_bw": cmj_force,
                "peak_landing_force_bw": float(np.clip(rng.normal(2.3, 0.45), 1.0, 4.0)),
                "force_asymmetry_pct": float(np.clip(rng.normal(7 + prior_acl * 3, 4), 0, 30)),
                "dynamic_knee_valgus_deg": dkv,
                "ipsilateral_trunk_flexion_deg": trunk,
                "knee_flexion_at_initial_contact_deg": knee_ic,
                "landing_knee_flexion_excursion_deg": landing_excursion,
                "hip_adduction_proxy_deg": hip_adduction,
                "interlimb_landing_asymmetry_deg": landing_asymmetry,
                "rep_to_rep_variability": variability,
                "sport_exposure_hours_7d": exposure_7d,
                "sport_exposure_hours_28d": exposure_28d,
                "session_rpe_load_7d": rpe_7d,
                "session_rpe_load_28d": rpe_28d,
                "deceleration_or_cut_exposures_7d": cuts,
                "acute_fatigue_score": fatigue,
                "mean_pose_confidence": float(np.clip(rng.normal(0.9, 0.04), 0.7, 0.99)),
            }
        )

    frame = pd.DataFrame(rows)
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_csv, index=False)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic ACL integration data only")
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("--participants", type=int, default=240)
    parser.add_argument("--seed", type=int, default=20260922)
    args = parser.parse_args()
    frame = generate_acl_fixture(
        args.output_csv,
        participants=args.participants,
        seed=args.seed,
    )
    print(
        {
            "rows": int(len(frame)),
            "participants": int(frame["participant_id"].nunique()),
            "aclEvents": int(frame["acl_tear_within_horizon"].sum()),
            "syntheticOnly": True,
        }
    )


if __name__ == "__main__":
    main()
