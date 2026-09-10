import type { CaptureView, MovementType, PoseFrame, PoseKeypoint } from "./types";

export const KEYPOINT_VISIBILITY_THRESHOLD = 0.7;

export const MOVEMENT_GUIDANCE: Record<
  MovementType,
  {
    label: string;
    view: CaptureView;
    instruction: string;
  }
> = {
  "squat-front": {
    label: "Squat — front view",
    view: "front",
    instruction:
      "Face the camera squarely. Keep your full body visible, including both feet, and avoid rotating your torso away from the camera.",
  },
  "squat-side": {
    label: "Squat — side view",
    view: "side",
    instruction:
      "Stand approximately 90° to the camera. Keep your shoulder, hip, knee, ankle, and foot on the visible side unobstructed throughout the rep.",
  },
  "push-up-side": {
    label: "Push-up — side view",
    view: "side",
    instruction:
      "Place the camera perpendicular to your body so your shoulder, elbow, hip, knee, and ankle remain visible during the full movement.",
  },
  "general-front": {
    label: "General movement — front view",
    view: "front",
    instruction:
      "Face the camera squarely with your full body in frame. Keep both shoulders, hips, knees, ankles, and feet visible.",
  },
  "general-side": {
    label: "General movement — side view",
    view: "side",
    instruction:
      "Stand side-on to the camera with your full body in frame and the near-side shoulder, hip, knee, ankle, and foot unobstructed.",
  },
};

const FRONT_REQUIRED = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32] as const;

const SIDE_REQUIRED: Record<
  Extract<MovementType, "squat-side" | "push-up-side" | "general-side">,
  { left: readonly number[]; right: readonly number[]; description: string }
> = {
  "squat-side": {
    left: [11, 23, 25, 27, 31],
    right: [12, 24, 26, 28, 32],
    description: "shoulder, hip, knee, ankle, and foot",
  },
  "push-up-side": {
    left: [11, 13, 23, 25, 27],
    right: [12, 14, 24, 26, 28],
    description: "shoulder, elbow, hip, knee, and ankle",
  },
  "general-side": {
    left: [11, 23, 25, 27, 31],
    right: [12, 24, 26, 28, 32],
    description: "shoulder, hip, knee, ankle, and foot",
  },
};

export type CameraGuidanceStatus = {
  ready: boolean;
  messages: string[];
};

function allTrusted(frame: PoseFrame, indices: readonly number[]) {
  return indices.every((index) => frame.keypoints[index]?.trusted === true);
}

function trustedCount(frame: PoseFrame, indices: readonly number[]) {
  return indices.filter((index) => frame.keypoints[index]?.trusted === true).length;
}

function isTrustedPoint(point: PoseKeypoint | undefined): point is PoseKeypoint {
  return point?.trusted === true;
}

export function evaluateCameraGuidance(
  frame: PoseFrame | null,
  movement: MovementType,
): CameraGuidanceStatus {
  if (!frame || frame.keypoints.length !== 33) {
    return {
      ready: false,
      messages: ["Move into view so MediaPipe can detect one complete body pose."],
    };
  }

  const config = MOVEMENT_GUIDANCE[movement];
  const messages: string[] = [];
  let framingIndices: readonly number[] = FRONT_REQUIRED;

  if (config.view === "front") {
    if (!allTrusted(frame, FRONT_REQUIRED)) {
      messages.push(
        "Keep both shoulders, hips, knees, ankles, and feet clearly visible before recording.",
      );
    }
  } else {
    const sideConfig = SIDE_REQUIRED[movement as keyof typeof SIDE_REQUIRED];
    const leftCount = trustedCount(frame, sideConfig.left);
    const rightCount = trustedCount(frame, sideConfig.right);
    const useLeft = leftCount >= rightCount;
    framingIndices = useLeft ? sideConfig.left : sideConfig.right;

    if (!allTrusted(frame, framingIndices)) {
      messages.push(
        `Keep one complete visible-side chain clear: ${sideConfig.description}. Remove occlusions or adjust the camera.`,
      );
    }
  }

  const framingPoints = framingIndices
    .map((index) => frame.keypoints[index])
    .filter(isTrustedPoint);

  if (framingPoints.length > 0) {
    const xs = framingPoints.map((point) => point.x);
    const ys = framingPoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const margin = 0.03;

    if (minX < margin || maxX > 1 - margin || minY < margin || maxY > 1 - margin) {
      messages.push("Move slightly farther from the camera so the required body landmarks stay inside the frame.");
    }
  }

  return {
    ready: messages.length === 0,
    messages:
      messages.length > 0
        ? messages
        : [
            `${config.label} positioning looks usable. This confirms required landmark visibility and framing, not perfect 3D camera alignment.`,
          ],
  };
}
