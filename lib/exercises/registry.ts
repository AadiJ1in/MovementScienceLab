import type { AngleName } from "../biomechanics/angles";
import type { CaptureView, MovementType } from "../pose/types";
import type { RepSegmentationConfig } from "../biomechanics/rep-segmentation";

export type ExerciseDevelopmentStatus = "prototype" | "research" | "validated-internally" | "externally-validated";
export type ExerciseSegmentationStrategy = "angle-cycle" | "none";

export type CalibrationRequirement = {
  mode: "bilateral" | "best-visible-side";
  requiredLandmarks: readonly number[];
  leftSideLandmarks?: readonly number[];
  rightSideLandmarks?: readonly number[];
  description: string;
};

export type ExerciseDefinition = {
  id: MovementType;
  label: string;
  developmentStatus: ExerciseDevelopmentStatus;
  view: CaptureView;
  availableMetrics: readonly AngleName[];
  primaryMetric: AngleName;
  secondaryMetrics: readonly AngleName[];
  supportedMeasurementLabels: readonly string[];
  cameraInstructions: string;
  calibration: CalibrationRequirement;
  segmentation: {
    strategy: ExerciseSegmentationStrategy;
    signalAngles: readonly AngleName[];
    config?: Omit<RepSegmentationConfig, "angleName">;
  };
  feedbackCapabilities: readonly ("capture-quality" | "within-session" | "reference-trajectory")[];
  referenceTrajectorySupport: boolean;
  compatibleSourcedRules: readonly string[];
  shortDescription: string;
};

const FRONT_METRICS: readonly AngleName[] = [
  "leftKneeFrontalDeviation",
  "rightKneeFrontalDeviation",
  "trunkLean",
  "pelvicLineObliquity",
  "leftShoulderElevation",
  "rightShoulderElevation",
];
const SIDE_METRICS: readonly AngleName[] = [
  "leftKneeFlexion",
  "rightKneeFlexion",
  "trunkLean",
  "leftShoulderElevation",
  "rightShoulderElevation",
];

const FULL_FRONT = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32] as const;
const SIDE_LEFT = [11, 23, 25, 27, 31] as const;
const SIDE_RIGHT = [12, 24, 26, 28, 32] as const;
const PUSH_LEFT = [11, 13, 23, 25, 27] as const;
const PUSH_RIGHT = [12, 14, 24, 26, 28] as const;

const KNEE_CYCLE_CONFIG: Omit<RepSegmentationConfig, "angleName"> = {
  startDeltaDegrees: 8,
  reversalDeltaDegrees: 4,
  returnToleranceDegrees: 6,
  minExcursionDegrees: 15,
  baselineSmoothing: 0.08,
  signalSmoothing: 0.65,
  minConfidence: 0.7,
  minRepDurationMs: 450,
  maxRepDurationMs: 8000,
  maxTrackingGapMs: 750,
};

