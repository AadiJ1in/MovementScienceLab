import { describe, expect, it } from "vitest";
import {
  AclLandingAnalyzer,
  type AclLandingSnapshot,
} from "./acl-landing-analysis";
import {
  POSE_LANDMARK_NAMES,
  type PoseStreamFrame,
  type PoseStreamLandmark,
} from "@/lib/pose/stream";

function point(
  name: (typeof POSE_LANDMARK_NAMES)[number],
  x: number,
  y: number,
): PoseStreamLandmark {
  const index = POSE_LANDMARK_NAMES.indexOf(name);
  return {
    index,
    name,
    x,
    y,
    z: 0,
    visibility: 0.95,
    trusted: true,
  };
}

function frame(
  timestampMs: number,
  footY: number,
  options: { leftKneeX?: number; sideKneeX?: number } = {},
): PoseStreamFrame {
  const landmarks = POSE_LANDMARK_NAMES.map((name, index) => ({
    index,
    name,
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    trusted: true,
  })) as PoseStreamLandmark[];

  const set = (p: PoseStreamLandmark) => {
    landmarks[p.index] = p;
  };

  set(point("left_shoulder", 0.43, 0.24));
  set(point("right_shoulder", 0.57, 0.24));
  set(point("left_hip", 0.43, 0.46));
  set(point("right_hip", 0.57, 0.46));
  set(point("left_knee", options.leftKneeX ?? options.sideKneeX ?? 0.43, 0.68));
  set(point("right_knee", 0.57, 0.68));
  set(point("left_ankle", 0.43, footY - 0.02));
  set(point("right_ankle", 0.57, footY - 0.02));
  set(point("left_heel", 0.42, footY));
  set(point("right_heel", 0.56, footY));
  set(point("left_foot_index", 0.46, footY));
  set(point("right_foot_index", 0.60, footY));

  return {
    schemaVersion: "1.1.0",
    sequence: Math.round(timestampMs),
    timestampMs,
    timestampSource: "mediapipe-inference-clock",
    capturedAtIso: new Date(1700000000000 + timestampMs).toISOString(),
    mediaTimeMs: timestampMs,
    frameClock: "request-video-frame-callback",
    image: { width: 1280, height: 720, mirrored: false },
    pose: {
      detected: true,
      landmarkCount: 33,
      trustedLandmarkCount: 33,
      trustedFraction: 1,
      meanVisibility: 0.95,
      landmarks,
      worldLandmarks: [],
      worldCoordinateNote: "mediapipe-model-relative-not-calibrated-metric-3d",
    },
    processing: {
      delegate: "GPU",
      cameraFps: 30,
      inferenceFps: 30,
      averageInferenceLatencyMs: 10,
      inferenceLatencyMs: 10,
    },
  };
}

function runSideLanding(): AclLandingSnapshot {
  const analyzer = new AclLandingAnalyzer("side");
  const samples = [
    [0, 0.74, 0.43],
    [33, 0.755, 0.44],
    [66, 0.775, 0.47],
    [99, 0.79, 0.50],
    [132, 0.791, 0.54],
    [165, 0.7915, 0.57],
    [198, 0.792, 0.59],
    [231, 0.792, 0.60],
    [264, 0.792, 0.60],
    [297, 0.792, 0.60],
  ] as const;
  let snapshot = analyzer.ingest(frame(0, 0.74, { sideKneeX: 0.43 }));
  for (const [time, y, kneeX] of samples.slice(1)) {
    snapshot = analyzer.ingest(frame(time, y, { sideKneeX: kneeX }));
  }
  return snapshot;
}

describe("ACL landing phase analyzer", () => {
  it("detects a candidate initial-contact transition and captures early landing timepoints", () => {
    const snapshot = runSideLanding();
    expect(snapshot.completedEpisodes.length).toBeGreaterThanOrEqual(1);
    const episode = snapshot.completedEpisodes[0];
    expect(episode.contactDetectionMethod).toBe(
      "foot-deceleration-plus-knee-loading",
    );
    expect(episode.initialContact.kneeFlexionDeg).not.toBeNull();
    expect(episode.at40ms?.kneeFlexionDeg).not.toBeNull();
    expect(episode.at80ms?.kneeFlexionDeg).not.toBeNull();
    expect(episode.kneeFlexionExcursion0to80msDeg).not.toBeNull();
    expect(episode.interpretationBoundary).toBe(
      "camera-derived-2d-landing-research-only",
    );
  });

  it("assigns positive sign to medial frontal knee displacement", () => {
    const analyzer = new AclLandingAnalyzer("front");
    const snapshot = analyzer.ingest(
      frame(0, 0.80, { leftKneeX: 0.49 }),
    );
    expect(snapshot.latestInstant?.medialKneeDeviationDeg).not.toBeNull();
    expect(snapshot.latestInstant?.medialKneeDeviationDeg ?? 0).toBeGreaterThan(0);
  });

  it("labels contact detection as engineering inference rather than force-plate truth", () => {
    const snapshot = runSideLanding();
    expect(snapshot.interpretationBoundary).toBe(
      "engineering-event-detection-not-ground-truth-contact",
    );
  });
});
