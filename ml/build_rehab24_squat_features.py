from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd

# REHAB24-6 26-joint skeleton indices used by ExerciseLLM.
HIPS = 0
SPINE1 = 2
LEFT_SHOULDER = 6
LEFT_ELBOW = 7
RIGHT_SHOULDER = 11
RIGHT_ELBOW = 12
LEFT_HIP = 16
LEFT_KNEE = 17
LEFT_FOOT = 18
RIGHT_HIP = 21
RIGHT_KNEE = 22
RIGHT_FOOT = 23
FPS = 30.0


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


def summarize(joints: np.ndarray) -> dict[str, float]:
    if joints.ndim != 3 or joints.shape[1] < 24 or joints.shape[2] != 2:
        raise ValueError(f"Expected (frames, >=24 joints, 2), got {joints.shape}")

    left_knee = 180.0 - angle_at_vertex(joints[:, LEFT_HIP], joints[:, LEFT_KNEE], joints[:, LEFT_FOOT])
    right_knee = 180.0 - angle_at_vertex(joints[:, RIGHT_HIP], joints[:, RIGHT_KNEE], joints[:, RIGHT_FOOT])
    shoulder_mid = (joints[:, LEFT_SHOULDER] + joints[:, RIGHT_SHOULDER]) / 2.0
    hip_mid = (joints[:, LEFT_HIP] + joints[:, RIGHT_HIP]) / 2.0
    trunk = angle_from_vertical(hip_mid, shoulder_mid)
    left_shoulder = angle_at_vertex(joints[:, LEFT_ELBOW], joints[:, LEFT_SHOULDER], joints[:, LEFT_HIP])
    right_shoulder = angle_at_vertex(joints[:, RIGHT_ELBOW], joints[:, RIGHT_SHOULDER], joints[:, RIGHT_HIP])

    left_range = float(np.ptp(left_knee))
    right_range = float(np.ptp(right_knee))
    left_shoulder_peak = float(np.max(np.abs(left_shoulder)))
    right_shoulder_peak = float(np.max(np.abs(right_shoulder)))

    return {
        "left_knee_flexion_min": float(np.min(left_knee)),
        "left_knee_flexion_max": float(np.max(left_knee)),
        "left_knee_flexion_range": left_range,
        "right_knee_flexion_min": float(np.min(right_knee)),
        "right_knee_flexion_max": float(np.max(right_knee)),
        "right_knee_flexion_range": right_range,
        # These frontal-plane fields intentionally remain NaN because the source
        # contains varying camera/orientation combinations. We do not relabel a
        # sagittal joint angle as frontal knee deviation.
        "peak_abs_left_knee_frontal_deviation": np.nan,
        "peak_abs_right_knee_frontal_deviation": np.nan,
        "peak_trunk_lean": float(np.max(np.abs(trunk))),
        "peak_abs_pelvic_line_obliquity": np.nan,
        "left_shoulder_elevation_peak": left_shoulder_peak,
        "right_shoulder_elevation_peak": right_shoulder_peak,
        "knee_flexion_asymmetry": abs(left_range - right_range),
        "shoulder_elevation_asymmetry": abs(left_shoulder_peak - right_shoulder_peak),
        "rep_duration_ms": float((len(joints) / FPS) * 1000.0),
        # REHAB24-6 skeletons do not contain MediaPipe visibility confidence.
        "mean_pose_confidence": np.nan,
        "min_pose_confidence": np.nan,
    }


def build(dataset_root: Path, output_csv: Path) -> None:
    annotations_path = dataset_root / "annotations.csv"
    annotations = pd.read_csv(annotations_path)
    required = {"file_name", "exercise_id", "person_id", "correctness"}
    missing = required - set(annotations.columns)
    if missing:
        raise ValueError(f"annotations.csv missing columns: {sorted(missing)}")

    squats = annotations[annotations["exercise_id"] == 6].copy()
    if squats.empty:
        raise ValueError("No Ex6 squat annotations found.")

    if not set(squats["correctness"].dropna().astype(int).unique()).issubset({0, 1}):
        raise ValueError("Unexpected correctness encoding; expected source 1=correct, 0=incorrect.")

    rows: list[dict[str, object]] = []
    ex_dir = dataset_root / "Ex6-segmented"
    for _, annotation in squats.iterrows():
        file_name = str(annotation["file_name"])
        path = ex_dir / file_name
        if not path.exists():
            raise FileNotFoundError(path)
        joints = np.load(path, allow_pickle=False)
        row: dict[str, object] = summarize(joints)
        row["subject_id"] = str(annotation["person_id"])
        # Model contract: positive class is deviation/non-optimal.
        row["label"] = 0 if int(annotation["correctness"]) == 1 else 1
        row["source_file"] = file_name
        row["source_correctness"] = int(annotation["correctness"])
        if "side" in annotations.columns:
            row["source_side"] = str(annotation.get("side", ""))
        rows.append(row)

    output = pd.DataFrame(rows)
    if output["subject_id"].nunique() < 6:
        raise ValueError("Too few subjects for grouped validation.")
    if set(output["label"].unique()) != {0, 1}:
        raise ValueError("Both correct and incorrect classes are required.")

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(output_csv, index=False)
    print(f"Wrote {len(output)} squat repetitions from {output['subject_id'].nunique()} subjects to {output_csv}")
    print(output["label"].value_counts().sort_index().to_dict())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    build(args.dataset_root, args.output_csv)
