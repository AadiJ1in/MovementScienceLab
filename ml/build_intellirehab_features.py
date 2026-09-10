from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd

JOINT_TRIPLETS = {
    "left_elbow_angle": ("ShoulderLeft", "ElbowLeft", "WristLeft"),
    "right_elbow_angle": ("ShoulderRight", "ElbowRight", "WristRight"),
    "left_shoulder_angle": ("ElbowLeft", "ShoulderLeft", "HipLeft"),
    "right_shoulder_angle": ("ElbowRight", "ShoulderRight", "HipRight"),
    "left_hip_angle": ("ShoulderLeft", "HipLeft", "KneeLeft"),
    "right_hip_angle": ("ShoulderRight", "HipRight", "KneeRight"),
    "left_knee_angle": ("HipLeft", "KneeLeft", "AnkleLeft"),
    "right_knee_angle": ("HipRight", "KneeRight", "AnkleRight"),
}

KEY_JOINTS = [
    "Head", "Neck", "SpineShoulder", "SpineMid", "SpineBase",
    "ShoulderLeft", "ElbowLeft", "WristLeft",
    "ShoulderRight", "ElbowRight", "WristRight",
    "HipLeft", "KneeLeft", "AnkleLeft",
    "HipRight", "KneeRight", "AnkleRight",
]

NON_ASSIGNABLE_LABEL = "3"


def parse_filename(path: Path) -> dict[str, str]:
    parts = path.stem.split("_")
    if len(parts) < 6:
        raise ValueError(f"Unexpected IntelliRehab filename: {path.name}")
    return {
        "subject_id": parts[0],
        "session_id": parts[1],
        "exercise_id": parts[2],
        "repetition": parts[3],
        "source_correctness": parts[4],
        "position": "_".join(parts[5:]),
    }


def load_frames(path: Path) -> list[dict[str, np.ndarray]]:
    majority_ids: list[int] = []
    rows: list[list[str]] = []
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        raw = raw.strip()
        if not raw or "Version" in raw:
            continue
        words = raw.split(",")
        if len(words) < 3:
            continue
        try:
            majority_ids.append(int(words[1]))
        except ValueError:
            continue
        rows.append(words)
    if not majority_ids:
        return []
    body_id = max(set(majority_ids), key=majority_ids.count)
    frames: list[dict[str, np.ndarray]] = []
    expected = 3 + 25 * 7
    for words in rows:
        if len(words) != expected:
            continue
        try:
            if int(words[1]) != body_id:
                continue
        except ValueError:
            continue
        joints: dict[str, np.ndarray] = {}
        for idx in range(25):
            base = 3 + idx * 7
            name = words[base].strip("(")
            try:
                xyz = np.array([
                    float(words[base + 2]),
                    float(words[base + 3]),
                    float(words[base + 4]),
                ], dtype=float)
            except ValueError:
                continue
            joints[name] = xyz
        if joints:
            frames.append(joints)
    return frames


def angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    denom = float(np.linalg.norm(ba) * np.linalg.norm(bc))
    if denom <= 1e-8:
        return math.nan
    cos_value = float(np.clip(np.dot(ba, bc) / denom, -1.0, 1.0))
    return float(np.degrees(np.arccos(cos_value)))


