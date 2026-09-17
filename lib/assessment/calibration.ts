import { getExerciseDefinition } from "../exercises/registry";
import type { MovementType, PoseFrame, PoseKeypoint } from "../pose/types";
import type { ImageQualitySnapshot } from "../pose/image-quality";

export type CalibrationCheckId =
  | "head"
  | "torso"
  | "hips"
  | "knees"
  | "ankles"
  | "required"
  | "frame-edge"
  | "body-centered"
  | "framing-distance"
  | "view-alignment"
  | "camera-level"
  | "lighting"
  | "blur"
  | "camera-stability";

export type CalibrationCheck = {
  id: CalibrationCheckId;
  label: string;
  passed: boolean;
  blocking: boolean;
  status: "pass" | "fail" | "unavailable";
  detail?: string;
};

export type CalibrationEnvironment = {
  imageQuality?: ImageQualitySnapshot | null;
  cameraStable?: boolean | null;
};

const trusted = (frame: PoseFrame | null, index: number) => frame?.keypoints[index]?.trusted === true;

function pairVisible(frame: PoseFrame | null, a: number, b: number, sideMode: boolean) {
  return sideMode ? trusted(frame, a) || trusted(frame, b) : trusted(frame, a) && trusted(frame, b);
}

function trustedCount(frame: PoseFrame | null, indices: readonly number[]) {
  return indices.filter((index) => trusted(frame, index)).length;
}

function availableTrustedPoints(frame: PoseFrame | null, indices: readonly number[]) {
  return indices
    .map((index) => frame?.keypoints[index])
    .filter((point): point is PoseKeypoint => Boolean(point?.trusted));
}

function check(
  id: CalibrationCheckId,
  label: string,
  passed: boolean,
  detail?: string,
  blocking = true,
): CalibrationCheck {
  return { id, label, passed, blocking, status: passed ? "pass" : "fail", detail };
}

function unavailable(
  id: CalibrationCheckId,
  label: string,
  detail: string,
  blocking = false,
): CalibrationCheck {
  return { id, label, passed: false, blocking, status: "unavailable", detail };
}

function bounds(points: PoseKeypoint[]) {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function lineAngleDegrees(a: PoseKeypoint, b: PoseKeypoint) {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

function frontViewAlignment(frame: PoseFrame | null): CalibrationCheck {
  const leftShoulder = frame?.keypoints[11];
  const rightShoulder = frame?.keypoints[12];
  const leftHip = frame?.keypoints[23];
  const rightHip = frame?.keypoints[24];
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((point) => point?.trusted)) {
    return unavailable(
      "view-alignment",
      "Body facing camera",
      "Both shoulder and hip pairs are needed to assess frontal-view geometry.",
      true,
    );
  }
  const shoulderWidth = Math.abs((rightShoulder as PoseKeypoint).x - (leftShoulder as PoseKeypoint).x);
  const hipWidth = Math.abs((rightHip as PoseKeypoint).x - (leftHip as PoseKeypoint).x);
  const midpointShift = Math.abs(
    (((leftShoulder as PoseKeypoint).x + (rightShoulder as PoseKeypoint).x) / 2) -
      (((leftHip as PoseKeypoint).x + (rightHip as PoseKeypoint).x) / 2),
  );
  const passed = shoulderWidth >= 0.08 && hipWidth >= 0.06 && midpointShift <= 0.14;
  return check(
    "view-alignment",
    "Body facing camera",
    passed,
    passed
      ? "Bilateral body geometry is usable for the frontal projection."
      : "Rotate to face the camera more squarely and keep both sides visible.",
  );
}

function sideViewAlignment(frame: PoseFrame | null): CalibrationCheck {
  if (!frame) {
    return unavailable("view-alignment", "Body side-on", "A pose is needed to assess side-view geometry.", true);
  }
  const shoulderPair = availableTrustedPoints(frame, [11, 12]);
  const hipPair = availableTrustedPoints(frame, [23, 24]);
  const kneePair = availableTrustedPoints(frame, [25, 26]);
  const anklePair = availableTrustedPoints(frame, [27, 28]);
  const bodyPoints = availableTrustedPoints(frame, [0, 11, 12, 23, 24, 25, 26, 27, 28]);
  const bodyBounds = bounds(bodyPoints);
  if (!bodyBounds) {
    return unavailable("view-alignment", "Body side-on", "A pose is needed to assess side-view geometry.", true);
  }
  const bodyHeight = Math.max(0.001, bodyBounds.maxY - bodyBounds.minY);
  const separations = [shoulderPair, hipPair, kneePair, anklePair]
    .filter((pair) => pair.length === 2)
    .map((pair) => Math.abs(pair[0].x - pair[1].x) / bodyHeight);
  if (!separations.length) {
    // One side being occluded is common and can itself be consistent with a side-on view.
    return check(
      "view-alignment",
      "Body side-on",
      true,
      "Only one side is strongly visible; the selected side chain will be used.",
    );
  }
  const median = [...separations].sort((a, b) => a - b)[Math.floor(separations.length / 2)];
  const passed = median <= 0.22;
  return check(
    "view-alignment",
    "Body side-on",
    passed,
    passed
      ? "Left/right landmark separation is compressed as expected for a side view."
      : "Rotate more side-on to reduce out-of-plane projection error.",
  );
}

function cameraLevelCheck(frame: PoseFrame | null, movement: MovementType): CalibrationCheck {
  const exercise = getExerciseDefinition(movement);
  if (exercise.view !== "front" || !frame) {
    return unavailable(
      "camera-level",
      "Camera level",
      "A true camera-level check requires a calibrated reference; no camera roll is inferred from MediaPipe pseudo-3D.",
      false,
    );
  }
  const leftShoulder = frame.keypoints[11];
  const rightShoulder = frame.keypoints[12];
  const leftHip = frame.keypoints[23];
  const rightHip = frame.keypoints[24];
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((point) => point?.trusted)) {
    return unavailable(
      "camera-level",
      "Camera level",
      "Shoulder and hip lines are required for the image-plane level proxy.",
      false,
    );
  }
  const shoulderAngle = Math.abs(lineAngleDegrees(leftShoulder, rightShoulder));
  const hipAngle = Math.abs(lineAngleDegrees(leftHip, rightHip));
  const proxyAngle = (shoulderAngle + hipAngle) / 2;
  const passed = proxyAngle <= 10;
  return check(
    "camera-level",
    "Camera level proxy",
    passed,
    `${proxyAngle.toFixed(1)}° mean image-plane shoulder/hip-line obliquity. This is not calibrated camera roll.`,
    false,
  );
}

