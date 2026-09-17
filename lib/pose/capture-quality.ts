export type CaptureQualityIssue = {
  code: "low-pose-confidence" | "unstable-pose-confidence" | "processing-lag" | "high-inference-latency";
  message: string;
};

export type CapturePerformanceSnapshot = {
  processingFps: number;
  averageInferenceLatencyMs: number;
  estimatedDroppedProcessingFrames: number;
  meanPoseConfidence: number | null;
  confidenceStdDev: number | null;
  poseCenterJitter: number | null;
  qualityIssues: CaptureQualityIssue[];
  recommendLowerProcessingResolution: boolean;
};

type Sample = {
  timestampMs: number;
  inferenceLatencyMs: number;
  poseConfidence: number | null;
  poseCenterX?: number | null;
  poseCenterY?: number | null;
};

/**
 * Browser capture-performance monitor. Dropped-frame counts estimate frames not
 * processed by pose inference relative to the camera's reported FPS; they are
 * engineering telemetry, not camera-hardware diagnostics or clinical measures.
 * Pose-center jitter is a short-window framing-stability signal and is not a
 * biomechanical measurement or empirical camera measurement error.
 */
export class CapturePerformanceMonitor {
  private samples: Sample[] = [];

  constructor(private readonly windowMs = 3000) {}

  add(sample: Sample, cameraFps: number | undefined, targetResolution: "720p" | "1080p"): CapturePerformanceSnapshot {
    this.samples.push(sample);
    const cutoff = sample.timestampMs - this.windowMs;
    while (this.samples.length > 1 && this.samples[0].timestampMs < cutoff) this.samples.shift();
    return this.snapshot(cameraFps, targetResolution);
  }

  reset() {
    this.samples = [];
  }

  private snapshot(cameraFps: number | undefined, targetResolution: "720p" | "1080p"): CapturePerformanceSnapshot {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsedMs = first && last ? Math.max(1, last.timestampMs - first.timestampMs) : 1;
    const processingFps = this.samples.length > 1 ? ((this.samples.length - 1) * 1000) / elapsedMs : 0;
    const averageInferenceLatencyMs = this.samples.length
      ? this.samples.reduce((sum, item) => sum + item.inferenceLatencyMs, 0) / this.samples.length
      : 0;

    const confidenceValues = this.samples
      .map((item) => item.poseConfidence)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const meanPoseConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null;
    const confidenceStdDev = meanPoseConfidence === null
      ? null
      : Math.sqrt(confidenceValues.reduce((sum, value) => sum + (value - meanPoseConfidence) ** 2, 0) / confidenceValues.length);

    const centers = this.samples
      .filter(
        (item): item is Sample & { poseCenterX: number; poseCenterY: number } =>
          typeof item.poseCenterX === "number" &&
          Number.isFinite(item.poseCenterX) &&
          typeof item.poseCenterY === "number" &&
          Number.isFinite(item.poseCenterY),
      );
    let poseCenterJitter: number | null = null;
    if (centers.length >= 4) {
      const meanX = centers.reduce((sum, item) => sum + item.poseCenterX, 0) / centers.length;
      const meanY = centers.reduce((sum, item) => sum + item.poseCenterY, 0) / centers.length;
      poseCenterJitter = Math.sqrt(
        centers.reduce(
          (sum, item) => sum + (item.poseCenterX - meanX) ** 2 + (item.poseCenterY - meanY) ** 2,
          0,
        ) / centers.length,
      );
    }

    const expectedFrames = cameraFps && elapsedMs > 1 ? (cameraFps * elapsedMs) / 1000 : this.samples.length;
    const estimatedDroppedProcessingFrames = Math.max(0, Math.round(expectedFrames - Math.max(0, this.samples.length - 1)));
    const qualityIssues: CaptureQualityIssue[] = [];

    if (meanPoseConfidence !== null && meanPoseConfidence < 0.7) {
      qualityIssues.push({ code: "low-pose-confidence", message: "Pose tracking confidence is low. Improve framing, lighting, or camera position." });
    }
    if (confidenceStdDev !== null && confidenceStdDev > 0.12) {
      qualityIssues.push({ code: "unstable-pose-confidence", message: "Tracking confidence is fluctuating. Reduce occlusion or camera movement." });
    }
    const lagThreshold = cameraFps ? Math.min(18, cameraFps * 0.65) : 18;
    if (processingFps > 0 && processingFps < lagThreshold) {
      qualityIssues.push({ code: "processing-lag", message: "Pose processing is running below the preferred real-time rate." });
    }
    if (averageInferenceLatencyMs > 45) {
      qualityIssues.push({ code: "high-inference-latency", message: "Pose inference latency is elevated on this device." });
    }

    return {
      processingFps,
      averageInferenceLatencyMs,
      estimatedDroppedProcessingFrames,
      meanPoseConfidence,
      confidenceStdDev,
      poseCenterJitter,
      qualityIssues,
      recommendLowerProcessingResolution:
        targetResolution === "1080p" && processingFps > 0 && processingFps < 18,
    };
  }
}
