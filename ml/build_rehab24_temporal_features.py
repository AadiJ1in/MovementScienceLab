from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

HIPS = 0
LEFT_SHOULDER = 6
LEFT_ELBOW = 7
LEFT_HAND = 9
RIGHT_SHOULDER = 11
RIGHT_ELBOW = 12
RIGHT_HAND = 14
LEFT_HIP = 16
LEFT_KNEE = 17
LEFT_FOOT = 18
RIGHT_HIP = 21
RIGHT_KNEE = 22
RIGHT_FOOT = 23
FPS = 30.0

EXERCISE_NAMES = {
    1: "arm-abduction",
    2: "arm-vw",
    3: "table-push-up",
    4: "leg-abduction",
    5: "lunge",
    6: "squat",
}
PHASES = np.array([0.0, 0.20, 0.40, 0.50, 0.60, 0.80, 1.0])


def angle_at_vertex(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    ba = a - b
    bc = c - b
    numerator = np.sum(ba * bc, axis=1)
    denominator = np.linalg.norm(ba, axis=1) * np.linalg.norm(bc, axis=1)
    cosine = np.divide(numerator, denominator, out=np.zeros_like(numerator), where=denominator > 1e-9)
    return np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0)))


def angle_from_vertical(origin: np.ndarray, target: np.ndarray) -> np.ndarray:
    delta = target - origin
    return np.degrees(np.arctan2(delta[:, 0], -delta[:, 1]))


def resample(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    if len(values) < 2:
        return np.repeat(values[0] if len(values) else np.nan, len(PHASES))
    x = np.linspace(0.0, 1.0, len(values))
    finite = np.isfinite(values)
    if finite.sum() < 2:
        return np.full(len(PHASES), np.nan)
    return np.interp(PHASES, x[finite], values[finite])


def signal_features(name: str, values: np.ndarray) -> dict[str, float]:
    values = np.asarray(values, dtype=float)
    finite = values[np.isfinite(values)]
    if len(finite) < 2:
        return {f"{name}_phase_{int(p * 100):03d}": np.nan for p in PHASES}

    phase_values = resample(values)
    velocity = np.diff(finite) * FPS
    acceleration = np.diff(velocity) * FPS if len(velocity) > 1 else np.array([])
    abs_velocity = np.abs(velocity)
    peak_index = int(np.argmax(abs_velocity)) if len(abs_velocity) else 0
    time_to_peak = peak_index / max(1, len(abs_velocity) - 1)

    result = {
        f"{name}_phase_{int(p * 100):03d}": float(v)
        for p, v in zip(PHASES, phase_values, strict=True)
    }
    result.update(
        {
            f"{name}_velocity_peak": float(np.max(abs_velocity)) if len(abs_velocity) else 0.0,
            f"{name}_velocity_mean_abs": float(np.mean(abs_velocity)) if len(abs_velocity) else 0.0,
            f"{name}_time_to_peak_velocity": float(time_to_peak),
            f"{name}_acceleration_mean_abs": float(np.mean(np.abs(acceleration))) if len(acceleration) else 0.0,
        }
    )
    return result


def summarize(joints: np.ndarray) -> dict[str, float]:
    if joints.ndim != 3 or joints.shape[1] < 24 or joints.shape[2] != 2:
        raise ValueError(f"Expected (frames, >=24 joints, 2), got {joints.shape}")

    left_elbow = 180.0 - angle_at_vertex(joints[:, LEFT_SHOULDER], joints[:, LEFT_ELBOW], joints[:, LEFT_HAND])
    right_elbow = 180.0 - angle_at_vertex(joints[:, RIGHT_SHOULDER], joints[:, RIGHT_ELBOW], joints[:, RIGHT_HAND])
    left_knee = 180.0 - angle_at_vertex(joints[:, LEFT_HIP], joints[:, LEFT_KNEE], joints[:, LEFT_FOOT])
    right_knee = 180.0 - angle_at_vertex(joints[:, RIGHT_HIP], joints[:, RIGHT_KNEE], joints[:, RIGHT_FOOT])
    shoulder_mid = (joints[:, LEFT_SHOULDER] + joints[:, RIGHT_SHOULDER]) / 2.0
    hip_mid = (joints[:, LEFT_HIP] + joints[:, RIGHT_HIP]) / 2.0
    trunk = angle_from_vertical(hip_mid, shoulder_mid)
    left_shoulder = angle_at_vertex(joints[:, LEFT_ELBOW], joints[:, LEFT_SHOULDER], joints[:, LEFT_HIP])
    right_shoulder = angle_at_vertex(joints[:, RIGHT_ELBOW], joints[:, RIGHT_SHOULDER], joints[:, RIGHT_HIP])

    signals = {
        "left_elbow": left_elbow,
        "right_elbow": right_elbow,
        "left_knee": left_knee,
        "right_knee": right_knee,
        "left_shoulder": left_shoulder,
        "right_shoulder": right_shoulder,
        "trunk": trunk,
    }
    result: dict[str, float] = {}
    for name, values in signals.items():
        result.update(signal_features(name, values))

    for pair_name, left, right in (
        ("elbow", left_elbow, right_elbow),
        ("knee", left_knee, right_knee),
        ("shoulder", left_shoulder, right_shoulder),
    ):
        left_phase = resample(left)
        right_phase = resample(right)
        diff = np.abs(left_phase - right_phase)
        result[f"{pair_name}_trajectory_asymmetry_mean"] = float(np.nanmean(diff))
        result[f"{pair_name}_trajectory_asymmetry_peak"] = float(np.nanmax(diff))

    result["rep_duration_ms"] = float((len(joints) / FPS) * 1000.0)
    return result


def build(dataset_root: Path, output_csv: Path) -> None:
    annotations = pd.read_csv(dataset_root / "annotations.csv")
    required = {"file_name", "exercise_id", "person_id", "correctness"}
    missing = required - set(annotations.columns)
    if missing:
        raise ValueError(f"annotations.csv missing columns: {sorted(missing)}")

    rows: list[dict[str, object]] = []
    for _, annotation in annotations.iterrows():
        exercise_id = int(annotation["exercise_id"])
        if exercise_id not in EXERCISE_NAMES:
            continue
        source_correctness = int(annotation["correctness"])
        if source_correctness not in (0, 1):
            raise ValueError(f"Unexpected correctness={source_correctness}")
        file_name = str(annotation["file_name"])
        source_path = dataset_root / f"Ex{exercise_id}-segmented" / file_name
        joints = np.load(source_path, allow_pickle=False)
        row: dict[str, object] = summarize(joints)
        row.update(
            {
                "exercise_id": exercise_id,
                "exercise_name": EXERCISE_NAMES[exercise_id],
                "subject_id": str(annotation["person_id"]),
                "label": 0 if source_correctness == 1 else 1,
                "source_file": file_name,
                "source_correctness": source_correctness,
            }
        )
        rows.append(row)

    output = pd.DataFrame(rows)
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(output_csv, index=False)
    print(f"Wrote {len(output)} phase-normalized repetitions with {len(output.columns)} columns")
    print(output.groupby("exercise_name").agg(repetitions=("label", "size"), subjects=("subject_id", "nunique"), deviations=("label", "sum")).to_string())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    build(args.dataset_root, args.output_csv)
