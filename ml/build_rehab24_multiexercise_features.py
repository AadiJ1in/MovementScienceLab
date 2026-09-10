from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

# REHAB24-6 26-joint skeleton indices.
HIPS = 0
SPINE = 1
SPINE1 = 2
NECK = 3
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


def finite_summary(values: np.ndarray) -> tuple[float, float, float, float]:
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values)]
    if not len(values):
        return (np.nan, np.nan, np.nan, np.nan)
    return (
        float(np.min(values)),
        float(np.max(values)),
        float(np.ptp(values)),
        float(np.mean(values)),
    )


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

    le_min, le_max, le_range, le_mean = finite_summary(left_elbow)
    re_min, re_max, re_range, re_mean = finite_summary(right_elbow)
    lk_min, lk_max, lk_range, lk_mean = finite_summary(left_knee)
    rk_min, rk_max, rk_range, rk_mean = finite_summary(right_knee)
    ls_min, ls_max, ls_range, ls_mean = finite_summary(left_shoulder)
    rs_min, rs_max, rs_range, rs_mean = finite_summary(right_shoulder)
    tr_min, tr_max, tr_range, tr_mean = finite_summary(trunk)

    hand_vertical_range_left = float(np.ptp(joints[:, LEFT_HAND, 1]))
    hand_vertical_range_right = float(np.ptp(joints[:, RIGHT_HAND, 1]))
    foot_vertical_range_left = float(np.ptp(joints[:, LEFT_FOOT, 1]))
    foot_vertical_range_right = float(np.ptp(joints[:, RIGHT_FOOT, 1]))

    return {
        "left_elbow_flexion_min": le_min,
        "left_elbow_flexion_max": le_max,
        "left_elbow_flexion_range": le_range,
        "left_elbow_flexion_mean": le_mean,
        "right_elbow_flexion_min": re_min,
        "right_elbow_flexion_max": re_max,
        "right_elbow_flexion_range": re_range,
        "right_elbow_flexion_mean": re_mean,
        "left_knee_flexion_min": lk_min,
        "left_knee_flexion_max": lk_max,
        "left_knee_flexion_range": lk_range,
        "left_knee_flexion_mean": lk_mean,
        "right_knee_flexion_min": rk_min,
        "right_knee_flexion_max": rk_max,
        "right_knee_flexion_range": rk_range,
        "right_knee_flexion_mean": rk_mean,
        "left_shoulder_angle_min": ls_min,
        "left_shoulder_angle_max": ls_max,
        "left_shoulder_angle_range": ls_range,
        "left_shoulder_angle_mean": ls_mean,
        "right_shoulder_angle_min": rs_min,
        "right_shoulder_angle_max": rs_max,
        "right_shoulder_angle_range": rs_range,
        "right_shoulder_angle_mean": rs_mean,
        "trunk_lean_min": tr_min,
        "trunk_lean_max": tr_max,
        "trunk_lean_range": tr_range,
        "trunk_lean_mean": tr_mean,
        "elbow_range_asymmetry": abs(le_range - re_range),
        "knee_range_asymmetry": abs(lk_range - rk_range),
        "shoulder_range_asymmetry": abs(ls_range - rs_range),
        "hand_vertical_range_left": hand_vertical_range_left,
        "hand_vertical_range_right": hand_vertical_range_right,
        "hand_vertical_range_asymmetry": abs(hand_vertical_range_left - hand_vertical_range_right),
        "foot_vertical_range_left": foot_vertical_range_left,
        "foot_vertical_range_right": foot_vertical_range_right,
        "foot_vertical_range_asymmetry": abs(foot_vertical_range_left - foot_vertical_range_right),
        "rep_duration_ms": float((len(joints) / FPS) * 1000.0),
    }


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
        path = dataset_root / f"Ex{exercise_id}-segmented" / file_name
        if not path.exists():
            raise FileNotFoundError(path)
        joints = np.load(path, allow_pickle=False)
        row: dict[str, object] = summarize(joints)
        row.update({
            "exercise_id": exercise_id,
            "exercise_name": EXERCISE_NAMES[exercise_id],
            "subject_id": str(annotation["person_id"]),
            "label": 0 if source_correctness == 1 else 1,
            "source_file": file_name,
            "source_correctness": source_correctness,
        })
        rows.append(row)

    output = pd.DataFrame(rows)
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(output_csv, index=False)

    summary = output.groupby("exercise_name").agg(
        repetitions=("label", "size"),
        subjects=("subject_id", "nunique"),
        deviations=("label", "sum"),
    )
    print(summary.to_string())
    print(f"Wrote {len(output)} repetitions across {output['exercise_id'].nunique()} exercises to {output_csv}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    build(args.dataset_root, args.output_csv)
