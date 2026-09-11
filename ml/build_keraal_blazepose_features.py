from __future__ import annotations

import argparse
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import pandas as pd

EXERCISE_IDS = {"CTK": 0, "ELK": 1, "RTK": 2}


def parse_identity(stem: str) -> tuple[str, str, str, str]:
    normalized = stem.replace("G2A-BP-", "G2A-").replace("G2A-Anon-", "G2A-")
    match = re.match(r"G2A-(CTK|ELK|RTK)-(S\d+)-(Brest|Roscoff)-(\d+)$", normalized)
    if not match:
        raise ValueError(f"Unrecognized KERAAL identity: {stem}")
    exercise, subject, site, recording = match.groups()
    return exercise, subject, site, recording


def global_label(path: Path) -> tuple[int | None, str | None]:
    tree = ET.parse(path)
    root = tree.getroot()
    evaluation = None
    error_type = None
    for track in root.iter("track"):
        name = track.attrib.get("name")
        element = track.find("el")
        if element is None:
            continue
        attrs = {node.attrib.get("name", "value"): (node.text or "").strip() for node in element.findall("attribute")}
        if name == "Global evaluation":
            evaluation = attrs.get("evaluation") or attrs.get("value") or next(iter(attrs.values()), None)
        elif name == "Global error":
            error_type = attrs.get("type") or next(iter(attrs.values()), None)

    if evaluation is None:
        return None, error_type
    text = evaluation.strip().lower()
    if text == "correct":
        return 0, error_type
    if text in {"incorrect", "incomplete", "motionless"}:
        return 1, error_type
    # Some files encode correctness through a non-none global error instead of an explicit Incorrect string.
    if error_type and error_type.strip().lower() not in {"none", "", "correct"}:
        return 1, error_type
    return None, error_type


def angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    denom = np.linalg.norm(ba) * np.linalg.norm(bc)
    if denom <= 1e-9:
        return float("nan")
    cosine = float(np.clip(np.dot(ba, bc) / denom, -1.0, 1.0))
    return math.degrees(math.acos(cosine))


def series_stats(values: list[float], prefix: str) -> dict[str, float]:
    arr = np.asarray([value for value in values if np.isfinite(value)], dtype=float)
    if arr.size == 0:
        return {f"{prefix}_{suffix}": float("nan") for suffix in ("mean", "std", "min", "max", "range", "p10", "p90")}
    return {
        f"{prefix}_mean": float(np.mean(arr)),
        f"{prefix}_std": float(np.std(arr)),
        f"{prefix}_min": float(np.min(arr)),
        f"{prefix}_max": float(np.max(arr)),
        f"{prefix}_range": float(np.ptp(arr)),
        f"{prefix}_p10": float(np.quantile(arr, 0.10)),
        f"{prefix}_p90": float(np.quantile(arr, 0.90)),
    }


def point(frame: dict, name: str, dims: int = 2) -> np.ndarray:
    value = frame.get(name)
    if not isinstance(value, list) or len(value) < dims:
        return np.full(dims, np.nan)
    return np.asarray(value[:dims], dtype=float)


