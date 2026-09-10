from __future__ import annotations

import argparse
import json
from pathlib import Path

# These are engineering/research quality gates, not clinical cutoffs or
# regulatory sufficiency criteria. They prevent weak experimental models from
# being promoted merely because training completed successfully.
MIN_SUBJECTS = 8
MIN_AUROC = 0.70
MIN_BALANCED_ACCURACY = 0.68
MIN_SENSITIVITY = 0.50
MIN_SPECIFICITY = 0.50


def quality_score(model: dict) -> tuple[float, float, float]:
    validation = model.get("validation", {})
    return (
        float(validation.get("auroc", 0.0) or 0.0),
        float(validation.get("balancedAccuracy", 0.0) or 0.0),
        -float(validation.get("brier", 1.0) or 1.0),
    )


def gate(model: dict) -> tuple[bool, list[str]]:
    v = model.get("validation", {})
    reasons: list[str] = []
    if int(model.get("nSubjects", 0)) < MIN_SUBJECTS:
        reasons.append(f"fewer than {MIN_SUBJECTS} source subjects")
    if float(v.get("auroc", 0.0) or 0.0) < MIN_AUROC:
        reasons.append(f"AUROC below research gate {MIN_AUROC:.2f}")
    if float(v.get("balancedAccuracy", 0.0) or 0.0) < MIN_BALANCED_ACCURACY:
        reasons.append(f"balanced accuracy below research gate {MIN_BALANCED_ACCURACY:.2f}")
    sensitivity = v.get("sensitivity")
    specificity = v.get("specificity")
    if sensitivity is None or float(sensitivity) < MIN_SENSITIVITY:
        reasons.append(f"sensitivity below research gate {MIN_SENSITIVITY:.2f}")
    if specificity is None or float(specificity) < MIN_SPECIFICITY:
        reasons.append(f"specificity below research gate {MIN_SPECIFICITY:.2f}")
    return (not reasons, reasons)


def load_models(path: Path, representation: str) -> dict[str, dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, dict] = {}
    for model in payload.get("models", []):
        if model.get("status") != "trained-research-only":
            continue
        enriched = dict(model)
        enriched["representation"] = representation
        result[str(model["exerciseName"])] = enriched
    return result


def main(static_path: Path, temporal_path: Path, output_path: Path) -> None:
    static = load_models(static_path, "static-summary")
    temporal = load_models(temporal_path, "phase-normalized-temporal")
    exercises = sorted(set(static) | set(temporal))
    selections = []

    for exercise in exercises:
        candidates = [m for m in (static.get(exercise), temporal.get(exercise)) if m]
        candidates.sort(key=quality_score, reverse=True)
        selected = candidates[0]
        passed, reasons = gate(selected)
        v = selected["validation"]
        selections.append(
            {
                "exercise": exercise,
                "selectedRepresentation": selected["representation"],
                "researchStatus": "candidate" if passed else "blocked",
                "nSubjects": selected["nSubjects"],
                "nRepetitions": selected["nRepetitions"],
                "validation": v,
                "blockingReasons": reasons,
                "clinicalDeployment": "blocked",
                "clinicalDeploymentReasons": [
                    "independent external validation required",
                    "webcam/MediaPipe-domain validation required",
                    "source-license review required",
                    "subgroup/fairness validation required",
                    "clinical intended-use and regulatory review required",
                ],
                "mayDiagnoseInjury": False,
                "mayPredictFutureInjury": False,
            }
        )

    output = {
        "schemaVersion": "1.0.0",
        "purpose": "Research model selection and fail-closed promotion manifest",
        "selectionRule": "Prefer highest subject-grouped OOF AUROC; break ties with balanced accuracy and Brier score.",
        "researchGates": {
            "minSubjects": MIN_SUBJECTS,
            "minAUROC": MIN_AUROC,
            "minBalancedAccuracy": MIN_BALANCED_ACCURACY,
            "minSensitivity": MIN_SENSITIVITY,
            "minSpecificity": MIN_SPECIFICITY,
            "note": "Engineering/research gates only; passing them does not establish clinical validity.",
        },
        "selections": selections,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("static_models", type=Path)
    parser.add_argument("temporal_models", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()
    main(args.static_models, args.temporal_models, args.output_json)
