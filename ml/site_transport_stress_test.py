from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from prospective_cohort_audit import audit_csv
from prospective_injury_benchmark import (
    GROUP,
    TARGET,
    _inner_model_selection,
    available_features,
    candidate_models,
    cluster_bootstrap_intervals,
    metrics,
    subgroup_audit,
    validate_dataset,
)

SITE = "site_id"
MIN_HELD_OUT_PARTICIPANTS = 10
MIN_TRAINING_SITES = 2


def validate_site_transport_design(df: pd.DataFrame) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    if SITE not in df.columns:
        errors.append("site_id is required for leave-one-site-out transport stress testing.")
        return {"passed": False, "errors": errors, "warnings": warnings, "sites": {}}

    sites = df[SITE].astype("string")
    if sites.isna().any() or (sites.str.len() == 0).any():
        errors.append("site_id cannot be missing or empty.")

    unique_sites = sorted(sites.dropna().unique().tolist())
    if len(unique_sites) < 3:
        errors.append("At least 3 distinct sites are required so every held-out site leaves at least 2 training sites.")

    site_report: dict[str, Any] = {}
    participant_site_counts = (
        pd.DataFrame({GROUP: df[GROUP].astype(str), SITE: sites})
        .drop_duplicates()
        .groupby(GROUP)[SITE]
        .nunique()
    )
    cross_site_participants = participant_site_counts[participant_site_counts > 1]
    if len(cross_site_participants):
        errors.append(
            f"{len(cross_site_participants)} participants appear in more than one site; site holdout would leak participants across train/test."
        )

    for site in unique_sites:
        mask = (sites == site).to_numpy()
        site_y = df.loc[mask, TARGET].astype(int)
        participants = df.loc[mask, GROUP].astype(str)
        participant_outcomes = df.loc[mask].groupby(GROUP)[TARGET].max().astype(int)
        n_participants = int(participants.nunique())
        positives = int(participant_outcomes.sum())
        negatives = int((participant_outcomes == 0).sum())
        status = "eligible"
        reasons: list[str] = []
        if n_participants < MIN_HELD_OUT_PARTICIPANTS:
            status = "insufficient-sample"
            reasons.append(
                f"Held-out site has {n_participants} participants; minimum is {MIN_HELD_OUT_PARTICIPANTS}."
            )
        if site_y.nunique() < 2:
            status = "insufficient-outcome-variation"
            reasons.append("Held-out site has only one row-level outcome class, so AUROC/AUPRC cannot be estimated.")
        if positives < 2 or negatives < 2:
            status = "insufficient-event-count"
            reasons.append("Held-out site has fewer than 2 participants with or without the outcome.")
        site_report[str(site)] = {
            "nRows": int(mask.sum()),
            "nParticipants": n_participants,
            "nParticipantsWithOutcome": positives,
            "nParticipantsWithoutOutcome": negatives,
            "status": status,
            "reasons": reasons,
        }

    eligible_count = sum(1 for item in site_report.values() if item["status"] == "eligible")
    if not errors and eligible_count == 0:
        errors.append("No site has enough participants/outcome variation for a reportable transport stress test.")
    elif eligible_count < len(site_report):
        warnings.append(
            f"Only {eligible_count} of {len(site_report)} sites meet the reportability requirements; insufficient sites will be reported, not silently dropped."
        )

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "sites": site_report,
    }


