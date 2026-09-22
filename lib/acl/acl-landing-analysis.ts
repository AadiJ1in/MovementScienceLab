import type {
  PoseLandmarkName,
  PoseStreamFrame,
  PoseStreamLandmark,
} from "@/lib/pose/stream";

export type AclLandingView = "front" | "side";

export type AclLandingInstant = {
  timestampMs: number;
  relativeToInitialContactMs: number;
  kneeFlexionDeg: number | null;
  medialKneeDeviationDeg: number | null;
  trunkLeanDeg: number | null;
  hipAdductionProxyDeg: number | null;
  confidence: number | null;
};

export type AclLandingEpisode = {
  episodeIndex: number;
  view: AclLandingView;
  initialContactTimestampMs: number;
  contactDetectionMethod: "foot-deceleration-plus-knee-loading";
  initialContact: AclLandingInstant;
  at40ms: AclLandingInstant | null;
  at80ms: AclLandingInstant | null;
  peakMedialKneeDeviation0to100msDeg: number | null;
  kneeFlexionExcursion0to80msDeg: number | null;
  peakTrunkLean0to100msDeg: number | null;
  meanConfidence0to100ms: number | null;
  interpretationBoundary: "camera-derived-2d-landing-research-only";
};

export type AclLandingSnapshot = {
  schemaVersion: "1.0.0";
  view: AclLandingView;
  processedFrames: number;
  candidateInitialContactDetected: boolean;
  activeEpisodeIndex: number | null;
  latestInstant: Omit<AclLandingInstant, "relativeToInitialContactMs"> | null;
  latestCompletedEpisode: AclLandingEpisode | null;
  completedEpisodes: AclLandingEpisode[];
  detector: {
    minimumDescentVelocityNormPerSecond: number;
    maximumContactVelocityNormPerSecond: number;
    maximumContactWindowMs: number;
    minimumKneeLoadingChangeDeg: number;
  };
  interpretationBoundary: "engineering-event-detection-not-ground-truth-contact";
};

type FrameMeasurement = {
  timestampMs: number;
  footY: number;
  kneeFlexionDeg: number | null;
  medialKneeDeviationDeg: number | null;
  trunkLeanDeg: number | null;
  hipAdductionProxyDeg: number | null;
  confidence: number | null;
};

const MIN_DESCENT_VELOCITY = 0.12;
const MAX_CONTACT_VELOCITY = 0.045;
const MAX_CONTACT_WINDOW_MS = 260;
const MIN_KNEE_LOADING_CHANGE_DEG = 3;
const EPISODE_CAPTURE_MS = 140;
const CONTACT_REFRACTORY_MS = 700;
const TIMEPOINT_TOLERANCE_MS = 28;

function landmark(
  frame: PoseStreamFrame,
  name: PoseLandmarkName,
): PoseStreamLandmark | null {
  return frame.pose.landmarks.find((item) => item.name === name && item.trusted) ?? null;
}

function minConfidence(points: Array<PoseStreamLandmark | null>): number | null {
  const finite = points.filter((point): point is PoseStreamLandmark => point !== null);
  return finite.length ? Math.min(...finite.map((point) => point.visibility)) : null;
}

function angleAtVertex(
  a: PoseStreamLandmark,
  vertex: PoseStreamLandmark,
  c: PoseStreamLandmark,
): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const cx = c.x - vertex.x;
  const cy = c.y - vertex.y;
  const cross = ax * cy - ay * cx;
  const dot = ax * cx + ay * cy;
  const angle = Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
  return angle > 180 ? 360 - angle : angle;
}

function kneeFlexion(
  hip: PoseStreamLandmark | null,
  knee: PoseStreamLandmark | null,
  ankle: PoseStreamLandmark | null,
): number | null {
  if (!hip || !knee || !ankle) return null;
  return 180 - angleAtVertex(hip, knee, ankle);
}

function signedMedialKneeDeviation(
  hip: PoseStreamLandmark | null,
  knee: PoseStreamLandmark | null,
  ankle: PoseStreamLandmark | null,
  bodyMidlineX: number | null,
): number | null {
  if (!hip || !knee || !ankle || bodyMidlineX === null) return null;
  const magnitude = Math.max(0, 180 - angleAtVertex(hip, knee, ankle));
  const lineDx = ankle.x - hip.x;
  const lineDy = ankle.y - hip.y;
  const lengthSquared = lineDx * lineDx + lineDy * lineDy;
  if (lengthSquared < 1e-8) return null;
  const t =
    ((knee.x - hip.x) * lineDx + (knee.y - hip.y) * lineDy) /
    lengthSquared;
  const expectedX = hip.x + t * lineDx;
  const displacement = knee.x - expectedX;
  const directionToMidline = Math.sign(bodyMidlineX - expectedX);
  if (directionToMidline === 0) return 0;
  return magnitude * Math.sign(displacement * directionToMidline || 1);
}