export function buildCalibrationChecks(
  frame: PoseFrame | null,
  movement: MovementType,
  environment: CalibrationEnvironment = {},
): CalibrationCheck[] {
  const exercise = getExerciseDefinition(movement);
  const calibration = exercise.calibration;
  const sideMode = calibration.mode === "best-visible-side";

  let activeRequired = calibration.requiredLandmarks;
  let requiredPassed = activeRequired.every((index) => trusted(frame, index));
  if (sideMode) {
    const left = calibration.leftSideLandmarks ?? [];
    const right = calibration.rightSideLandmarks ?? [];
    activeRequired = trustedCount(frame, left) >= trustedCount(frame, right) ? left : right;
    requiredPassed = activeRequired.length > 0 && activeRequired.every((index) => trusted(frame, index));
  }

  const requiredPoints = availableTrustedPoints(frame, activeRequired);
  const requiredBounds = bounds(requiredPoints);
  const frameEdgePassed = requiredPoints.length > 0 && requiredPoints.every(
    (point) => point.x >= 0.04 && point.x <= 0.96 && point.y >= 0.04 && point.y <= 0.96,
  );

  const bodyCenterX = requiredBounds ? (requiredBounds.minX + requiredBounds.maxX) / 2 : null;
  const bodyCentered = bodyCenterX !== null && bodyCenterX >= 0.30 && bodyCenterX <= 0.70;
  const bodyHeight = requiredBounds ? requiredBounds.maxY - requiredBounds.minY : null;
  // This is a normalized framing/scale gate, not a physical distance estimate in meters.
  const framingDistancePassed = bodyHeight !== null && bodyHeight >= 0.28 && bodyHeight <= 0.92;

  const imageQuality = environment.imageQuality;
  const lightingCheck = imageQuality
    ? check(
        "lighting",
        "Lighting acceptable",
        imageQuality.lightingAcceptable,
        imageQuality.lightingAcceptable
          ? `Mean image luminance ${imageQuality.meanLuminance.toFixed(0)}.`
          : "Increase or reduce lighting so the body is not predominantly dark or clipped bright.",
      )
    : unavailable("lighting", "Lighting acceptable", "Waiting for browser image-quality sampling.", false);
  const blurCheck = imageQuality
    ? check(
        "blur",
        "Image sharpness acceptable",
        imageQuality.blurAcceptable,
        imageQuality.blurAcceptable
          ? `Sharpness score ${imageQuality.sharpnessScore.toFixed(1)}.`
          : "Reduce camera motion, improve focus, or increase light to reduce blur.",
      )
    : unavailable("blur", "Image sharpness acceptable", "Waiting for browser image-quality sampling.", false);

  const stabilityCheck = environment.cameraStable === null || environment.cameraStable === undefined
    ? unavailable(
        "camera-stability",
        "Camera stable",
        "Camera/body stability is not available until a short calibration window has been observed.",
        false,
      )
    : check(
        "camera-stability",
        "Camera stable",
        environment.cameraStable,
        environment.cameraStable
          ? "Short-window image/pose position is stable."
          : "Keep the camera fixed and stand still during calibration.",
      );

  return [
    check("head", "Head visible", trusted(frame, 0)),
    check("torso", "Torso visible", pairVisible(frame, 11, 12, sideMode) && pairVisible(frame, 23, 24, sideMode)),
    check("hips", "Hips visible", pairVisible(frame, 23, 24, sideMode)),
    check("knees", "Knees visible", pairVisible(frame, 25, 26, sideMode)),
    check("ankles", "Ankles visible", pairVisible(frame, 27, 28, sideMode)),
    check("required", "Required joints have sufficient tracking confidence", requiredPassed),
    check("frame-edge", "Required joints clear of frame edges", frameEdgePassed),
    check(
      "body-centered",
      "Body centered",
      bodyCentered,
      bodyCenterX === null ? "Waiting for a complete pose." : `Horizontal body center ${(bodyCenterX * 100).toFixed(0)}% of frame width.`,
    ),
    check(
      "framing-distance",
      "Framing distance acceptable",
      framingDistancePassed,
      bodyHeight === null
        ? "Waiting for a complete pose."
        : `Required-landmark vertical span ${(bodyHeight * 100).toFixed(0)}% of frame height. This is a framing-scale proxy, not meters.`,
    ),
    exercise.view === "front" ? frontViewAlignment(frame) : sideViewAlignment(frame),
    cameraLevelCheck(frame, movement),
    lightingCheck,
    blurCheck,
    stabilityCheck,
  ];
}

export function calibrationPassed(checks: readonly CalibrationCheck[]) {
  return checks.every((item) => !item.blocking || item.status === "pass");
}
