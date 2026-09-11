from __future__ import annotations

import argparse
import json
from pathlib import Path

MIN_AUROC = 0.80
MIN_BALANCED_ACCURACY = 0.75
MIN_SENSITIVITY = 0.75
MIN_SPECIFICITY = 0.75
MIN_SUBJECTS = 20


def passes(value, threshold: float) -> bool:
    return value is not None and float(value) >= threshold


def main(nested_json: Path, benchmark_json: Path, output_json: Path) -> None:
    nested = json.loads(nested_json.read_text())
    benchmark = json.loads(benchmark_json.read_text())
    benchmark_by_id = {
        int(task["exerciseId"]): task
        for task in benchmark.get("tasks", [])
        if task.get("status") == "benchmarked"
    }

    decisions = []
    for task in nested.get("tasks", []):
        if task.get("status") != "nested-evaluated":
            decisions.append({
                "exerciseId": task.get("exerciseId"),
                "exerciseName": task.get("exerciseName"),
                "status": "blocked",
                "reasons": [task.get("reason", "nested evaluation unavailable")],
            })
            continue

        metrics = task["metrics"]
        reasons = []
        checks = {
            "subjects": int(task.get("nSubjects", 0)) >= MIN_SUBJECTS,
            "auroc": passes(metrics.get("auroc"), MIN_AUROC),
            "balancedAccuracy": passes(metrics.get("balancedAccuracy"), MIN_BALANCED_ACCURACY),
            "sensitivity": passes(metrics.get("sensitivity"), MIN_SENSITIVITY),
            "specificity": passes(metrics.get("specificity"), MIN_SPECIFICITY),
        }
        for key, passed in checks.items():
            if not passed:
                reasons.append(f"{key} below research promotion gate")

        benchmark_task = benchmark_by_id.get(int(task["exerciseId"]))
        decisions.append({
            "exerciseId": task["exerciseId"],
            "exerciseName": task["exerciseName"],
            "status": "priority-research-candidate" if all(checks.values()) else "blocked",
            "nestedMetrics": metrics,
            "nSubjects": task.get("nSubjects"),
            "selectedModelCountsAcrossOuterFolds": task.get("selectedModelCounts"),
            "fullDatasetBenchmarkRecommendation": None if not benchmark_task else benchmark_task.get("recommendedResearchModel"),
            "checks": checks,
            "reasons": reasons,
            "clinicalDeployment": "blocked",
            "remainingMandatoryGates": [
                "independent external dataset validation",
                "real webcam/MediaPipe domain validation",
                "subgroup performance assessment",
                "clinical/human-factors validation for intended workflow",
                "licensing and regulatory review",
            ],
        })

    payload = {
        "schemaVersion": "1.0.0",
        "sourceDataset": "IntelliRehabDS",
        "decisionPolicy": {
            "minimumSubjects": MIN_SUBJECTS,
            "minimumNestedAUROC": MIN_AUROC,
            "minimumNestedBalancedAccuracy": MIN_BALANCED_ACCURACY,
            "minimumNestedSensitivity": MIN_SENSITIVITY,
            "minimumNestedSpecificity": MIN_SPECIFICITY,
        },
        "clinicalClaim": "none",
        "decisions": decisions,
        "warning": "Passing these internal research gates never enables autonomous diagnosis, injury prediction, or hospital production use.",
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("nested_json", type=Path)
    parser.add_argument("benchmark_json", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()
    main(args.nested_json, args.benchmark_json, args.output_json)
