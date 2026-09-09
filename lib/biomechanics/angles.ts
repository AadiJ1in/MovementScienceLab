import type { PoseFrame, PoseKeypoint } from "@/lib/pose/types";

export type AngleName =
  | "leftKneeFlexion"
  | "rightKneeFlexion"
  | "leftKneeFrontalDeviation"
  | "rightKneeFrontalDeviation"
  | "trunkLean"
  | "pelvicLineObliquity"
  | "leftShoulderElevation"
  | "rightShoulderElevation";

export type AngleReading = {
  frameTimestamp: number;
  angleName: AngleName;
  value: number;
  confidence: number;
};

type Point2D = Pick<PoseKeypoint, "x" | "y">;

const INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const RAD_TO_DEG = 180 / Math.PI;

export function angleAtVertex(a: Point2D, vertex: Point2D, c: Point2D): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const cx = c.x - vertex.x;
  const cy = c.y - vertex.y;

  const cross = ax * cy - ay * cx;
  const dot = ax * cx + ay * cy;
  const raw = Math.abs(Math.atan2(cross, dot) * RAD_TO_DEG);
  return raw > 180 ? 360 - raw : raw;
}

export function angleFromVertical(from: Point2D, to: Point2D): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.atan2(dx, -dy) * RAD_TO_DEG;
}

export function angleFromHorizontal(left: Point2D, right: Point2D): number {
  return Math.atan2(right.y - left.y, right.x - left.x) * RAD_TO_DEG;
}

export function minConfidence(...points: PoseKeypoint[]): number {
  return Math.min(...points.map((point) => point.visibility));
}

function point(frame: PoseFrame, index: number): PoseKeypoint | null {
  const value = frame.keypoints[index];
  return value?.trusted ? value : null;
}

function reading(
  frame: PoseFrame,
  angleName: AngleName,
  value: number,
  points: PoseKeypoint[],
): AngleReading {
  return {
    frameTimestamp: frame.frameTimestamp,
    angleName,
    value,
    confidence: minConfidence(...points),
  };
}

function kneeFlexion(
  frame: PoseFrame,
  side: "left" | "right",
): AngleReading | null {
  const hip = point(frame, INDEX[`${side}Hip`]);
  const knee = point(frame, INDEX[`${side}Knee`]);
  const ankle = point(frame, INDEX[`${side}Ankle`]);
  if (!hip || !knee || !ankle) return null;

  // 0° = fully straight in the 2D projection; increasing values = more flexion.
  const interior = angleAtVertex(hip, knee, ankle);
  return reading(
    frame,
    side === "left" ? "leftKneeFlexion" : "rightKneeFlexion",
    180 - interior,
    [hip, knee, ankle],
  );
}

function kneeFrontalDeviation(
  frame: PoseFrame,
  side: "left" | "right",
): AngleReading | null {
  const hip = point(frame, INDEX[`${side}Hip`]);
  const knee = point(frame, INDEX[`${side}Knee`]);
  const ankle = point(frame, INDEX[`${side}Ankle`]);
  if (!hip || !knee || !ankle) return null;

  // This is a 2D frontal-plane proxy: deviation from a straight hip-knee-ankle line.
  // Magnitude only. Do not interpret it as a diagnostic valgus/varus measurement.
  const interior = angleAtVertex(hip, knee, ankle);
  return reading(
    frame,
    side === "left"
      ? "leftKneeFrontalDeviation"
      : "rightKneeFrontalDeviation",
    180 - interior,
    [hip, knee, ankle],
  );
}

function trunkLean(frame: PoseFrame): AngleReading | null {
  const leftShoulder = point(frame, INDEX.leftShoulder);
  const rightShoulder = point(frame, INDEX.rightShoulder);
  const leftHip = point(frame, INDEX.leftHip);
  const rightHip = point(frame, INDEX.rightHip);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipMid = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };

  return reading(
    frame,
    "trunkLean",
    angleFromVertical(hipMid, shoulderMid),
    [leftShoulder, rightShoulder, leftHip, rightHip],
  );
}

function pelvicLineObliquity(frame: PoseFrame): AngleReading | null {
  const leftHip = point(frame, INDEX.leftHip);
  const rightHip = point(frame, INDEX.rightHip);
  if (!leftHip || !rightHip) return null;

  return reading(
    frame,
    "pelvicLineObliquity",
    angleFromHorizontal(leftHip, rightHip),
    [leftHip, rightHip],
  );
}

function shoulderElevation(
  frame: PoseFrame,
  side: "left" | "right",
): AngleReading | null {
  const shoulder = point(frame, INDEX[`${side}Shoulder`]);
  const elbow = point(frame, INDEX[`${side}Elbow`]);
  const hip = point(frame, INDEX[`${side}Hip`]);
  if (!shoulder || !elbow || !hip) return null;

  return reading(
    frame,
    side === "left" ? "leftShoulderElevation" : "rightShoulderElevation",
    angleAtVertex(elbow, shoulder, hip),
    [shoulder, elbow, hip],
  );
}

export function computeAnglesForFrame(frame: PoseFrame): AngleReading[] {
  return [
    kneeFlexion(frame, "left"),
    kneeFlexion(frame, "right"),
    kneeFrontalDeviation(frame, "left"),
    kneeFrontalDeviation(frame, "right"),
    trunkLean(frame),
    pelvicLineObliquity(frame),
    shoulderElevation(frame, "left"),
    shoulderElevation(frame, "right"),
  ].filter((value): value is AngleReading => value !== null);
}