function trunkLean(
  shoulder: PoseStreamLandmark | null,
  hip: PoseStreamLandmark | null,
): number | null {
  if (!shoulder || !hip) return null;
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function hipAdductionProxy(
  shoulder: PoseStreamLandmark | null,
  hip: PoseStreamLandmark | null,
  knee: PoseStreamLandmark | null,
): number | null {
  if (!shoulder || !hip || !knee) return null;
  const interior = angleAtVertex(shoulder, hip, knee);
  return Math.abs(180 - interior);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function nearest(
  measurements: FrameMeasurement[],
  targetTimestampMs: number,
): FrameMeasurement | null {
  let best: FrameMeasurement | null = null;
  let bestDelta = Infinity;
  for (const measurement of measurements) {
    const delta = Math.abs(measurement.timestampMs - targetTimestampMs);
    if (delta < bestDelta) {
      best = measurement;
      bestDelta = delta;
    }
  }
  return bestDelta <= TIMEPOINT_TOLERANCE_MS ? best : null;
}

function instant(
  measurement: FrameMeasurement,
  initialContactTimestampMs: number,
): AclLandingInstant {
  return {
    timestampMs: measurement.timestampMs,
    relativeToInitialContactMs:
      measurement.timestampMs - initialContactTimestampMs,
    kneeFlexionDeg: measurement.kneeFlexionDeg,
    medialKneeDeviationDeg: measurement.medialKneeDeviationDeg,
    trunkLeanDeg: measurement.trunkLeanDeg,
    hipAdductionProxyDeg: measurement.hipAdductionProxyDeg,
    confidence: measurement.confidence,
  };
}

function selectVisibleSide(frame: PoseStreamFrame): "left" | "right" | null {
  const sideScores = (["left", "right"] as const).map((side) => {
    const names = [
      `${side}_shoulder`,
      `${side}_hip`,
      `${side}_knee`,
      `${side}_ankle`,
      `${side}_heel`,
      `${side}_foot_index`,
    ] as PoseLandmarkName[];
    const points = names.map((name) => landmark(frame, name));
    return {
      side,
      points,
      observed: points.filter(Boolean).length,
      confidence: average(
        points
          .filter((point): point is PoseStreamLandmark => point !== null)
          .map((point) => point.visibility),
      ) ?? 0,
    };
  });
  sideScores.sort(
    (a, b) => b.observed - a.observed || b.confidence - a.confidence,
  );
  return sideScores[0]?.observed >= 4 ? sideScores[0].side : null;
}

function measureFrame(
  frame: PoseStreamFrame,
  view: AclLandingView,
): FrameMeasurement | null {
  if (!frame.pose.detected || frame.pose.landmarkCount !== 33) return null;

  const leftHip = landmark(frame, "left_hip");
  const rightHip = landmark(frame, "right_hip");
  const bodyMidlineX =
    leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : null;

  const side = view === "side" ? selectVisibleSide(frame) : null;
  const preferredSide = side ?? "left";
  const otherSide = preferredSide === "left" ? "right" : "left";

  const preferredHip = landmark(frame, `${preferredSide}_hip` as PoseLandmarkName);
  const preferredKnee = landmark(frame, `${preferredSide}_knee` as PoseLandmarkName);
  const preferredAnkle = landmark(frame, `${preferredSide}_ankle` as PoseLandmarkName);
  const preferredShoulder = landmark(
    frame,
    `${preferredSide}_shoulder` as PoseLandmarkName,
  );
  const preferredHeel = landmark(frame, `${preferredSide}_heel` as PoseLandmarkName);
  const preferredFoot = landmark(
    frame,
    `${preferredSide}_foot_index` as PoseLandmarkName,
  );

  const otherHip = landmark(frame, `${otherSide}_hip` as PoseLandmarkName);
  const otherKnee = landmark(frame, `${otherSide}_knee` as PoseLandmarkName);
  const otherAnkle = landmark(frame, `${otherSide}_ankle` as PoseLandmarkName);
  const otherHeel = landmark(frame, `${otherSide}_heel` as PoseLandmarkName);
  const otherFoot = landmark(frame, `${otherSide}_foot_index` as PoseLandmarkName);

  const preferredFlexion = kneeFlexion(
    preferredHip,
    preferredKnee,
    preferredAnkle,
  );
  const otherFlexion = kneeFlexion(otherHip, otherKnee, otherAnkle);
  const flexion =
    preferredFlexion ?? otherFlexion;

  const leftShoulder = landmark(frame, "left_shoulder");
  const rightShoulder = landmark(frame, "right_shoulder");
  const shoulderMid =
    leftShoulder && rightShoulder
      ? {
          ...leftShoulder,
          x: (leftShoulder.x + rightShoulder.x) / 2,
          y: (leftShoulder.y + rightShoulder.y) / 2,
          visibility: Math.min(leftShoulder.visibility, rightShoulder.visibility),
        }
      : null;
  const hipMid =
    leftHip && rightHip
      ? {
          ...leftHip,
          x: (leftHip.x + rightHip.x) / 2,
          y: (leftHip.y + rightHip.y) / 2,
          visibility: Math.min(leftHip.visibility, rightHip.visibility),
        }
      : null;

  const preferredMedial = signedMedialKneeDeviation(
    preferredHip,
    preferredKnee,
    preferredAnkle,
    bodyMidlineX,
  );
  const otherMedial = signedMedialKneeDeviation(
    otherHip,
    otherKnee,
    otherAnkle,
    bodyMidlineX,
  );
  const medialCandidates = [preferredMedial, otherMedial].filter(
    (value): value is number => value !== null,
  );
  const medial = medialCandidates.length
    ? medialCandidates.reduce((best, value) => (value > best ? value : best))
    : null;

  const footPoints = [preferredAnkle, preferredHeel, preferredFoot, otherAnkle, otherHeel, otherFoot]
    .filter((point): point is PoseStreamLandmark => point !== null);
  if (!footPoints.length) return null;
  const footY = Math.max(...footPoints.map((point) => point.y));

  const confidence = minConfidence([
    preferredHip,
    preferredKnee,
    preferredAnkle,
    preferredShoulder,
  ]);

  return {
    timestampMs: frame.timestampMs,
    footY,
    kneeFlexionDeg: flexion,
    medialKneeDeviationDeg: view === "front" ? medial : null,
    trunkLeanDeg:
      view === "side"
        ? trunkLean(preferredShoulder, preferredHip)
        : shoulderMid && hipMid
          ? trunkLean(shoulderMid, hipMid)
          : null,
    hipAdductionProxyDeg:
      view === "front"
        ? hipAdductionProxy(preferredShoulder, preferredHip, preferredKnee)
        : null,
    confidence,
  };
}

export class AclLandingAnalyzer {
  private readonly history: FrameMeasurement[] = [];
  private readonly completedEpisodes: AclLandingEpisode[] = [];
  private processedFrames = 0;
  private activeContactTimestampMs: number | null = null;
  private activeEpisodeMeasurements: FrameMeasurement[] = [];
  private lastContactTimestampMs = -Infinity;
  private nextEpisodeIndex = 1;
  private latestMeasurement: FrameMeasurement | null = null;
  private latestCompletedEpisode: AclLandingEpisode | null = null;

  constructor(private readonly view: AclLandingView) {}

  reset() {
    this.history.length = 0;
    this.completedEpisodes.length = 0;
    this.processedFrames = 0;
    this.activeContactTimestampMs = null;
    this.activeEpisodeMeasurements = [];
    this.lastContactTimestampMs = -Infinity;
    this.nextEpisodeIndex = 1;
    this.latestMeasurement = null;
    this.latestCompletedEpisode = null;
  }

  ingest(frame: PoseStreamFrame): AclLandingSnapshot {
    this.processedFrames += 1;
    this.latestCompletedEpisode = null;
    const measurement = measureFrame(frame, this.view);
    if (!measurement) return this.snapshot();
    this.latestMeasurement = measurement;

    this.history.push(measurement);
    while (
      this.history.length > 2 &&
      measurement.timestampMs - this.history[0].timestampMs > 500
    ) {
      this.history.shift();
    }

    if (this.activeContactTimestampMs !== null) {
      this.activeEpisodeMeasurements.push(measurement);
      if (
        measurement.timestampMs - this.activeContactTimestampMs >=
        EPISODE_CAPTURE_MS
      ) {
        this.finishEpisode();
      }
      return this.snapshot();
    }

    if (
      measurement.timestampMs - this.lastContactTimestampMs >=
        CONTACT_REFRACTORY_MS &&
      this.isCandidateInitialContact()
    ) {
      this.activeContactTimestampMs = measurement.timestampMs;
      this.lastContactTimestampMs = measurement.timestampMs;
      this.activeEpisodeMeasurements = [measurement];
    }

    return this.snapshot();
  }

  private isCandidateInitialContact(): boolean {
    if (this.history.length < 4) return false;
    const current = this.history[this.history.length - 1];
    const recent = this.history.filter(
      (item) => current.timestampMs - item.timestampMs <= MAX_CONTACT_WINDOW_MS,
    );
    if (recent.length < 4) return false;

    let maxDescentVelocity = -Infinity;
    for (let index = 1; index < recent.length; index += 1) {
      const dt = (recent[index].timestampMs - recent[index - 1].timestampMs) / 1000;
      if (dt <= 0) continue;
      const velocity = (recent[index].footY - recent[index - 1].footY) / dt;
      maxDescentVelocity = Math.max(maxDescentVelocity, velocity);
    }

    const previous = recent[recent.length - 2];
    const dt = (current.timestampMs - previous.timestampMs) / 1000;
    if (dt <= 0) return false;
    const currentVelocity = (current.footY - previous.footY) / dt;
    const peakFootY = Math.max(...recent.map((item) => item.footY));
    const nearLowestFootPosition = current.footY >= peakFootY - 0.012;

    const validKneeValues = recent
      .map((item) => item.kneeFlexionDeg)
      .filter((value): value is number => value !== null);
    const kneeLoadingChange =
      validKneeValues.length >= 2
        ? Math.max(...validKneeValues) - Math.min(...validKneeValues)
        : 0;

    return (
      maxDescentVelocity >= MIN_DESCENT_VELOCITY &&
      Math.abs(currentVelocity) <= MAX_CONTACT_VELOCITY &&
      nearLowestFootPosition &&
      kneeLoadingChange >= MIN_KNEE_LOADING_CHANGE_DEG
    );
  }

  private finishEpisode() {
    const contact = this.activeContactTimestampMs;
    if (contact === null || !this.activeEpisodeMeasurements.length) return;
    const icMeasurement = nearest(this.activeEpisodeMeasurements, contact);
    if (!icMeasurement) {
      this.activeContactTimestampMs = null;
      this.activeEpisodeMeasurements = [];
      return;
    }
    const at40 = nearest(this.activeEpisodeMeasurements, contact + 40);
    const at80 = nearest(this.activeEpisodeMeasurements, contact + 80);
    const first100 = this.activeEpisodeMeasurements.filter(
      (item) => item.timestampMs - contact >= 0 && item.timestampMs - contact <= 100,
    );
    const medial = first100
      .map((item) => item.medialKneeDeviationDeg)
      .filter((value): value is number => value !== null);
    const trunk = first100
      .map((item) => item.trunkLeanDeg)
      .filter((value): value is number => value !== null);
    const confidences = first100
      .map((item) => item.confidence)
      .filter((value): value is number => value !== null);

    const episode: AclLandingEpisode = {
      episodeIndex: this.nextEpisodeIndex,
      view: this.view,
      initialContactTimestampMs: contact,
      contactDetectionMethod: "foot-deceleration-plus-knee-loading",
      initialContact: instant(icMeasurement, contact),
      at40ms: at40 ? instant(at40, contact) : null,
      at80ms: at80 ? instant(at80, contact) : null,
      peakMedialKneeDeviation0to100msDeg: medial.length
        ? Math.max(...medial)
        : null,
      kneeFlexionExcursion0to80msDeg:
        icMeasurement.kneeFlexionDeg !== null && at80?.kneeFlexionDeg !== null && at80?.kneeFlexionDeg !== undefined
          ? at80.kneeFlexionDeg - icMeasurement.kneeFlexionDeg
          : null,
      peakTrunkLean0to100msDeg: trunk.length
        ? Math.max(...trunk.map(Math.abs))
        : null,
      meanConfidence0to100ms: average(confidences),
      interpretationBoundary: "camera-derived-2d-landing-research-only",
    };
    this.completedEpisodes.push(episode);
    this.latestCompletedEpisode = episode;
    this.nextEpisodeIndex += 1;
    this.activeContactTimestampMs = null;
    this.activeEpisodeMeasurements = [];
  }

  private snapshot(): AclLandingSnapshot {
    const latest = this.latestMeasurement;
    return {
      schemaVersion: "1.0.0",
      view: this.view,
      processedFrames: this.processedFrames,
      candidateInitialContactDetected: this.activeContactTimestampMs !== null,
      activeEpisodeIndex:
        this.activeContactTimestampMs !== null ? this.nextEpisodeIndex : null,
      latestInstant: latest
        ? {
            timestampMs: latest.timestampMs,
            kneeFlexionDeg: latest.kneeFlexionDeg,
            medialKneeDeviationDeg: latest.medialKneeDeviationDeg,
            trunkLeanDeg: latest.trunkLeanDeg,
            hipAdductionProxyDeg: latest.hipAdductionProxyDeg,
            confidence: latest.confidence,
          }
        : null,
      latestCompletedEpisode: this.latestCompletedEpisode,
      completedEpisodes: [...this.completedEpisodes],
      detector: {
        minimumDescentVelocityNormPerSecond: MIN_DESCENT_VELOCITY,
        maximumContactVelocityNormPerSecond: MAX_CONTACT_VELOCITY,
        maximumContactWindowMs: MAX_CONTACT_WINDOW_MS,
        minimumKneeLoadingChangeDeg: MIN_KNEE_LOADING_CHANGE_DEG,
      },
      interpretationBoundary: "engineering-event-detection-not-ground-truth-contact",
    };
  }
}
