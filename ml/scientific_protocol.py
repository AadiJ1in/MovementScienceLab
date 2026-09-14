from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

REQUIRED_INTENDED_USE = "research-risk-estimation-only"


def _nonempty(value: Any, field: str, errors: list[str]) -> str:
    text = "" if value is None else str(value).strip()
    if not text:
        errors.append(f"{field} must be non-empty.")
    return text


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_protocol(
    protocol: dict[str, Any],
    *,
    expected_horizon_days: int | None = None,
    expected_population: str | None = None,
    expected_index_time_definition: str | None = None,
) -> dict[str, Any]:
    """Validate a pre-specified, outcome-specific research protocol.

    The validator deliberately checks definitions and consistency, not whether a
    scientific claim is true. Passing this audit means the prediction question
    is explicit enough to reproduce and review; it does not validate the model.
    """
    errors: list[str] = []
    warnings: list[str] = []

    schema_version = _nonempty(protocol.get("schemaVersion"), "schemaVersion", errors)
    protocol_id = _nonempty(protocol.get("protocolId"), "protocolId", errors)
    protocol_version = _nonempty(protocol.get("protocolVersion"), "protocolVersion", errors)
    protocol_source = _nonempty(protocol.get("protocolSource"), "protocolSource", errors)

    pre_specified = protocol.get("specifiedBeforeModelFitting")
    if pre_specified is not True:
        errors.append("specifiedBeforeModelFitting must be true for the strict research training path.")

    intended_use = _nonempty(protocol.get("intendedUse"), "intendedUse", errors)
    if intended_use and intended_use != REQUIRED_INTENDED_USE:
        errors.append(
            f"intendedUse must equal {REQUIRED_INTENDED_USE!r}; got {intended_use!r}."
        )

    outcome = protocol.get("outcome")
    if not isinstance(outcome, dict):
        errors.append("outcome must be an object.")
        outcome = {}
    outcome_name = _nonempty(outcome.get("name"), "outcome.name", errors)
    case_definition = _nonempty(outcome.get("caseDefinition"), "outcome.caseDefinition", errors)
    adjudication = _nonempty(outcome.get("adjudication"), "outcome.adjudication", errors)
    try:
        horizon_days = int(outcome.get("predictionHorizonDays"))
        if horizon_days <= 0:
            raise ValueError
    except (TypeError, ValueError):
        errors.append("outcome.predictionHorizonDays must be a positive integer.")
        horizon_days = -1

    population = protocol.get("population")
    if not isinstance(population, dict):
        errors.append("population must be an object.")
        population = {}
    population_description = _nonempty(
        population.get("description"), "population.description", errors
    )
    inclusion = _nonempty(population.get("inclusionCriteria"), "population.inclusionCriteria", errors)
    exclusion = _nonempty(population.get("exclusionCriteria"), "population.exclusionCriteria", errors)

    prediction_index = protocol.get("predictionIndex")
    if not isinstance(prediction_index, dict):
        errors.append("predictionIndex must be an object.")
        prediction_index = {}
    index_definition = _nonempty(
        prediction_index.get("definition"), "predictionIndex.definition", errors
    )
    predictor_cutoff = _nonempty(
        prediction_index.get("predictorCutoffRule"),
        "predictionIndex.predictorCutoffRule",
        errors,
    )

    camera_scope = protocol.get("cameraEvidenceScope")
    if not isinstance(camera_scope, dict):
        errors.append("cameraEvidenceScope must be an object for camera-based research.")
        camera_scope = {}
    measurement = _nonempty(
        camera_scope.get("measurementDefinition"),
        "cameraEvidenceScope.measurementDefinition",
        errors,
    )
    supported_contexts = camera_scope.get("supportedOutcomeContexts")
    if not isinstance(supported_contexts, list) or not any(str(item).strip() for item in supported_contexts):
        errors.append("cameraEvidenceScope.supportedOutcomeContexts must contain at least one explicit research context.")
        supported_contexts = []
    if camera_scope.get("generalInjuryClaimAllowed") is not False:
        errors.append("cameraEvidenceScope.generalInjuryClaimAllowed must be false.")
    if camera_scope.get("equivalentTo3DKinematics") is not False:
        errors.append("cameraEvidenceScope.equivalentTo3DKinematics must be false.")

    if expected_horizon_days is not None and horizon_days != int(expected_horizon_days):
        errors.append(
            f"Protocol horizon ({horizon_days}) does not match training horizon ({expected_horizon_days})."
        )
    if expected_population is not None and population_description != expected_population.strip():
        errors.append("Protocol population.description does not match the training --population value.")
    if (
        expected_index_time_definition is not None
        and index_definition != expected_index_time_definition.strip()
    ):
        errors.append(
            "Protocol predictionIndex.definition does not match the training --index-time-definition value."
        )

    if len(case_definition) < 20:
        warnings.append("outcome.caseDefinition is very short; reviewers should confirm it is operationally reproducible.")
    if len(adjudication) < 20:
        warnings.append("outcome.adjudication is very short; reviewers should confirm the outcome process is reproducible.")

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "schemaVersion": schema_version,
        "protocolId": protocol_id,
        "protocolVersion": protocol_version,
        "protocolSource": protocol_source,
        "specifiedBeforeModelFitting": pre_specified is True,
        "intendedUse": intended_use,
        "outcome": {
            "name": outcome_name,
            "caseDefinition": case_definition,
            "adjudication": adjudication,
            "predictionHorizonDays": horizon_days,
        },
        "population": {
            "description": population_description,
            "inclusionCriteria": inclusion,
            "exclusionCriteria": exclusion,
        },
        "predictionIndex": {
            "definition": index_definition,
            "predictorCutoffRule": predictor_cutoff,
        },
        "cameraEvidenceScope": {
            "measurementDefinition": measurement,
            "supportedOutcomeContexts": [str(item).strip() for item in supported_contexts if str(item).strip()],
            "generalInjuryClaimAllowed": False,
            "equivalentTo3DKinematics": False,
        },
    }


def load_and_validate_protocol(
    path: Path,
    *,
    expected_horizon_days: int | None = None,
    expected_population: str | None = None,
    expected_index_time_definition: str | None = None,
) -> dict[str, Any]:
    protocol = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(protocol, dict):
        raise ValueError("Scientific protocol JSON must contain one top-level object.")
    report = validate_protocol(
        protocol,
        expected_horizon_days=expected_horizon_days,
        expected_population=expected_population,
        expected_index_time_definition=expected_index_time_definition,
    )
    report["protocolSha256"] = _sha256(path)
    report["protocolPath"] = str(path)
    return report