def normalize_frame(frame: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    left_hip = frame.get("HipLeft")
    right_hip = frame.get("HipRight")
    left_shoulder = frame.get("ShoulderLeft")
    right_shoulder = frame.get("ShoulderRight")
    if left_hip is not None and right_hip is not None:
        origin = (left_hip + right_hip) / 2.0
    elif "SpineBase" in frame:
        origin = frame["SpineBase"]
    else:
        origin = np.zeros(3)
    scale_candidates: list[float] = []
    if left_shoulder is not None and right_shoulder is not None:
        scale_candidates.append(float(np.linalg.norm(left_shoulder - right_shoulder)))
    if left_hip is not None and right_hip is not None:
        scale_candidates.append(float(np.linalg.norm(left_hip - right_hip)))
    scale = max([v for v in scale_candidates if v > 1e-6], default=1.0)
    return {name: (xyz - origin) / scale for name, xyz in frame.items()}


def summarize(values: list[float], prefix: str, out: dict[str, float]) -> None:
    arr = np.asarray([v for v in values if np.isfinite(v)], dtype=float)
    if arr.size == 0:
        return
    out[f"{prefix}_mean"] = float(arr.mean())
    out[f"{prefix}_std"] = float(arr.std())
    out[f"{prefix}_min"] = float(arr.min())
    out[f"{prefix}_max"] = float(arr.max())
    out[f"{prefix}_range"] = float(arr.max() - arr.min())
    if arr.size > 1:
        delta = np.diff(arr)
        out[f"{prefix}_velocity_abs_mean"] = float(np.mean(np.abs(delta)))
        out[f"{prefix}_velocity_abs_max"] = float(np.max(np.abs(delta)))


def extract_features(frames: list[dict[str, np.ndarray]]) -> dict[str, float]:
    normalized = [normalize_frame(frame) for frame in frames]
    out: dict[str, float] = {"frame_count": float(len(normalized))}

    for feature_name, (a, b, c) in JOINT_TRIPLETS.items():
        series: list[float] = []
        for frame in normalized:
            if a in frame and b in frame and c in frame:
                series.append(angle(frame[a], frame[b], frame[c]))
        summarize(series, feature_name, out)

    for joint in KEY_JOINTS:
        for axis, axis_idx in (("x", 0), ("y", 1), ("z", 2)):
            values = [float(frame[joint][axis_idx]) for frame in normalized if joint in frame]
            summarize(values, f"{joint}_{axis}", out)

    paired = [
        ("wrist_height_asymmetry", "WristLeft", "WristRight", 1),
        ("elbow_height_asymmetry", "ElbowLeft", "ElbowRight", 1),
        ("knee_height_asymmetry", "KneeLeft", "KneeRight", 1),
        ("ankle_height_asymmetry", "AnkleLeft", "AnkleRight", 1),
    ]
    for name, left, right, axis in paired:
        values = [abs(float(frame[left][axis] - frame[right][axis])) for frame in normalized if left in frame and right in frame]
        summarize(values, name, out)

    if normalized:
        completeness = [sum(1 for joint in KEY_JOINTS if joint in frame) / len(KEY_JOINTS) for frame in normalized]
        out["key_joint_completeness_mean"] = float(np.mean(completeness))
        out["key_joint_completeness_min"] = float(np.min(completeness))
    return out


def main(input_dir: Path, output_csv: Path) -> None:
    rows: list[dict[str, object]] = []
    ignored = 0
    failed = 0
    for path in sorted(input_dir.rglob("*.txt")):
        try:
            info = parse_filename(path)
        except ValueError:
            failed += 1
            continue
        if info["source_correctness"] == NON_ASSIGNABLE_LABEL:
            ignored += 1
            continue
        if info["source_correctness"] not in {"1", "2"}:
            failed += 1
            continue
        frames = load_frames(path)
        if len(frames) < 2:
            failed += 1
            continue
        features = extract_features(frames)
        rows.append({
            "exercise_id": int(info["exercise_id"]),
            "exercise_name": f"irds-gesture-{info['exercise_id']}",
            "subject_id": info["subject_id"],
            "session_id": info["session_id"],
            "repetition": int(info["repetition"]),
            "position": info["position"],
            "label": 0 if info["source_correctness"] == "1" else 1,
            "source_correctness": int(info["source_correctness"]),
            "source_file": path.name,
            **features,
        })

    if not rows:
        raise RuntimeError("No usable IntelliRehab repetitions were parsed")
    df = pd.DataFrame(rows)
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_csv, index=False)
    print(f"Wrote {len(df)} labeled repetitions from {df['subject_id'].nunique()} subjects")
    print(df.groupby('exercise_id').agg(repetitions=('label','size'), subjects=('subject_id','nunique'), deviations=('label','sum')).to_string())
    print({"ignored_nonassignable": ignored, "failed_or_unparsed": failed})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    main(args.input_dir, args.output_csv)
