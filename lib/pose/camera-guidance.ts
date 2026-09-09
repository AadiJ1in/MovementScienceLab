import type { CaptureView, MovementType, PoseFrame } from "./types";

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

const CORE_FULL_BODY_LANDMARKS = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32];
const LEFT_SIDE_LANDMARKS = [11, 13, 15, 23, 25, 27, 31];
const RIGHT_SIDE_LANDMARKS = [12, 14, 16, 24, 26, 28, 32];

export type CameraGuidanceStatus = {
  ready: boolean;
  messages: string[];
};

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

  const isTrusted = (index: number) => frame.keypoints[index]?.trusted === true;

  if (config.view === "front") {
    const missing = CORE_FULL_BODY_LANDMARKS.filter((index) => !isTrusted(index));
    if (missing.length > 0) {
      messages.push(
        "Keep both shoulders, hips, knees, ankles, and feet clearly visible before recording.",
      );
    }
  } else {
    const leftTrusted = LEFT_SIDE_LANDMARKS.filter(isTrusted).length;
    const rightTrusted = RIGHT_SIDE_LANDMARKS.filter(isTrusted).length;
    const bestSideTrusted = Math.max(leftTrusted, rightTrusted);

    if (bestSideTrusted < 6) {
      messages.push(
        "Keep one complete side of the body visible from shoulder through foot; remove occlusions or move farther from the camera.",
      );
    }
  }

  const xs = frame.keypoints.filter((point) => point.trusted).map((point) => point.x);
  const ys = frame.keypoints.filter((point) => point.trusted).map((point) => point.y);

  if (xs.length > 0 && ys.length > 0) {
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const margin = 0.03;

    if (minX < margin || maxX > 1 - margin || minY < margin || maxY > 1 - margin) {
      messages.push("Move slightly farther from the camera so the full pose stays inside the frame.");
    }
  }

  return {
    ready: messages.length === 0,
    messages:
      messages.length > 0
        ? messages
        : [
            `${config.label} positioning looks usable. This confirms landmark visibility, not perfect 3D camera alignment.`,
          ],
  };
}
