from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd


def generate_fixture(
    output_csv: Path,
    *,
    participants: int = 90,
    windows_per_participant: int = 4,
    seed: int = 20260917,
) -> pd.DataFrame:
    if participants < 30:
        raise ValueError("Synthetic integration fixture requires at least 30 participants.")
    if windows_per_participant < 2:
        raise ValueError("Synthetic integration fixture requires at least two windows per participant.")

    rng = np.random.default_rng(seed)
    rows: list[dict[str, object]] = []
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)

    for participant_index in range(participants):
        participant_id = f"synthetic-{participant_index:03d}"
        history_propensity = float(rng.normal(0, 0.8))
        baseline_fitness = float(rng.normal(0, 1))
        previous_injury_count = int(max(0, round(rng.poisson(1.0 + max(history_propensity, 0) * 0.5))))
        days_since_last_injury = int(rng.integers(30, 720))
        sex = "F" if participant_index % 2 == 0 else "M"
        age_group = ["18-24", "25-34", "35-44"][participant_index % 3]

        for window_index in range(windows_per_participant):
            index_time = base + timedelta(days=participant_index % 13 + window_index * 35)
            outcome_window_end = index_time + timedelta(days=28)

            pain = float(np.clip(rng.normal(2.2 + history_propensity * 0.5, 1.7), 0, 10))
            soreness = float(np.clip(rng.normal(3.0 + history_propensity * 0.35, 1.8), 0, 10))
            sleep = float(np.clip(rng.normal(7.2 - history_propensity * 0.25, 1.1), 1, 10))
            readiness = float(np.clip(rng.normal(7.0 - history_propensity * 0.35, 1.2), 1, 10))

            training_28d = float(np.clip(rng.normal(1050 + baseline_fitness * 120, 260), 250, 2400))
            short_term_multiplier = float(np.clip(rng.normal(1.0 + 0.12 * window_index, 0.16), 0.55, 1.65))
            training_7d = float(training_28d / 4 * short_term_multiplier)
            rpe_28d = float(np.clip(training_28d * rng.normal(4.8, 0.5), 900, 14000))
            rpe_7d = float(np.clip(training_7d * rng.normal(4.9, 0.6), 200, 4500))

            balance_asymmetry = float(np.clip(rng.normal(3.5 + history_propensity * 0.3, 2.0), 0, 15))
            knee_extensor_strength = float(np.clip(rng.normal(2.3 + baseline_fitness * 0.18, 0.35), 0.8, 4.2))
            hip_abductor_strength = float(np.clip(rng.normal(1.7 + baseline_fitness * 0.12, 0.25), 0.6, 3.0))

            knee_flexion_asymmetry = float(np.clip(rng.normal(4.0 + history_propensity * 0.8, 2.4), 0, 18))
            frontal_deviation = float(np.clip(rng.normal(7.0 + history_propensity * 1.2, 3.2), 0, 24))
            trunk_lean = float(np.clip(rng.normal(11.0 + history_propensity * 1.0, 4.0), 1, 32))
            pelvic_obliquity = float(np.clip(rng.normal(3.0 + history_propensity * 0.5, 1.8), 0, 14))
            rep_variability = float(np.clip(rng.normal(3.0 + history_propensity * 0.35, 1.4), 0.2, 12))
            duration_cv = float(np.clip(rng.normal(11.0 + history_propensity * 1.2, 5.0), 1, 35))
            pose_confidence = float(np.clip(rng.normal(0.9, 0.035), 0.72, 0.98))

            load_ratio = training_7d / max(training_28d / 4, 1)
            logit = (
                -2.15
                + 0.34 * previous_injury_count
                - 0.0012 * days_since_last_injury
                + 0.16 * pain
                + 0.11 * soreness
                - 0.07 * sleep
                - 0.08 * readiness
                + 0.42 * max(load_ratio - 1.0, 0)
                + 0.055 * balance_asymmetry
                - 0.16 * knee_extensor_strength
                + 0.045 * knee_flexion_asymmetry
                + 0.048 * frontal_deviation
                + 0.022 * trunk_lean
                + 0.025 * rep_variability
                + 0.018 * duration_cv
                + 0.22 * history_propensity
            )
            probability = 1.0 / (1.0 + np.exp(-logit))
            outcome = int(rng.random() < probability)
            injury_time = index_time + timedelta(days=int(rng.integers(3, 24))) if outcome else None

            rows.append(
                {
                    "participant_id": participant_id,
                    "injury_within_horizon": outcome,
                    "index_time": index_time.isoformat(),
                    "feature_cutoff_time": index_time.isoformat(),
                    "outcome_window_end": outcome_window_end.isoformat(),
                    "injury_event_time": injury_time.isoformat() if injury_time else "",
                    "outcome_event_id": f"{participant_id}-w{window_index}" if outcome else "",
                    "sex": sex,
                    "age_group": age_group,
                    "sport": "synthetic-running",
                    "site_id": "synthetic-site-a" if participant_index % 2 == 0 else "synthetic-site-b",
                    "previous_injury_count": previous_injury_count,
                    "days_since_last_injury": days_since_last_injury,
                    "pain_score": pain,
                    "soreness_score": soreness,
                    "sleep_quality_score": sleep,
                    "readiness_score": readiness,
                    "training_minutes_7d": training_7d,
                    "training_minutes_28d": training_28d,
                    "session_rpe_load_7d": rpe_7d,
                    "session_rpe_load_28d": rpe_28d,
                    "y_balance_asymmetry_cm": balance_asymmetry,
                    "knee_extensor_strength_norm": knee_extensor_strength,
                    "hip_abductor_strength_norm": hip_abductor_strength,
                    "camera_knee_flexion_asymmetry_deg": knee_flexion_asymmetry,
                    "camera_peak_knee_frontal_deviation_deg": frontal_deviation,
                    "camera_peak_trunk_lean_deg": trunk_lean,
                    "camera_peak_pelvic_obliquity_deg": pelvic_obliquity,
                    "camera_rep_excursion_variability_deg": rep_variability,
                    "camera_rep_duration_cv_pct": duration_cv,
                    "mean_pose_confidence": pose_confidence,
                }
            )

    frame = pd.DataFrame(rows)
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_csv, index=False)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a deterministic synthetic prospective cohort for end-to-end injury-AI integration testing only."
    )
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("--participants", type=int, default=90)
    parser.add_argument("--windows-per-participant", type=int, default=4)
    parser.add_argument("--seed", type=int, default=20260917)
    args = parser.parse_args()
    frame = generate_fixture(
        args.output_csv,
        participants=args.participants,
        windows_per_participant=args.windows_per_participant,
        seed=args.seed,
    )
    positive_participants = int(
        frame.groupby("participant_id")["injury_within_horizon"].max().sum()
    )
    print(
        {
            "rows": len(frame),
            "participants": frame["participant_id"].nunique(),
            "positiveParticipants": positive_participants,
            "positiveRows": int(frame["injury_within_horizon"].sum()),
        }
    )


if __name__ == "__main__":
    main()
