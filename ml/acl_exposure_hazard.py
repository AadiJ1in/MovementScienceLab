from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler

RANDOM_SEED = 20260922


@dataclass
class AclHazardFit:
    features: list[str]
    intercept: float
    coefficients: np.ndarray
    medians: np.ndarray
    means: np.ndarray
    scales: np.ndarray
    l2_penalty: float
    converged: bool
    optimization_message: str


class ExposureAdjustedAclHazardModel:
    """Complementary-log-log style ACL event model with observed exposure offset.

    P(event in horizon | E, x) = 1 - exp(-E * exp(beta0 + beta'x))

    The model is intended for prospective ACL research where sport exposure is
    observed. The intercept absorbs the baseline hazard per exposure hour. The
    fitted probabilities are not clinically deployable without external
    validation and calibration assessment.
    """

    def __init__(self, features: list[str], *, l2_penalty: float = 1.0):
        if not features:
            raise ValueError("ACL hazard model requires at least one feature.")
        if l2_penalty < 0:
            raise ValueError("l2_penalty must be non-negative.")
        self.features = list(features)
        self.l2_penalty = float(l2_penalty)
        self.fit_: AclHazardFit | None = None

    @staticmethod
    def _event_probability(linear_predictor: np.ndarray, exposure_hours: np.ndarray) -> np.ndarray:
        if np.any(exposure_hours < 0):
            raise ValueError("Exposure hours must be non-negative.")
        bounded_eta = np.clip(linear_predictor, -30.0, 20.0)
        cumulative_hazard = exposure_hours * np.exp(bounded_eta)
        return -np.expm1(-np.clip(cumulative_hazard, 0.0, 50.0))

    def fit(self, X: pd.DataFrame, y: np.ndarray, exposure_hours: np.ndarray):
        y = np.asarray(y, dtype=float)
        exposure_hours = np.asarray(exposure_hours, dtype=float)
        if len(X) != len(y) or len(y) != len(exposure_hours):
            raise ValueError("X, y, and exposure_hours must have the same length.")
        if not set(np.unique(y)).issubset({0.0, 1.0}) or len(np.unique(y)) < 2:
            raise ValueError("ACL hazard model requires both binary outcome classes.")
        if np.any(~np.isfinite(exposure_hours)) or np.any(exposure_hours < 0):
            raise ValueError("Exposure hours must be finite and non-negative.")
        if np.any((y == 1) & (exposure_hours <= 0)):
            raise ValueError("Positive ACL events cannot have zero exposure in the modeled window.")

        imputer = SimpleImputer(strategy="median")
        scaler = StandardScaler()
        matrix = imputer.fit_transform(X[self.features])
        standardized = scaler.fit_transform(matrix)

        # The intercept is log baseline hazard per exposure hour. Initialize it
        # from overall incidence divided by total exposure, then optimize jointly.
        baseline_rate = max(float(y.sum()) / max(float(exposure_hours.sum()), 1e-8), 1e-8)
        initial = np.zeros(standardized.shape[1] + 1, dtype=float)
        initial[0] = np.log(baseline_rate)

        def objective(params: np.ndarray) -> float:
            eta = params[0] + standardized @ params[1:]
            probabilities = self._event_probability(eta, exposure_hours)
            probabilities = np.clip(probabilities, 1e-9, 1 - 1e-9)
            nll = -float(
                np.sum(y * np.log(probabilities) + (1 - y) * np.log1p(-probabilities))
            )
            penalty = 0.5 * self.l2_penalty * float(np.dot(params[1:], params[1:]))
            return nll + penalty

        result = minimize(
            objective,
            initial,
            method="L-BFGS-B",
            options={"maxiter": 1000, "ftol": 1e-10},
        )
        if not np.isfinite(result.fun):
            raise RuntimeError("ACL exposure-hazard optimization produced a non-finite objective.")

        self.fit_ = AclHazardFit(
            features=self.features,
            intercept=float(result.x[0]),
            coefficients=np.asarray(result.x[1:], dtype=float),
            medians=np.asarray(imputer.statistics_, dtype=float),
            means=np.asarray(scaler.mean_, dtype=float),
            scales=np.asarray(scaler.scale_, dtype=float),
            l2_penalty=self.l2_penalty,
            converged=bool(result.success),
            optimization_message=str(result.message),
        )
        return self

    def predict_probability(self, X: pd.DataFrame, exposure_hours: np.ndarray) -> np.ndarray:
        if self.fit_ is None:
            raise RuntimeError("ACL hazard model must be fitted before prediction.")
        exposure_hours = np.asarray(exposure_hours, dtype=float)
        if len(X) != len(exposure_hours):
            raise ValueError("X and exposure_hours must have the same length.")
        raw = X[self.features].to_numpy(dtype=float, na_value=np.nan)
        imputed = np.where(np.isnan(raw), self.fit_.medians, raw)
        standardized = (imputed - self.fit_.means) / self.fit_.scales
        eta = self.fit_.intercept + standardized @ self.fit_.coefficients
        return self._event_probability(eta, exposure_hours)

    def artifact(self) -> dict[str, object]:
        if self.fit_ is None:
            raise RuntimeError("ACL hazard model must be fitted before artifact export.")
        return {
            "schemaVersion": "1.0.0",
            "modelType": "exposure-adjusted-acl-hazard",
            "formula": "P = 1 - exp(-E * exp(beta0 + sum(beta_j*z_j)))",
            "features": self.fit_.features,
            "interceptLogBaselineHazardPerExposureHour": self.fit_.intercept,
            "standardizedCoefficients": self.fit_.coefficients.tolist(),
            "preprocessing": {
                "medians": self.fit_.medians.tolist(),
                "means": self.fit_.means.tolist(),
                "scales": self.fit_.scales.tolist(),
            },
            "l2Penalty": self.fit_.l2_penalty,
            "converged": self.fit_.converged,
            "optimizationMessage": self.fit_.optimization_message,
            "researchOnly": True,
            "eligibleForUserFacingAclProbability": False,
        }


