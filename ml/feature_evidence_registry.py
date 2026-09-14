from __future__ import annotations

from typing import Any

from prospective_injury_benchmark import FEATURE_DOMAINS

# Machine-readable evidence metadata for every feature currently recognized by
# the prospective research benchmark. This registry describes why a feature is
# eligible to be studied; it does NOT say the feature is clinically validated.
# Every predictor still requires outcome-specific prospective validation.
DOMAIN_EVIDENCE: dict[str, dict[str, Any]] = {
    "history": {
        "evidenceRole": "candidate-predictor-domain",
        "summary": "Previous injury history is repeatedly reported as a candidate predictor in sports-injury risk literature.",
        "citations": [
            {"pmid": "42200910", "year": 2026},
            {"pmid": "42478081", "year": 2026},
        ],
        "requiresOutcomeSpecificValidation": True,
    },
    "symptoms_readiness": {
        "evidenceRole": "candidate-predictor-domain",
        "summary": "Wellness, readiness, physiological, and psychological indicators are commonly evaluated in multimodal injury-risk models.",
        "citations": [
            {"pmid": "42200910", "year": 2026},
            {"pmid": "42478081", "year": 2026},
        ],
        "requiresOutcomeSpecificValidation": True,
    },
    "training_exposure": {
        "evidenceRole": "candidate-predictor-domain",
        "summary": "Training exposure and workload are recurrent candidate predictor domains in team-sport injury-risk research.",
        "citations": [
            {"pmid": "42200910", "year": 2026},
            {"pmid": "42478081", "year": 2026},
        ],
        "requiresOutcomeSpecificValidation": True,
    },
    "strength_balance": {
        "evidenceRole": "candidate-predictor-domain",
        "summary": "Neuromuscular/strength variables are studied as candidate predictors; specific balance findings are population and outcome dependent.",
        "citations": [
            {"pmid": "42478081", "year": 2026},
            {"pmid": "32504961", "year": 2020},
        ],
        "requiresOutcomeSpecificValidation": True,
    },
    "camera_biomechanics": {
        "evidenceRole": "outcome-specific-candidate-measurement-domain",
        "summary": (
            "2D frontal-plane single-leg measures have prospective association evidence in limited patellofemoral-pain cohorts, "
            "but 2D measures are not interchangeable with 3D knee kinematics and must be validated for the exact camera protocol."
        ),
        "citations": [
            {"pmid": "32504961", "year": 2020},
            {"pmid": "36525739", "year": 2023},
            {"pmid": "29895235", "year": 2018},
            {"pmid": "34996031", "year": 2022},
            {"pmid": "36198251", "year": 2022},
        ],
        "requiresOutcomeSpecificValidation": True,
        "requiresMeasurementValidation": True,
        "generalInjuryClaimAllowed": False,
        "equivalentTo3DKinematics": False,
    },
    "longitudinal_change": {
        "evidenceRole": "derived-candidate-predictor-domain",
        "summary": (
            "Longitudinal change features are pre-index derived candidates whose value must be demonstrated prospectively; "
            "the registry does not assume change is inherently beneficial or harmful."
        ),
        "citations": [
            {"pmid": "42200910", "year": 2026},
        ],
        "requiresOutcomeSpecificValidation": True,
    },
}

# Measurement-quality variables may be retained in the source cohort and used
# to reject/stratify poor captures. They are deliberately excluded from the
# strict injury-prediction feature matrix because they can encode camera,
# lighting, clothing, device, body-visibility, or implementation artifacts.
MEASUREMENT_QUALITY_ONLY = {
    "mean_pose_confidence": {
        "domain": "camera_biomechanics",
        "evidenceRole": "measurement-quality-only",
        "allowedAsInjuryPredictor": False,
        "reason": (
            "Pose confidence measures observation quality, not a biological injury-risk construct. "
            "Using it as a predictor could create device/setup or visibility shortcuts."
        ),
    }
}


def feature_registry() -> dict[str, dict[str, Any]]:
    registry: dict[str, dict[str, Any]] = {}
    for domain, features in FEATURE_DOMAINS.items():
        if domain not in DOMAIN_EVIDENCE:
            raise RuntimeError(f"Missing evidence metadata for feature domain: {domain}")
        for feature in features:
            metadata = {
                "domain": domain,
                **DOMAIN_EVIDENCE[domain],
                "allowedAsInjuryPredictor": True,
                "causalClaimAllowed": False,
                "clinicallyValidatedByRegistry": False,
            }
            if feature in MEASUREMENT_QUALITY_ONLY:
                metadata.update(MEASUREMENT_QUALITY_ONLY[feature])
            registry[feature] = metadata
    return registry


def validate_registry_completeness() -> dict[str, Any]:
    expected = {
        feature
        for features in FEATURE_DOMAINS.values()
        for feature in features
    }
    registry = feature_registry()
    registered = set(registry)
    missing = sorted(expected - registered)
    extra = sorted(registered - expected)
    missing_domain_metadata = sorted(set(FEATURE_DOMAINS) - set(DOMAIN_EVIDENCE))
    return {
        "passed": not missing and not extra and not missing_domain_metadata,
        "missingFeatures": missing,
        "extraFeatures": extra,
        "missingDomainMetadata": missing_domain_metadata,
        "nRegisteredFeatures": len(registry),
    }


def prohibited_predictor_columns(columns: list[str] | tuple[str, ...] | set[str]) -> list[str]:
    present = set(columns)
    return sorted(feature for feature in MEASUREMENT_QUALITY_ONLY if feature in present)


def evidence_snapshot(features: list[str]) -> dict[str, Any]:
    registry = feature_registry()
    unknown = sorted(set(features) - set(registry))
    if unknown:
        raise ValueError("Features missing from evidence registry: " + ", ".join(unknown))
    return {
        feature: registry[feature]
        for feature in features
    }
