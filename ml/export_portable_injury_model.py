from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from prospective_injury_benchmark import FEATURE_DOMAINS


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _feature_domain_map(features: list[str]) -> dict[str, str]:
    lookup = {
        feature: domain
        for domain, domain_features in FEATURE_DOMAINS.items()
        for feature in domain_features
    }
    unknown = sorted(set(features) - set(lookup))
    if unknown:
        raise ValueError("Portable model contains features missing from FEATURE_DOMAINS: " + ", ".join(unknown))
    return {feature: lookup[feature] for feature in features}


def build_portable_artifact(
    bundle: dict[str, Any],
    research_artifact: dict[str, Any],
    *,
    source_label: str,
    source_url: str | None,
    model_version: str,
) -> dict[str, Any]:
    features = [str(feature) for feature in bundle["features"]]
    model = bundle.get("portableLogisticModel")
    calibrator = bundle.get("portableLogisticCalibrator")
    threshold = float(bundle.get("portableLogisticThreshold", 0.5))
    portable_metrics = bundle.get("portableLogisticDevelopmentMetrics")

    if model is None or calibrator is None or portable_metrics is None:
        raise ValueError(
            "Model bundle is missing the portable logistic candidate. Re-run the current prospective benchmark before export."
        )

    preprocess = model.named_steps["preprocess"]
    numeric = preprocess.named_transformers_["numeric"]
    imputer = numeric.named_steps["impute"]
    scaler = numeric.named_steps["scale"]
    classifier = model.named_steps["classifier"]

    medians = np.asarray(imputer.statistics_, dtype=float)
    means = np.asarray(scaler.mean_, dtype=float)
    scales = np.asarray(scaler.scale_, dtype=float)
    coefficients = np.asarray(classifier.coef_[0], dtype=float)
    intercept = float(classifier.intercept_[0])

    if not (
        len(features)
        == len(medians)
        == len(means)
        == len(scales)
        == len(coefficients)
    ):
        raise ValueError("Portable model parameter arrays do not match the feature contract.")
    if not np.isfinite(medians).all() or not np.isfinite(means).all() or not np.isfinite(scales).all():
        raise ValueError("Portable preprocessing contains non-finite values.")
    if np.any(scales <= 0):
        raise ValueError("Portable preprocessing scales must be positive.")

    validation = research_artifact["validation"]
    deployment = research_artifact["deploymentGate"]
    internal_gate = deployment.get("internalEngineeringGate", {})
    eligible_research = bool(
        internal_gate.get("passed")
        and validation.get("splitUnit") == "participant"
        and validation.get("nestedEvaluation")
        and validation.get("featureTimingAudited")
    )

    calibration_intercept = float(calibrator.intercept_[0])
    calibration_coefficient = float(calibrator.coef_[0][0])

    return {
        "schemaVersion": "1.0.0",
        "modelType": "portable-logistic-prospective-injury-risk",
        "trainingDataType": "prospective-human",
        "clinicalClaim": "research-risk-estimation-only",
        "modelName": "MovementScienceLab transparent multimodal prospective injury model",
        "modelVersion": model_version,
        "outcome": {
            "label": research_artifact["outcome"]["label"],
            "horizonDays": int(research_artifact["outcome"]["horizonDays"]),
            "population": research_artifact["population"],
        },
        "cameraMeasurementVersion": research_artifact["cameraMeasurementVersion"],
        "decisionThreshold": threshold,
        "features": features,
        "featureDomains": _feature_domain_map(features),
        "preprocessing": {
            "medians": medians.tolist(),
            "means": means.tolist(),
            "scales": scales.tolist(),
        },
        "model": {
            "intercept": intercept,
            "coefficients": coefficients.tolist(),
        },
        "calibration": {
            "method": "platt-logistic",
            "intercept": calibration_intercept,
            "coefficient": calibration_coefficient,
        },
        "validation": {
            "nParticipants": int(validation["nParticipants"]),
            "nRows": int(validation["nRows"]),
            "auroc": portable_metrics.get("auroc"),
            "auprc": portable_metrics.get("auprc"),
            "brier": portable_metrics.get("brier"),
            "calibrationSlope": portable_metrics.get("calibrationSlope"),
            "calibrationIntercept": portable_metrics.get("calibrationIntercept"),
            "internalEngineeringGatePassed": bool(internal_gate.get("passed")),
            "participantGrouped": validation.get("splitUnit") == "participant",
            "nestedEvaluation": bool(validation.get("nestedEvaluation")),
            "externalValidated": bool(validation.get("externalValidated")),
            "cameraDomainValidated": bool(validation.get("cameraDomainValidated")),
        },
        "deploymentGate": {
            "eligibleForResearchRiskEstimate": eligible_research,
            "eligibleForUserFacingInjuryProbability": False,
            "requiresIndependentExternalCohort": True,
            "requiresSameCameraPoseDomainValidation": True,
            "requiresClinicalGovernanceReview": True,
        },
        "provenance": {
            "sourceLabel": source_label,
            "sourceUrl": source_url,
            "note": (
                "Browser-portable logistic candidate exported from the strict prospective research pipeline. "
                "Eligibility for a research estimate does not imply clinical validation or permission to display a clinical injury probability."
            ),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export the transparent prospective injury candidate to a browser-safe JSON artifact."
    )
    parser.add_argument("input_model", type=Path)
    parser.add_argument("input_research_json", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--source-label", required=True)
    parser.add_argument("--source-url", default=None)
    parser.add_argument("--model-version", default=None)
    args = parser.parse_args()

    bundle = joblib.load(args.input_model)
    research_artifact = json.loads(args.input_research_json.read_text(encoding="utf-8"))
    version = args.model_version or f"prospective-{_sha256(args.input_research_json)[:12]}"
    portable = build_portable_artifact(
        bundle,
        research_artifact,
        source_label=args.source_label,
        source_url=args.source_url,
        model_version=version,
    )
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(portable, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
