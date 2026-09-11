import type { AngleName } from "@/lib/biomechanics/angles";
import type { MovementType } from "@/lib/pose/types";

export type ExerciseStatus = "prototype" | "research" | "validated-internally" | "externally-validated";

export type MovementDefinition = {
  id: MovementType;
  title: string;
  viewLabel: string;
  shortDescription: string;
  supportedMeasurements: readonly string[];
  primaryMetric: AngleName;
  requiredLandmarks: readonly number[];
  status: ExerciseStatus;
  repCounting: "side-knee-cycle" | "not-yet-validated";
};

export const MOVEMENT_DEFINITIONS: readonly MovementDefinition[] = [
  {
    id: "squat-front",
    title: "Squat",
    viewLabel: "Front view",
    shortDescription: "Track frontal-plane movement symmetry and alignment proxies.",
    supportedMeasurements: [
      "Knee tracking projection proxy",
      "Pelvic-line symmetry proxy",
      "Trunk alignment",
      "Shoulder symmetry",
    ],
    primaryMetric: "leftKneeFrontalDeviation",
    requiredLandmarks: [11, 12, 23, 24, 25, 26, 27, 28, 31, 32],
    status: "research",
    repCounting: "not-yet-validated",
  },
  {
    id: "squat-side",
    title: "Squat",
    viewLabel: "Side view",
    shortDescription: "Measure sagittal knee motion, trunk lean, and squat-cycle repetitions.",
    supportedMeasurements: [
      "Knee flexion",
      "Knee-flexion range across the captured cycle",
      "Trunk lean",
      "Rep segmentation",
    ],
    primaryMetric: "leftKneeFlexion",
    requiredLandmarks: [11, 12, 23, 24, 25, 26, 27, 28, 31, 32],
    status: "research",
    repCounting: "side-knee-cycle",
  },
  {
    id: "push-up-side",
    title: "Push-Up",
    viewLabel: "Side view",
    shortDescription: "Capture side-view upper-body and trunk movement measurements.",
    supportedMeasurements: [
      "Shoulder elevation",
      "Trunk lean",
      "Pose confidence",
    ],
    primaryMetric: "leftShoulderElevation",
    requiredLandmarks: [11, 12, 13, 14, 23, 24, 25, 26, 27, 28],
    status: "prototype",
    repCounting: "not-yet-validated",
  },
  {
    id: "general-front",
    title: "General Movement Assessment",
    viewLabel: "Front view",
    shortDescription: "Explore supported frontal-plane measurements without exercise-specific claims.",
    supportedMeasurements: [
      "Knee tracking projection proxy",
      "Pelvic-line symmetry proxy",
      "Trunk alignment",
      "Shoulder symmetry",
    ],
    primaryMetric: "leftKneeFrontalDeviation",
    requiredLandmarks: [11, 12, 23, 24, 25, 26, 27, 28, 31, 32],
    status: "prototype",
    repCounting: "not-yet-validated",
  },
  {
    id: "general-side",
    title: "General Movement Assessment",
    viewLabel: "Side view",
    shortDescription: "Explore supported sagittal-plane measurements without exercise-specific claims.",
    supportedMeasurements: ["Knee flexion", "Trunk lean", "Shoulder elevation"],
    primaryMetric: "leftKneeFlexion",
    requiredLandmarks: [11, 12, 23, 24, 25, 26, 27, 28, 31, 32],
    status: "prototype",
    repCounting: "not-yet-validated",
  },
] as const;

export function getMovementDefinition(id: MovementType): MovementDefinition {
  const definition = MOVEMENT_DEFINITIONS.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown movement definition: ${id}`);
  return definition;
}

export function statusLabel(status: ExerciseStatus) {
  switch (status) {
    case "prototype":
      return "Prototype";
    case "research":
      return "Research";
    case "validated-internally":
      return "Validated internally";
    case "externally-validated":
      return "Externally validated";
  }
}