def leave_one_site_out_stress_test(
    df: pd.DataFrame,
    *,
    bootstrap_samples: int,
) -> dict[str, Any]:
    if bootstrap_samples < 100:
        raise ValueError("bootstrap_samples must be at least 100")
    features, domains = validate_dataset(df)
    design = validate_site_transport_design(df)
    if not design["passed"]:
        raise ValueError("Site transport design failed: " + "; ".join(design["errors"]))

    sites = df[SITE].astype(str)
    results: dict[str, Any] = {}
    eligible_metrics: list[dict[str, float]] = []

    for held_out_site in sorted(sites.unique().tolist()):
        held_mask = (sites == held_out_site).to_numpy()
        train_mask = ~held_mask
        held_design = design["sites"][held_out_site]
        training_sites = sorted(sites[train_mask].unique().tolist())

        if len(training_sites) < MIN_TRAINING_SITES:
            results[held_out_site] = {
                "status": "not-reportable",
                "reason": "Fewer than two development sites remain after site holdout.",
                "design": held_design,
            }
            continue

        if held_design["status"] != "eligible":
            results[held_out_site] = {
                "status": "not-reportable",
                "reason": "; ".join(held_design["reasons"]),
                "design": held_design,
            }
            continue

        X_train = df.loc[train_mask, features].reset_index(drop=True)
        y_train = df.loc[train_mask, TARGET].astype(int).to_numpy()
        groups_train = df.loc[train_mask, GROUP].astype(str).to_numpy()
        X_test = df.loc[held_mask, features].reset_index(drop=True)
        y_test = df.loc[held_mask, TARGET].astype(int).to_numpy()
        groups_test = df.loc[held_mask, GROUP].astype(str).to_numpy()

        if len(np.unique(y_train)) < 2:
            results[held_out_site] = {
                "status": "not-reportable",
                "reason": "Remaining development sites do not contain both outcome classes.",
                "design": held_design,
            }
            continue

        selection = _inner_model_selection(
            X_train,
            y_train,
            groups_train,
            features,
        )
        selected_name = str(selection["name"])
        model = candidate_models(features)[selected_name]
        model.fit(X_train, y_train)
        raw_probabilities = model.predict_proba(X_test)[:, 1]
        calibrated = selection["calibrator"].predict_proba(
            np.log(np.clip(raw_probabilities, 1e-6, 1 - 1e-6) / np.clip(1 - raw_probabilities, 1e-6, 1 - 1e-6)).reshape(-1, 1)
        )[:, 1]
        threshold = float(selection["threshold"])
        predictions = (calibrated >= threshold).astype(int)
        site_metrics = metrics(
            y_test,
            calibrated,
            threshold=threshold,
            predictions=predictions,
        )
        intervals = cluster_bootstrap_intervals(
            y_test,
            calibrated,
            predictions,
            groups_test,
            samples=bootstrap_samples,
        )
        site_subgroups = subgroup_audit(
            df.loc[held_mask].reset_index(drop=True),
            y_test,
            calibrated,
            predictions,
            groups_test,
        )

        results[held_out_site] = {
            "status": "reported",
            "developmentSites": training_sites,
            "heldOutSite": held_out_site,
            "nDevelopmentParticipants": int(len(np.unique(groups_train))),
            "nHeldOutParticipants": int(len(np.unique(groups_test))),
            "selectedModel": selected_name,
            "thresholdSelectedWithoutHeldOutSite": threshold,
            "metrics": site_metrics,
            "confidenceIntervals": intervals,
            "subgroupAuditWithinHeldOutSite": site_subgroups,
            "modelSelectionMetricsFromDevelopmentSitesOnly": selection["candidates"],
        }
        eligible_metrics.append(
            {
                "auroc": float(site_metrics["auroc"]),
                "auprc": float(site_metrics["auprc"]),
                "brierSkill": float(site_metrics["brierSkill"] or 0.0),
                "sensitivity": float(site_metrics["sensitivity"]),
                "specificity": float(site_metrics["specificity"]),
            }
        )

    summary: dict[str, Any] = {
        "reportedSites": int(len(eligible_metrics)),
        "totalSites": int(len(results)),
    }
    if eligible_metrics:
        for metric in ("auroc", "auprc", "brierSkill", "sensitivity", "specificity"):
            values = [row[metric] for row in eligible_metrics]
            summary[metric] = {
                "minimumAcrossSites": float(min(values)),
                "medianAcrossSites": float(np.median(values)),
                "maximumAcrossSites": float(max(values)),
            }

    return {
        "schemaVersion": "1.0.0",
        "reportType": "leave-one-site-out-internal-transport-stress-test",
        "validationClaim": "internal-site-transport-stress-only",
        "externalValidation": False,
        "featureDomains": domains,
        "features": features,
        "designAudit": design,
        "siteResults": results,
        "summary": summary,
        "interpretation": (
            "Each reportable site is predicted by a model whose model family, calibration, and threshold were selected without that site. "
            "Because all sites come from the same development cohort/data-generating program, this is a transportability stress test, not independent external validation."
        ),
        "productGate": {
            "eligibleForUserFacingInjuryProbability": False,
        },
    }


def run_site_transport_stress(
    input_csv: Path,
    output_json: Path,
    *,
    horizon_days: int,
    allow_overlapping_windows: bool,
    bootstrap_samples: int,
) -> dict[str, Any]:
    audit = audit_csv(
        input_csv,
        horizon_days=horizon_days,
        allow_overlapping_windows=allow_overlapping_windows,
    )
    if not audit["passed"]:
        raise ValueError("Prospective cohort audit failed: " + "; ".join(audit["errors"]))
    df = pd.read_csv(input_csv)
    report = leave_one_site_out_stress_test(df, bootstrap_samples=bootstrap_samples)
    report["cohortAudit"] = audit
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Leave one site out at a time to stress-test transportability without calling it external validation."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--allow-overlapping-windows", action="store_true")
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()
    run_site_transport_stress(
        args.input_csv,
        args.output_json,
        horizon_days=args.horizon_days,
        allow_overlapping_windows=args.allow_overlapping_windows,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
