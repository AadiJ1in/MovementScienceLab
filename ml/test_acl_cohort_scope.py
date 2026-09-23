from __future__ import annotations

import unittest

import pandas as pd

from acl_cohort_scope import scope_acl_cohort


class AclCohortScopeTests(unittest.TestCase):
    def _frame(self) -> pd.DataFrame:
        rows = []
        for index in range(24):
            prior = 1 if index >= 12 else 0
            outcome = index % 3 == 0
            rows.append(
                {
                    "participant_id": f"p-{index}",
                    "prior_acl_rupture": prior,
                    "prior_acl_reconstruction": prior,
                    "acl_tear_within_horizon": int(outcome),
                    "index_time": "2026-01-01T00:00:00+00:00",
                    "acl_event_time": "2026-01-10T00:00:00+00:00" if outcome else "",
                }
            )
        return pd.DataFrame(rows)

    def test_first_time_scope_excludes_all_prior_acl_history(self) -> None:
        scoped, report = scope_acl_cohort(self._frame(), "first-time")
        self.assertTrue((scoped["prior_acl_rupture"] == 0).all())
        self.assertTrue((scoped["prior_acl_reconstruction"] == 0).all())
        self.assertEqual(report["scope"], "first-time")
        self.assertFalse(report["pooledPrimaryAndSecondaryEquationAllowed"])

    def test_secondary_scope_requires_prior_acl_history(self) -> None:
        scoped, report = scope_acl_cohort(self._frame(), "secondary")
        self.assertTrue((scoped["prior_acl_rupture"] == 1).all())
        self.assertEqual(report["scope"], "secondary")
        self.assertGreater(report["nParticipantsWithFutureAclEvent"], 0)

    def test_scope_must_keep_both_outcome_classes(self) -> None:
        frame = self._frame()
        frame.loc[frame["prior_acl_rupture"] == 1, "acl_tear_within_horizon"] = 0
        with self.assertRaises(ValueError):
            scope_acl_cohort(frame, "secondary")


if __name__ == "__main__":
    unittest.main()
