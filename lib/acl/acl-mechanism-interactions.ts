export type AclMechanismInteractionInput = {
  dynamicKneeValgusDeg: number | null;
  kneeFlexionAtInitialContactDeg: number | null;
  ipsilateralTrunkFlexionDeg: number | null;
  acuteFatigueScore: number | null;
};

export type AclMechanismInteractions = {
  valgusLowFlexion: number | null;
  valgusTrunk: number | null;
  fatigueValgus: number | null;
};

function finite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Pre-specified candidate interactions for future prospective fitting.
 *
 * They encode mechanistic hypotheses only. Their coefficients must be learned
 * within participant-grouped training folds and externally validated; the
 * function itself does not assign injury risk.
 */
export function computeAclMechanismInteractions(
  input: AclMechanismInteractionInput,
): AclMechanismInteractions {
  const valgus = input.dynamicKneeValgusDeg;
  const flexion = input.kneeFlexionAtInitialContactDeg;
  const trunk = input.ipsilateralTrunkFlexionDeg;
  const fatigue = input.acuteFatigueScore;

  return {
    valgusLowFlexion:
      finite(valgus) && finite(flexion)
        ? valgus * Math.max(0, 30 - flexion) / 30
        : null,
    valgusTrunk:
      finite(valgus) && finite(trunk) ? valgus * Math.abs(trunk) / 10 : null,
    fatigueValgus:
      finite(valgus) && finite(fatigue) ? valgus * fatigue / 10 : null,
  };
}

export const ACL_INTERACTION_POLICY = {
  role: "candidate-predictor-engineering",
  causalLaw: false,
  clinicallyValidated: false,
  preSpecifyBeforeFitting: true,
  selectInsideTrainingFoldsOnly: true,
  description:
    "Interactions represent hypotheses about multiplanar landing mechanics and fatigue. They are not universal biomechanical laws and should be retained only if prospectively supported.",
} as const;
