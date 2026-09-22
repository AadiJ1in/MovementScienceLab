export type AclRiskInput = {
  priorAclRupture: 0 | 1 | null;
  dynamicKneeValgusDeg: number | null;
  ipsilateralTrunkFlexionDeg: number | null;
  cmjPeakTakeoffForceBw: number | null;
  hipAdductorAbductorRatio: number | null;
  kneeFlexionAtInitialContactDeg?: number | null;
  hipAdductionDeg?: number | null;
  trainingExposureHours?: number | null;
};

export type AclRiskEquationResult = {
  schemaVersion: "1.0.0";
  outputKind: "literature-seeded-relative-acl-signal";
  relativeLogOddsSignal: number;
  relativeOddsMultiplier: number;
  observedCoreFeatures: number;
  totalCoreFeatures: 5;
  coreFeatureCoverage: number;
  missingCoreFeatures: string[];
  formula: string;
  interpretation: string;
  clinicalProbabilityAllowed: false;
};

/**
 * Literature-seeded coefficients from the prospective Collings et al. cohort.
 *
 * These values translate reported odds ratios to the log-odds scale. They are
 * NOT fitted Movement Science Lab coefficients and they do not form a validated
 * clinical probability model. They are retained as transparent priors/reference
 * values until a prospectively labelled ACL cohort can estimate and calibrate
 * the coefficients directly.
 */
export const ACL_LITERATURE_REFERENCE = {
  source: "Collings et al., Med Sci Sports Exerc. 2022;54(8):1242-1251",
  doi: "10.1249/MSS.0000000000002908",
  population: "elite junior/senior female Australian Rules Football and soccer players",
  priorAclLogOdds: Math.log(9.68),
  dynamicKneeValgusLogOddsPer7_2Deg: Math.log(1.96),
  ipsilateralTrunkFlexionLogOddsPer2_4Deg: Math.log(1.6),
  cmjPeakTakeoffForceLogOddsPer0_13Bw: Math.log(1.77),
  hipRatioDeficitLogOddsPer0_14: Math.log(1.98),
  referenceValues: {
    dynamicKneeValgusDeg: 0,
    ipsilateralTrunkFlexionDeg: 8,
    cmjPeakTakeoffForceBw: 1.19,
    hipAdductorAbductorRatio: 0.97,
  },
} as const;

const CORE_FEATURE_NAMES = {
  priorAclRupture: "Prior ACL rupture/reconstruction history",
  dynamicKneeValgusDeg: "Dynamic knee valgus / frontal-plane knee projection",
  ipsilateralTrunkFlexionDeg: "Ipsilateral trunk flexion",
  cmjPeakTakeoffForceBw: "Countermovement-jump peak take-off force",
  hipAdductorAbductorRatio: "Hip adductor:abductor strength ratio",
} as const;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Computes a relative ACL signal around the reference values reported in the
 * prospective Collings cohort. This is deliberately NOT converted to absolute
 * probability because the intercept/baseline hazard and transport calibration
 * must be re-estimated in the intended population.
 */
export function computeLiteratureSeededAclSignal(
  input: AclRiskInput,
): AclRiskEquationResult {
  const ref = ACL_LITERATURE_REFERENCE.referenceValues;
  const missingCoreFeatures: string[] = [];
  let eta = 0;
  let observed = 0;

  if (input.priorAclRupture === 0 || input.priorAclRupture === 1) {
    eta += ACL_LITERATURE_REFERENCE.priorAclLogOdds * input.priorAclRupture;
    observed += 1;
  } else {
    missingCoreFeatures.push(CORE_FEATURE_NAMES.priorAclRupture);
  }

  if (finite(input.dynamicKneeValgusDeg)) {
    eta +=
      ACL_LITERATURE_REFERENCE.dynamicKneeValgusLogOddsPer7_2Deg *
      ((input.dynamicKneeValgusDeg - ref.dynamicKneeValgusDeg) / 7.2);
    observed += 1;
  } else {
    missingCoreFeatures.push(CORE_FEATURE_NAMES.dynamicKneeValgusDeg);
  }

  if (finite(input.ipsilateralTrunkFlexionDeg)) {
    eta +=
      ACL_LITERATURE_REFERENCE.ipsilateralTrunkFlexionLogOddsPer2_4Deg *
      ((input.ipsilateralTrunkFlexionDeg - ref.ipsilateralTrunkFlexionDeg) / 2.4);
    observed += 1;
  } else {
    missingCoreFeatures.push(CORE_FEATURE_NAMES.ipsilateralTrunkFlexionDeg);
  }

  if (finite(input.cmjPeakTakeoffForceBw)) {
    eta +=
      ACL_LITERATURE_REFERENCE.cmjPeakTakeoffForceLogOddsPer0_13Bw *
      ((input.cmjPeakTakeoffForceBw - ref.cmjPeakTakeoffForceBw) / 0.13);
    observed += 1;
  } else {
    missingCoreFeatures.push(CORE_FEATURE_NAMES.cmjPeakTakeoffForceBw);
  }

  if (finite(input.hipAdductorAbductorRatio)) {
    eta +=
      ACL_LITERATURE_REFERENCE.hipRatioDeficitLogOddsPer0_14 *
      ((ref.hipAdductorAbductorRatio - input.hipAdductorAbductorRatio) / 0.14);
    observed += 1;
  } else {
    missingCoreFeatures.push(CORE_FEATURE_NAMES.hipAdductorAbductorRatio);
  }

  const clampedEta = Math.max(-20, Math.min(20, eta));

  return {
    schemaVersion: "1.0.0",
    outputKind: "literature-seeded-relative-acl-signal",
    relativeLogOddsSignal: eta,
    relativeOddsMultiplier: Math.exp(clampedEta),
    observedCoreFeatures: observed,
    totalCoreFeatures: 5,
    coreFeatureCoverage: observed / 5,
    missingCoreFeatures,
    formula:
      "eta = ln(9.68)*priorACL + ln(1.96)*(DKV/7.2) + ln(1.60)*((trunk-8)/2.4) + ln(1.77)*((CMJforce-1.19)/0.13) + ln(1.98)*((0.97-ADD:ABD)/0.14)",
    interpretation:
      "Relative research signal anchored to one prospective female-football cohort. It is not an absolute ACL-tear probability and must be re-estimated and calibrated in a prospectively labelled target population.",
    clinicalProbabilityAllowed: false,
  };
}

/**
 * Target mathematical form for the prospectively fitted model.
 *
 * P(ACL tear within horizon) = 1 - exp(-E * exp(eta))
 * eta = beta0 + sum(beta_j * z_j)
 *
 * E is the athlete's sport exposure over the risk window. The beta values and
 * baseline scale must be learned/calibrated from prospective ACL outcomes.
 */
export function exposureAdjustedAclHazard(
  linearPredictor: number,
  exposureHours: number,
): number {
  if (!Number.isFinite(linearPredictor)) {
    throw new Error("ACL linear predictor must be finite.");
  }
  if (!Number.isFinite(exposureHours) || exposureHours < 0) {
    throw new Error("ACL exposure hours must be finite and non-negative.");
  }
  if (exposureHours === 0) return 0;
  const cumulativeHazard = exposureHours * Math.exp(Math.max(-30, Math.min(30, linearPredictor)));
  return 1 - Math.exp(-cumulativeHazard);
}
