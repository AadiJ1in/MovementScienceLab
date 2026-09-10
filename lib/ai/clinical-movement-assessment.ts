import type { MovementQualityInference } from "./movement-quality-model";

export type EvidenceStrength = "none" | "contextual" | "limited" | "moderate";
export type ClinicalReviewPriority = "routine" | "review" | "high-priority";

export type InjuryAssociationEvidence = {
  evidenceId: string;
  label: string;
  strength: EvidenceStrength;
  compatibleWithWebcamMetric: boolean;
  note: string;
};

export type ClinicalMovementAssessment = {
  movementQuality: MovementQualityInference["label"];
  reviewPriority: ClinicalReviewPriority;
  evidenceStrength: EvidenceStrength;
  evidence: InjuryAssociationEvidence[];
  canDiagnoseCurrentInjury: false;
  canPredictFutureInjury: false;
  summary: string;
};

const EVIDENCE_BY_MOVEMENT: Record<string, InjuryAssociationEvidence[]> = {
  "squat-front": [
    {
      evidenceId: "raisanen-2018-fpkpa",
      label: "Prospective lower-extremity injury association during single-leg squat",
      strength: "limited",
      compatibleWithWebcamMetric: false,
      note: "The published FPKPA method uses anatomical landmarks that are not identical to BlazePose landmarks, so the published threshold must not be copied into the webcam metric.",
    },
    {
      evidenceId: "nilstad-2020-meta-acl",
      label: "Systematic review of knee abduction and future ACL injury",
      strength: "moderate",
      compatibleWithWebcamMetric: false,
      note: "The review did not support knee-abduction measures alone as a consistent future-ACL predictor; it is used as a certainty constraint, not a threshold.",
    },
  ],
  "squat-side": [
    {
      evidenceId: "avci-2026-squat-review",
      label: "Systematic review of squat-based injury-risk assessment",
      strength: "moderate",
      compatibleWithWebcamMetric: false,
      note: "Squat mechanics may contribute useful context, but squat assessment alone is insufficient for a black-and-white injury prediction.",
    },
  ],
  "general-front": [
    {
      evidenceId: "nilstad-2020-meta-acl",
      label: "Dynamic knee-abduction evidence constraint",
      strength: "moderate",
      compatibleWithWebcamMetric: false,
      note: "No universal injury threshold is applied to generic frontal-plane webcam motion.",
    },
  ],
  "general-side": [],
  "push-up-side": [],
};

const strengthRank: Record<EvidenceStrength, number> = {
  none: 0,
  contextual: 1,
  limited: 2,
  moderate: 3,
};

function strongestEvidence(evidence: InjuryAssociationEvidence[]): EvidenceStrength {
  if (!evidence.length) return "none";
  return evidence.reduce<EvidenceStrength>(
    (best, item) => (strengthRank[item.strength] > strengthRank[best] ? item.strength : best),
    "none",
  );
}

export function assessMovementForClinicalReview(
  movement: string,
  inference: MovementQualityInference,
  options?: { repeatedDeviationCount?: number; painOrAcuteSymptomsReported?: boolean },
): ClinicalMovementAssessment {
  const evidence = EVIDENCE_BY_MOVEMENT[movement] ?? [];
  const evidenceStrength = strongestEvidence(evidence);
  const repeatedDeviationCount = Math.max(0, options?.repeatedDeviationCount ?? 0);
  const symptoms = options?.painOrAcuteSymptomsReported === true;

  let reviewPriority: ClinicalReviewPriority = "routine";
  if (symptoms) {
    reviewPriority = "high-priority";
  } else if (
    inference.label === "uncertain" ||
    inference.outOfDomain ||
    (inference.label === "deviation-like" && repeatedDeviationCount >= 3)
  ) {
    reviewPriority = "review";
  }

  const summary = symptoms
    ? "Pain or acute symptoms were reported. The motion model cannot diagnose an injury; stop using automated interpretation for clearance and route the case to a qualified clinician."
    : inference.label === "uncertain"
      ? "The repetition is outside the model's confident operating domain. Re-capture under the validated protocol or request clinician review."
      : inference.label === "deviation-like"
        ? "The repetition resembles learned movement-deviation patterns. This can support technique review, but it does not establish that an injury is present or will occur."
        : "The repetition resembles reference movement in the model's current domain. This does not prove the person is injury-free or protected from future injury.";

  return {
    movementQuality: inference.label,
    reviewPriority,
    evidenceStrength,
    evidence,
    canDiagnoseCurrentInjury: false,
    canPredictFutureInjury: false,
    summary,
  };
}
