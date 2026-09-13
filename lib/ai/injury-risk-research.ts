export type InjuryAssociationTarget =
  | "patellofemoral-pain"
  | "acute-lower-extremity-injury"
  | "acl-injury";

export type EvidenceStrength = "moderate" | "limited" | "negative";

export type InjuryEvidence = {
  id: string;
  target: InjuryAssociationTarget;
  title: string;
  population: string;
  task: string;
  finding: string;
  strength: EvidenceStrength;
  sourceUrl: string;
  measurementTransfer: "conceptually-related" | "not-transferable";
};

export const INJURY_EVIDENCE: readonly InjuryEvidence[] = [
  {
    id: "raisanen-2018-fpkpa",
    target: "acute-lower-extremity-injury",
    title: "Frontal-plane knee control and lower-extremity injury",
    population: "Young basketball and floorball athletes",
    task: "Single-leg squat",
    finding:
      "Larger frontal-plane knee projection angle was associated with elevated acute lower-extremity and ankle injury risk, but screening discrimination was poor (reported AUC 0.59 for lower-extremity injury).",
    strength: "limited",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/29387448/",
    measurementTransfer: "conceptually-related",
  },
  {
    id: "military-pfp-2020",
    target: "patellofemoral-pain",
    title: "Single-leg squat FPKPA and future patellofemoral pain",
    population: "Male military recruits",
    task: "Single-leg squat",
    finding:
      "Greater baseline frontal-plane knee projection angle was associated with subsequent patellofemoral pain during prospective follow-up.",
    strength: "moderate",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/32504961/",
    measurementTransfer: "conceptually-related",
  },
  {
    id: "military-pfp-review-2024",
    target: "patellofemoral-pain",
    title: "Military patellofemoral pain risk-factor meta-analysis",
    population: "Military personnel",
    task: "Primarily single-leg functional testing",
    finding:
      "A larger frontal-plane knee projection angle during single-leg squat was identified as a risk factor for patellofemoral pain with moderate evidence.",
    strength: "moderate",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/39007801/",
    measurementTransfer: "conceptually-related",
  },
  {
    id: "acl-meta-2020",
    target: "acl-injury",
    title: "Prospective knee-abduction evidence for future ACL injury",
    population: "Prospective athlete cohorts",
    task: "Weight-bearing landing and movement tasks",
    finding:
      "A systematic review/meta-analysis did not find 2D peak knee abduction angle, 2D medial knee displacement, or several 3D knee-abduction measures to consistently predict future ACL injury.",
    strength: "negative",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/32819327/",
    measurementTransfer: "not-transferable",
  },
] as const;

export type KneeResearchFeatures = {
  leftKneeDeviationDeg: number | null;
  rightKneeDeviationDeg: number | null;
  peakKneeDeviationDeg: number | null;
  kneeAsymmetryDeg: number | null;
  trunkLeanDeg: number | null;
  pelvicObliquityDeg: number | null;
  meanPoseConfidence: number | null;
  sampleCount: number;
};

export type ResearchAssociation = {
  target: InjuryAssociationTarget;
  label: string;
  status: "research-signal-present" | "insufficient-data" | "not-supported-for-prediction";
  explanation: string;
  evidenceIds: string[];
};

export type InjuryRiskResearchResult = {
  features: KneeResearchFeatures;
  dataQuality: "high" | "moderate" | "low";
  associations: ResearchAssociation[];
  modelScope: "evidence-linked-research-screen";
  disclaimer: string;
};

function finite(values: readonly (number | null | undefined)[]) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function summarizeKneeResearchFeatures(input: {
  leftKneeDeviation: readonly number[];
  rightKneeDeviation: readonly number[];
  trunkLean: readonly number[];
  pelvicObliquity: readonly number[];
  poseConfidence: readonly number[];
}): KneeResearchFeatures {
  const left = finite(input.leftKneeDeviation);
  const right = finite(input.rightKneeDeviation);
  const trunk = finite(input.trunkLean);
  const pelvis = finite(input.pelvicObliquity);
  const confidence = finite(input.poseConfidence);

  const mean = (values: readonly number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const peakAbs = (values: readonly number[]) =>
    values.length ? Math.max(...values.map((value) => Math.abs(value))) : null;

  const leftPeak = peakAbs(left);
  const rightPeak = peakAbs(right);
  const both = finite([leftPeak, rightPeak]);

  return {
    leftKneeDeviationDeg: leftPeak,
    rightKneeDeviationDeg: rightPeak,
    peakKneeDeviationDeg: both.length ? Math.max(...both) : null,
    kneeAsymmetryDeg:
      leftPeak !== null && rightPeak !== null ? Math.abs(leftPeak - rightPeak) : null,
    trunkLeanDeg: peakAbs(trunk),
    pelvicObliquityDeg: peakAbs(pelvis),
    meanPoseConfidence: mean(confidence),
    sampleCount: Math.max(left.length, right.length),
  };
}

export function evaluateInjuryRiskResearch(features: KneeResearchFeatures): InjuryRiskResearchResult {
  const confidence = features.meanPoseConfidence ?? 0;
  const dataQuality: InjuryRiskResearchResult["dataQuality"] =
    features.sampleCount >= 30 && confidence >= 0.85
      ? "high"
      : features.sampleCount >= 15 && confidence >= 0.7
        ? "moderate"
        : "low";

  const hasKneeSignal = features.peakKneeDeviationDeg !== null && dataQuality !== "low";

  return {
    features,
    dataQuality,
    modelScope: "evidence-linked-research-screen",
    associations: [
      {
        target: "patellofemoral-pain",
        label: "Patellofemoral pain research association",
        status: hasKneeSignal ? "research-signal-present" : "insufficient-data",
        explanation: hasKneeSignal
          ? "This assessment measured a frontal-plane knee-deviation proxy. Prospective single-leg-squat studies have linked larger frontal-plane knee projection angles with later patellofemoral pain in specific military cohorts. The current webcam metric and bilateral squat protocol are not threshold-equivalent to those studies, so no injury probability is calculated."
          : "There is not enough high-confidence frontal-plane knee data to evaluate this research association.",
        evidenceIds: ["military-pfp-2020", "military-pfp-review-2024"],
      },
      {
        target: "acute-lower-extremity-injury",
        label: "Acute lower-extremity injury research association",
        status: hasKneeSignal ? "research-signal-present" : "insufficient-data",
        explanation: hasKneeSignal
          ? "Frontal-plane knee control has shown prospective association with acute lower-extremity injury in some athlete cohorts, but published screening discrimination was poor. This result is therefore contextual evidence, not a prediction that an injury will occur."
          : "There is not enough high-confidence frontal-plane knee data to evaluate this research association.",
        evidenceIds: ["raisanen-2018-fpkpa"],
      },
      {
        target: "acl-injury",
        label: "ACL injury prediction",
        status: "not-supported-for-prediction",
        explanation:
          "The current webcam squat screen does not produce a validated ACL injury probability. Prospective meta-analysis found that commonly used 2D/3D knee-abduction measures did not consistently predict future ACL injury.",
        evidenceIds: ["acl-meta-2020"],
      },
    ],
    disclaimer:
      "Research use only. This screen measures camera-derived movement features and links them to published prospective associations. It does not diagnose an injury, determine tissue damage, or establish that a future injury will occur.",
  };
}
