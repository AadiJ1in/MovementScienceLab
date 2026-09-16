from __future__ import annotations

import json

from data_source_matrix import (
    data_source_matrix_sha256,
    load_research_source_intake,
    movement_quality_feature_names,
    prospective_feature_domains,
    research_source_intake_sha256,
)
from prospective_injury_benchmark import FEATURE_DOMAINS


def build_feature_contract_report() -> dict[str, object]:
    matrix_domains = prospective_feature_domains()
    benchmark_domains = FEATURE_DOMAINS
    movement_features = movement_quality_feature_names()
    intake = load_research_source_intake()
    return {
        "dataSourceMatrixSha256": data_source_matrix_sha256(),
        "researchSourceIntakeMatrixSha256": research_source_intake_sha256(),
        "verifiedIntakeSourceIds": [source["id"] for source in intake["sources"]],
        "prospectiveBenchmark": {
            "aligned": matrix_domains == benchmark_domains,
            "domains": {
                domain: list(features)
                for domain, features in matrix_domains.items()
            },
            "nDomains": len(matrix_domains),
            "nFeatures": sum(len(features) for features in matrix_domains.values()),
        },
        "movementQuality": {
            "features": list(movement_features),
            "nFeatures": len(movement_features),
        },
    }


def main() -> None:
    report = build_feature_contract_report()
    if not report["prospectiveBenchmark"]["aligned"]:
        raise SystemExit("Prospective benchmark feature contract has drifted from the canonical matrix.")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
