from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _nonempty(value: Any, field: str, errors: list[str]) -> str:
    text = "" if value is None else str(value).strip()
    if not text:
        errors.append(f"{field} must be non-empty.")
    return text


def _unique_strings(value: Any, field: str, errors: list[str]) -> list[str]:
    if not isinstance(value, list) or not value:
        errors.append(f"{field} must be a non-empty list.")
        return []
    values = [str(item).strip() for item in value]
    if any(not item for item in values):
        errors.append(f"{field} cannot contain empty values.")
    if len(set(values)) != len(values):
        errors.append(f"{field} cannot contain duplicates.")
    return values


def validate_feature_plan(
    plan: dict[str, Any],
    *,
    expected_features: Iterable[str] | None = None,
    expected_model_families: Iterable[str] | None = None,
    expected_horizon_days: int | None = None,
    expected_outcome_name: str | None = None,
    require_model_fitting_authorized: bool = False,
) -> dict[str, Any]:
    """Validate a pre-specified feature/model-family plan.

    This prevents the training path from silently expanding or shrinking the
    candidate feature set after looking at performance. The plan may explicitly
    keep model fitting locked; in that state the plan itself is valid, but a
    strict training entry point must refuse to fit a model.
    """
    errors: list[str] = []
    warnings: list[str] = []

    schema_version = _nonempty(plan.get("schemaVersion"), "schemaVersion", errors)
    plan_id = _nonempty(plan.get("planId"), "planId", errors)
    plan_version = _nonempty(plan.get("planVersion"), "planVersion", errors)
    source = _nonempty(plan.get("planSource"), "planSource", errors)

    specified_before = plan.get("specifiedBeforePerformanceEvaluation")
    if specified_before is not True:
        errors.append("specifiedBeforePerformanceEvaluation must be true.")

    if plan.get("postHocFeatureExpansionAllowed") is not False:
        errors.append("postHocFeatureExpansionAllowed must be false.")

    outcome_name = _nonempty(plan.get("outcomeName"), "outcomeName", errors)
    try:
        horizon_days = int(plan.get("predictionHorizonDays"))
        if horizon_days <= 0:
            raise ValueError
    except (TypeError, ValueError):
        errors.append("predictionHorizonDays must be a positive integer.")
        horizon_days = -1

    independence_unit = _nonempty(plan.get("independenceUnit"), "independenceUnit", errors)
    if independence_unit and independence_unit != "participant":
        errors.append(
            "independenceUnit must be 'participant' for the current repeated-observation research pipeline."
        )

    features = _unique_strings(plan.get("candidatePredictors"), "candidatePredictors", errors)
    model_families = _unique_strings(plan.get("modelFamilies"), "modelFamilies", errors)

    model_fitting_authorized = plan.get("modelFittingAuthorized")
    if not isinstance(model_fitting_authorized, bool):
        errors.append("modelFittingAuthorized must be a boolean.")
        model_fitting_authorized = False
    authorization_rationale = _nonempty(
        plan.get("modelFittingAuthorizationRationale"),
        "modelFittingAuthorizationRationale",
        errors,
    )
    sample_size_method = str(plan.get("sampleSizeMethod") or "").strip()
    if model_fitting_authorized and not sample_size_method:
        errors.append(
            "sampleSizeMethod must be documented before model fitting can be authorized."
        )
    if require_model_fitting_authorized and not model_fitting_authorized:
        errors.append(
            "The feature plan is valid for information auditing but does not authorize model fitting."
        )

    if expected_features is not None:
        expected = list(expected_features)
        if features != expected:
            errors.append(
                "candidatePredictors does not exactly match the frozen modeling feature order. "
                f"Expected {expected}; got {features}."
            )

    if expected_model_families is not None:
        expected_models = list(expected_model_families)
        if model_families != expected_models:
            errors.append(
                "modelFamilies does not exactly match the frozen benchmark model-family order. "
                f"Expected {expected_models}; got {model_families}."
            )

    if expected_horizon_days is not None and horizon_days != int(expected_horizon_days):
        errors.append(
            f"Feature-plan horizon ({horizon_days}) does not match the run horizon ({expected_horizon_days})."
        )

    if expected_outcome_name is not None and outcome_name != expected_outcome_name.strip():
        errors.append("Feature-plan outcomeName does not match the pre-specified scientific protocol outcome.")

    transformations = plan.get("transformations")
    if transformations is None:
        warnings.append(
            "transformations is absent; reviewers should verify all preprocessing is fully encoded in the benchmark code."
        )
    elif not isinstance(transformations, dict):
        errors.append("transformations must be an object when supplied.")

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "schemaVersion": schema_version,
        "planId": plan_id,
        "planVersion": plan_version,
        "planSource": source,
        "specifiedBeforePerformanceEvaluation": specified_before is True,
        "postHocFeatureExpansionAllowed": False,
        "outcomeName": outcome_name,
        "predictionHorizonDays": horizon_days,
        "independenceUnit": independence_unit,
        "candidatePredictors": features,
        "modelFamilies": model_families,
        "transformations": transformations if isinstance(transformations, dict) else None,
        "modelFittingAuthorized": bool(model_fitting_authorized),
        "modelFittingAuthorizationRationale": authorization_rationale,
        "sampleSizeMethod": sample_size_method or None,
    }


def load_and_validate_feature_plan(
    path: Path,
    **kwargs: Any,
) -> dict[str, Any]:
    plan = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(plan, dict):
        raise ValueError("Feature-plan JSON must contain one top-level object.")
    report = validate_feature_plan(plan, **kwargs)
    report["featurePlanSha256"] = _sha256(path)
    report["featurePlanPath"] = str(path)
    return report