def build_features(payload: dict) -> dict[str, float]:
    positions = payload.get("positions", {})
    frames = [positions[key] for key in sorted(positions, key=lambda item: float(item)) if isinstance(positions[key], dict)]
    if len(frames) < 5:
        raise ValueError("Fewer than five usable BlazePose frames")

    left_elbow, right_elbow = [], []
    left_shoulder, right_shoulder = [], []
    left_hip, right_hip = [], []
    trunk_lean, shoulder_obliquity, hip_obliquity = [], [], []
    wrist_span_norm, elbow_span_norm = [], []
    shoulder_mid_x, shoulder_mid_y, hip_mid_x, hip_mid_y = [], [], [], []

    for frame in frames:
        ls, rs = point(frame, "Left_shoulder"), point(frame, "Right_shoulder")
        le, re = point(frame, "Left_elbow"), point(frame, "Right_elbow")
        lw, rw = point(frame, "Left_wrist"), point(frame, "Right_wrist")
        lh, rh = point(frame, "Left_hip"), point(frame, "Right_hip")
        lk, rk = point(frame, "Left_knee"), point(frame, "Right_knee")

        shoulder_width = float(np.linalg.norm(ls - rs))
        torso_mid_shoulder = (ls + rs) / 2.0
        torso_mid_hip = (lh + rh) / 2.0
        torso_length = float(np.linalg.norm(torso_mid_shoulder - torso_mid_hip))
        scale = max(shoulder_width, torso_length, 1e-6)

        left_elbow.append(angle(ls, le, lw))
        right_elbow.append(angle(rs, re, rw))
        left_shoulder.append(angle(le, ls, lh))
        right_shoulder.append(angle(re, rs, rh))
        left_hip.append(angle(ls, lh, lk))
        right_hip.append(angle(rs, rh, rk))

        dx = torso_mid_shoulder[0] - torso_mid_hip[0]
        dy = torso_mid_hip[1] - torso_mid_shoulder[1]
        trunk_lean.append(math.degrees(math.atan2(abs(dx), max(abs(dy), 1e-9))))
        shoulder_obliquity.append(math.degrees(math.atan2(ls[1] - rs[1], ls[0] - rs[0])))
        hip_obliquity.append(math.degrees(math.atan2(lh[1] - rh[1], lh[0] - rh[0])))
        wrist_span_norm.append(float(np.linalg.norm(lw - rw) / scale))
        elbow_span_norm.append(float(np.linalg.norm(le - re) / scale))
        shoulder_mid_x.append(float(torso_mid_shoulder[0]))
        shoulder_mid_y.append(float(torso_mid_shoulder[1]))
        hip_mid_x.append(float(torso_mid_hip[0]))
        hip_mid_y.append(float(torso_mid_hip[1]))

    features: dict[str, float] = {"frame_count": float(len(frames))}
    for name, values in {
        "left_elbow_angle": left_elbow,
        "right_elbow_angle": right_elbow,
        "left_shoulder_angle": left_shoulder,
        "right_shoulder_angle": right_shoulder,
        "left_hip_angle": left_hip,
        "right_hip_angle": right_hip,
        "trunk_lean": trunk_lean,
        "shoulder_obliquity": shoulder_obliquity,
        "hip_obliquity": hip_obliquity,
        "wrist_span_norm": wrist_span_norm,
        "elbow_span_norm": elbow_span_norm,
    }.items():
        features.update(series_stats(values, name))

    features["elbow_asymmetry_mean"] = float(np.nanmean(np.abs(np.asarray(left_elbow) - np.asarray(right_elbow))))
    features["shoulder_asymmetry_mean"] = float(np.nanmean(np.abs(np.asarray(left_shoulder) - np.asarray(right_shoulder))))
    features["hip_asymmetry_mean"] = float(np.nanmean(np.abs(np.asarray(left_hip) - np.asarray(right_hip))))

    # Whole-repetition displacement/smoothness proxies. These are normalized image-coordinate features,
    # not physical velocity or acceleration.
    for name, values in {
        "shoulder_mid_x": shoulder_mid_x,
        "shoulder_mid_y": shoulder_mid_y,
        "hip_mid_x": hip_mid_x,
        "hip_mid_y": hip_mid_y,
    }.items():
        arr = np.asarray(values, dtype=float)
        features[f"{name}_range"] = float(np.ptp(arr))
        velocity = np.diff(arr)
        features[f"{name}_velocity_abs_mean"] = float(np.mean(np.abs(velocity))) if velocity.size else 0.0
        acceleration = np.diff(velocity)
        features[f"{name}_acceleration_abs_mean"] = float(np.mean(np.abs(acceleration))) if acceleration.size else 0.0

    return features


def annotation_index(root: Path) -> dict[str, list[tuple[Path, int | None, str | None]]]:
    index: dict[str, list[tuple[Path, int | None, str | None]]] = {}
    for path in root.rglob("*.anvil"):
        identity = path.stem
        index.setdefault(identity, []).append((path, *global_label(path)))
    return index


def main(root: Path, output_csv: Path) -> None:
    annotations = annotation_index(root)
    rows = []
    disagreements = 0
    missing_annotation = 0
    invalid = 0

    for path in sorted(root.rglob("*.json")):
        if "blazepose" not in str(path).lower():
            continue
        try:
            exercise, subject, site, recording = parse_identity(path.stem)
            identity = f"G2A-{exercise}-{subject}-{site}-{recording}"
            reviews = annotations.get(identity, [])
            labels = [label for _, label, _ in reviews if label is not None]
            if not labels:
                missing_annotation += 1
                continue
            if len(set(labels)) != 1:
                disagreements += 1
                continue
            consensus = labels[0]
            error_types = sorted({error for _, _, error in reviews if error and error.lower() not in {"none", "correct"}})
            features = build_features(json.loads(path.read_text()))
            rows.append({
                "exercise_id": EXERCISE_IDS[exercise],
                "exercise_name": f"keraal-{exercise.lower()}",
                "subject_id": subject,
                "label": consensus,
                "source_file": path.name,
                "source_correctness": "consensus-correct" if consensus == 0 else "consensus-deviation",
                "site": site,
                "recording_id": recording,
                "annotator_count": len(reviews),
                "error_type_count": len(error_types),
                **features,
            })
        except Exception as exc:
            invalid += 1
            print(f"SKIP {path.name}: {exc}")

    if not rows:
        raise RuntimeError("No physician-consensus KERAAL rows were built")
    df = pd.DataFrame(rows)
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_csv, index=False)
    print(f"Wrote {len(df)} consensus-labeled BlazePose recordings from {df['subject_id'].nunique()} subjects")
    print(df.groupby('exercise_name').agg(repetitions=('label','size'), subjects=('subject_id','nunique'), deviations=('label','sum')).to_string())
    print({"annotator_disagreements_excluded": disagreements, "missing_annotation": missing_annotation, "invalid": invalid})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    main(args.root, args.output_csv)