export const EXERCISE_REGISTRY: Record<MovementType, ExerciseDefinition> = {
  "squat-front": {
    id: "squat-front", label: "Squat — front view", developmentStatus: "research", view: "front",
    availableMetrics: FRONT_METRICS, primaryMetric: "leftKneeFrontalDeviation",
    secondaryMetrics: ["rightKneeFrontalDeviation", "pelvicLineObliquity", "trunkLean"],
    supportedMeasurementLabels: ["Knee tracking projection proxy", "Pelvic-line symmetry proxy", "Trunk alignment", "Shoulder symmetry"],
    cameraInstructions: "Face the camera squarely. Keep your full body visible, including both feet, and avoid rotating your torso away from the camera.",
    calibration: { mode: "bilateral", requiredLandmarks: FULL_FRONT, description: "shoulders, hips, knees, ankles, and feet" },
    segmentation: { strategy: "none", signalAngles: [] },
    feedbackCapabilities: ["capture-quality", "within-session"], referenceTrajectorySupport: true, compatibleSourcedRules: [],
    shortDescription: "Track frontal-plane movement symmetry and alignment proxies.",
  },
  "squat-side": {
    id: "squat-side", label: "Squat — side view", developmentStatus: "research", view: "side",
    availableMetrics: SIDE_METRICS, primaryMetric: "leftKneeFlexion", secondaryMetrics: ["rightKneeFlexion", "trunkLean"],
    supportedMeasurementLabels: ["Knee flexion", "Knee-flexion range across the captured cycle", "Trunk lean", "Rep segmentation"],
    cameraInstructions: "Stand approximately 90° to the camera. Keep your shoulder, hip, knee, ankle, and foot on the visible side unobstructed throughout the rep.",
    calibration: { mode: "best-visible-side", requiredLandmarks: [...SIDE_LEFT, ...SIDE_RIGHT], leftSideLandmarks: SIDE_LEFT, rightSideLandmarks: SIDE_RIGHT, description: "shoulder, hip, knee, ankle, and foot" },
    segmentation: { strategy: "angle-cycle", signalAngles: ["leftKneeFlexion", "rightKneeFlexion"], config: KNEE_CYCLE_CONFIG },
    feedbackCapabilities: ["capture-quality", "within-session", "reference-trajectory"], referenceTrajectorySupport: true, compatibleSourcedRules: [],
    shortDescription: "Measure sagittal knee motion, trunk lean, and squat-cycle repetitions.",
  },
  "push-up-side": {
    id: "push-up-side", label: "Push-Up — side view", developmentStatus: "prototype", view: "side",
    availableMetrics: SIDE_METRICS, primaryMetric: "leftShoulderElevation", secondaryMetrics: ["rightShoulderElevation", "trunkLean"],
    supportedMeasurementLabels: ["Shoulder elevation", "Trunk lean", "Pose confidence"],
    cameraInstructions: "Place the camera perpendicular to your body so your shoulder, elbow, hip, knee, and ankle remain visible during the full movement.",
    calibration: { mode: "best-visible-side", requiredLandmarks: [...PUSH_LEFT, ...PUSH_RIGHT], leftSideLandmarks: PUSH_LEFT, rightSideLandmarks: PUSH_RIGHT, description: "shoulder, elbow, hip, knee, and ankle" },
    segmentation: { strategy: "none", signalAngles: [] },
    feedbackCapabilities: ["capture-quality", "within-session"], referenceTrajectorySupport: false, compatibleSourcedRules: [],
    shortDescription: "Capture side-view upper-body and trunk movement measurements.",
  },
  "general-front": {
    id: "general-front", label: "General movement — front view", developmentStatus: "prototype", view: "front",
    availableMetrics: FRONT_METRICS, primaryMetric: "leftKneeFrontalDeviation", secondaryMetrics: ["rightKneeFrontalDeviation", "pelvicLineObliquity", "trunkLean"],
    supportedMeasurementLabels: ["Knee tracking projection proxy", "Pelvic-line symmetry proxy", "Trunk alignment", "Shoulder symmetry"],
    cameraInstructions: "Face the camera squarely with your full body in frame. Keep both shoulders, hips, knees, ankles, and feet visible.",
    calibration: { mode: "bilateral", requiredLandmarks: FULL_FRONT, description: "shoulders, hips, knees, ankles, and feet" },
    segmentation: { strategy: "none", signalAngles: [] },
    feedbackCapabilities: ["capture-quality"], referenceTrajectorySupport: false, compatibleSourcedRules: [],
    shortDescription: "Explore supported frontal-plane measurements without exercise-specific claims.",
  },
  "general-side": {
    id: "general-side", label: "General movement — side view", developmentStatus: "prototype", view: "side",
    availableMetrics: SIDE_METRICS, primaryMetric: "leftKneeFlexion", secondaryMetrics: ["rightKneeFlexion", "trunkLean", "leftShoulderElevation", "rightShoulderElevation"],
    supportedMeasurementLabels: ["Knee flexion", "Trunk lean", "Shoulder elevation"],
    cameraInstructions: "Stand side-on to the camera with your full body in frame and the near-side shoulder, hip, knee, ankle, and foot unobstructed.",
    calibration: { mode: "best-visible-side", requiredLandmarks: [...SIDE_LEFT, ...SIDE_RIGHT], leftSideLandmarks: SIDE_LEFT, rightSideLandmarks: SIDE_RIGHT, description: "shoulder, hip, knee, ankle, and foot" },
    segmentation: { strategy: "none", signalAngles: [] },
    feedbackCapabilities: ["capture-quality"], referenceTrajectorySupport: false, compatibleSourcedRules: [],
    shortDescription: "Explore supported sagittal-plane measurements without exercise-specific claims.",
  },
};

export const EXERCISES = Object.values(EXERCISE_REGISTRY);

export function getExerciseDefinition(id: MovementType): ExerciseDefinition {
  return EXERCISE_REGISTRY[id];
}