def _calibration_summary(y: np.ndarray, probabilities: np.ndarray) -> dict[str, float | None]:
    probabilities = np.clip(np.asarray(probabilities, dtype=float), 1e-6, 1 - 1e-6)
    logits = np.log(probabilities / (1 - probabilities))
    if np.std(logits) < 1e-9:
        return {"intercept": None, "slope": None}
    design = np.column_stack([np.ones(len(logits)), logits])
    try:
        coefficients, *_ = np.linalg.lstsq(design, y.astype(float), rcond=None)
        return {"intercept": float(coefficients[0]), "slope": float(coefficients[1])}
    except np.linalg.LinAlgError:
        return {"intercept": None, "slope": None}


def grouped_hazard_evaluation(
    df: pd.DataFrame,
    *,
    features: list[str],
    target: str,
    group: str,
    exposure_column: str,
    l2_penalty: float = 1.0,
) -> dict[str, object]:
    y = df[target].astype(int).to_numpy()
    groups = df[group].astype(str).to_numpy()
    exposure = pd.to_numeric(df[exposure_column], errors="coerce").to_numpy(dtype=float)
    if np.isnan(exposure).any():
        raise ValueError(f"{exposure_column} cannot be missing for hazard evaluation.")

    unique_groups = len(np.unique(groups))
    splits: list[tuple[np.ndarray, np.ndarray]] | None = None
    for n_splits in range(min(5, unique_groups), 2, -1):
        candidate = list(
            StratifiedGroupKFold(
                n_splits=n_splits,
                shuffle=True,
                random_state=RANDOM_SEED,
            ).split(df[features], y, groups)
        )
        if all(len(np.unique(y[train])) == 2 and len(np.unique(y[test])) == 2 for train, test in candidate):
            splits = candidate
            break
    if splits is None:
        raise ValueError("Could not create at least 3 grouped ACL hazard folds with both outcome classes.")

    out_of_fold = np.full(len(df), np.nan, dtype=float)
    fold_reports: list[dict[str, object]] = []
    for fold_index, (train_idx, test_idx) in enumerate(splits, start=1):
        model = ExposureAdjustedAclHazardModel(features, l2_penalty=l2_penalty)
        model.fit(
            df.iloc[train_idx],
            y[train_idx],
            exposure[train_idx],
        )
        predicted = model.predict_probability(df.iloc[test_idx], exposure[test_idx])
        out_of_fold[test_idx] = predicted
        fold_reports.append(
            {
                "fold": fold_index,
                "nTrainParticipants": int(len(np.unique(groups[train_idx]))),
                "nValidationParticipants": int(len(np.unique(groups[test_idx]))),
                "converged": bool(model.fit_.converged if model.fit_ else False),
                "auroc": float(roc_auc_score(y[test_idx], predicted)),
                "auprc": float(average_precision_score(y[test_idx], predicted)),
                "brier": float(brier_score_loss(y[test_idx], predicted)),
            }
        )

    if np.isnan(out_of_fold).any():
        raise RuntimeError("ACL hazard evaluation did not predict every row.")

    calibration = _calibration_summary(y, out_of_fold)
    final_model = ExposureAdjustedAclHazardModel(features, l2_penalty=l2_penalty)
    final_model.fit(df, y, exposure)
    prevalence = float(np.mean(y))
    auprc = float(average_precision_score(y, out_of_fold))
    return {
        "formula": "P = 1 - exp(-E * exp(beta0 + sum(beta_j*z_j)))",
        "exposureColumn": exposure_column,
        "splitUnit": "participant",
        "nFolds": len(splits),
        "outOfFoldMetrics": {
            "auroc": float(roc_auc_score(y, out_of_fold)),
            "auprc": auprc,
            "prevalence": prevalence,
            "auprcLiftOverPrevalence": None if prevalence == 0 else auprc / prevalence,
            "brier": float(brier_score_loss(y, out_of_fold)),
            "calibrationInterceptApprox": calibration["intercept"],
            "calibrationSlopeApprox": calibration["slope"],
        },
        "folds": fold_reports,
        "finalResearchModel": final_model.artifact(),
        "note": "Exposure-adjusted prospective research candidate. No clinical deployment claim is implied by fitting or internal validation.",
    }
