from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from acl_injury_benchmark import ACL_FEATURE_DOMAINS, GROUP, QUALITY_ONLY, TARGET

ALLOWED_MODEL_FAMILIES = {
    "logistic_regression",
    "random_forest",
    "extra_trees",
    "exposure_adjusted_hazard",
}
REQUIRED_DOMAINS = {"acl_history", "video_biomechanics", "exposure_fatigue"}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def known_feature_domain() -> dict[str, str]:
    return {
        feature: domain
        for domain, features in ACL_FEATURE_DOMAINS.items()
        for feature in features
    }


def validate_acl_model_plan(plan: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    if plan.get("specifiedBeforeModelFitting") is not True:
        errors.append("specifiedBeforeModelFitting must be true.")
    if str(plan.get("targetColumn", "")).strip() != TARGET:
        errors.append(f"targetColumn must equal {TARGET!r}.")
    if str(plan.get("participantColumn", "")).strip() != GROUP:
        errors.append(f"participantColumn must equal {GROUP!r}.")
    if str(plan.get("exposureColumn", "")).strip() != "sport_exposure_hours_28d":
        errors.append("exposureColumn must equal 'sport_exposure_hours_28d'.")

    selected = plan.get("selectedPredictors")
    if not isinstance(selected, list) or not selected:
        errors.append("selectedPredictors must be a non-empty ordered list.")
        selected = []
    selected = [str(item).strip() for item in selected if str(item).strip()]
    if len(selected) != len(set(selected)):
        errors.append("selectedPredictors cannot contain duplicates.")

    lookup = known_feature_domain()
    unknown = sorted(set(selected) - set(lookup))
    if unknown:
        errors.append("Unknown ACL predictors: " + ", ".join(unknown))
    forbidden = sorted(set(selected) & QUALITY_ONLY)
    if forbidden:
        errors.append(
            "Measurement-quality variables cannot be biological ACL predictors: "
            + ", ".join(forbidden)
        )
    domains = sorted({lookup[item] for item in selected if item in lookup})
    missing_required_domains = sorted(REQUIRED_DOMAINS - set(domains))
    if missing_required_domains:
        errors.append(
            "Selected ACL predictors must include the required domains: "
            + ", ".join(missing_required_domains)
        )
    if len(domains) < 4:
        errors.append("Selected ACL predictors must span at least four predictor domains.")

    families = plan.get("modelFamilies")
    if not isinstance(families, list) or not families:
        errors.append("modelFamilies must be a non-empty list.")
        families = []
    families = [str(item).strip() for item in families if str(item).strip()]
    unsupported = sorted(set(families) - ALLOWED_MODEL_FAMILIES)
    if unsupported:
        errors.append("Unsupported ACL model families: " + ", ".join(unsupported))
    if "exposure_adjusted_hazard" not in families:
        warnings.append(
            "The primary exposure-adjusted hazard family is absent from this plan."
        )

    rationale = str(plan.get("predictorSelectionRationale", "")).strip()
    if len(rationale) < 30:
        errors.append("predictorSelectionRationale must be substantive and pre-specified.")

    if plan.get("clinicalProbabilityDisplayAllowed") is not False:
        errors.append("clinicalProbabilityDisplayAllowed must be false in the research plan.")

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "planId": str(plan.get("planId", "")).strip(),
        "planVersion": str(plan.get("planVersion", "")).strip(),
        "selectedPredictors": selected,
        "selectedDomains": domains,
        "modelFamilies": families,
        "predictorSelectionRationale": rationale,
        "specifiedBeforeModelFitting": plan.get("specifiedBeforeModelFitting") is True,
        "clinicalProbabilityDisplayAllowed": False,
    }


def load_and_validate_acl_model_plan(path: Path) -> dict[str, Any]:
    plan = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(plan, dict):
        raise ValueError("ACL model plan JSON must contain one top-level object.")
    report = validate_acl_model_plan(plan)
    report["planSha256"] = _sha256(path)
    report["planPath"] = str(path)
    return report
