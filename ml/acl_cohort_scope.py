"""Pre-fit cohort scoping for ACL prediction research.

First-time and secondary ACL injuries are intentionally modeled as different
prediction problems. The splitter runs before model fitting so a strong prior-ACL
coefficient cannot dominate one pooled equation and hide different mechanisms.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Literal

import pandas as pd

AclCohortScope = Literal["first-time", "secondary"]


def scope_acl_cohort(df: pd.DataFrame, scope: AclCohortScope) -> tuple[pd.DataFrame, dict[str, object]]:
    required = {
        "participant_id",
        "prior_acl_rupture",
        "prior_acl_reconstruction",
        "acl_tear_within_horizon",
        "index_time",
        "acl_event_time",
    }
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError("Missing ACL cohort-scope columns: " + ", ".join(missing))

    prior_rupture = pd.to_numeric(df["prior_acl_rupture"], errors="coerce")
    prior_reconstruction = pd.to_numeric(df["prior_acl_reconstruction"], errors="coerce")
    if prior_rupture.isna().any() or prior_reconstruction.isna().any():
        raise ValueError("Prior ACL history fields cannot be missing for cohort scoping.")
    if not set(prior_rupture.astype(int).unique()).issubset({0, 1}):
        raise ValueError("prior_acl_rupture must be binary.")
    if not set(prior_reconstruction.astype(int).unique()).issubset({0, 1}):
        raise ValueError("prior_acl_reconstruction must be binary.")

    has_prior_acl = (prior_rupture.astype(int) == 1) | (prior_reconstruction.astype(int) == 1)
    mask = ~has_prior_acl if scope == "first-time" else has_prior_acl
    scoped = df.loc[mask].copy().reset_index(drop=True)
    if scoped.empty:
        raise ValueError(f"ACL cohort scope {scope!r} contains no rows.")

    labels = pd.to_numeric(scoped["acl_tear_within_horizon"], errors="coerce")
    if labels.isna().any() or set(labels.astype(int).unique()) != {0, 1}:
        raise ValueError(f"ACL cohort scope {scope!r} must contain both outcome classes.")

    scoped_prior = (
        pd.to_numeric(scoped["prior_acl_rupture"], errors="raise").astype(int).eq(1)
        | pd.to_numeric(scoped["prior_acl_reconstruction"], errors="raise").astype(int).eq(1)
    )
    if scope == "first-time" and scoped_prior.any():
        raise AssertionError("First-time ACL cohort contains participants with prior ACL history.")
    if scope == "secondary" and not scoped_prior.all():
        raise AssertionError("Secondary ACL cohort contains participants without prior ACL history.")

    participant_outcome = scoped.assign(_label=labels.astype(int)).groupby("participant_id")["_label"].max()
    report = {
        "scope": scope,
        "definition": (
            "No ACL rupture/reconstruction before prediction index"
            if scope == "first-time"
            else "Documented ACL rupture or reconstruction before prediction index"
        ),
        "nRows": int(len(scoped)),
        "nParticipants": int(scoped["participant_id"].nunique()),
        "nParticipantsWithFutureAclEvent": int(participant_outcome.sum()),
        "nParticipantsWithoutFutureAclEvent": int((participant_outcome == 0).sum()),
        "priorAclHistoryConstantWithinScope": True,
        "pooledPrimaryAndSecondaryEquationAllowed": False,
        "reason": (
            "Primary and secondary ACL injury are separate prediction questions. "
            "Biomechanical associations observed before a first ACL tear do not automatically transport after ACL reconstruction."
        ),
    }
    return scoped, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Split an ACL cohort into first-time or secondary research scopes")
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--scope", choices=["first-time", "secondary"], required=True)
    args = parser.parse_args()

    frame = pd.read_csv(args.input_csv)
    scoped, report = scope_acl_cohort(frame, args.scope)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    scoped.to_csv(args.output_csv, index=False)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
