import { describe, expect, it } from "vitest";
import { CapturePerformanceMonitor } from "./capture-quality";

describe("CapturePerformanceMonitor", () => {
  it("reports stable real-time processing without quality warnings", () => {
    const monitor = new CapturePerformanceMonitor(3000);
    let snapshot = monitor.add({ timestampMs: 0, inferenceLatencyMs: 18, poseConfidence: 0.92 }, 30, "1080p");
    for (let index = 1; index <= 60; index += 1) {
      snapshot = monitor.add({ timestampMs: index * (1000 / 30), inferenceLatencyMs: 18, poseConfidence: 0.91 }, 30, "1080p");
    }
    expect(snapshot.processingFps).toBeGreaterThan(28);
    expect(snapshot.qualityIssues).toHaveLength(0);
    expect(snapshot.recommendLowerProcessingResolution).toBe(false);
  });

  it("recommends lower processing resolution when 1080p processing lags", () => {
    const monitor = new CapturePerformanceMonitor(3000);
    let snapshot = monitor.add({ timestampMs: 0, inferenceLatencyMs: 70, poseConfidence: 0.9 }, 30, "1080p");
    for (let index = 1; index <= 20; index += 1) {
      snapshot = monitor.add({ timestampMs: index * 100, inferenceLatencyMs: 70, poseConfidence: 0.9 }, 30, "1080p");
    }
    expect(snapshot.processingFps).toBeLessThan(18);
    expect(snapshot.recommendLowerProcessingResolution).toBe(true);
    expect(snapshot.qualityIssues.some((issue) => issue.code === "processing-lag")).toBe(true);
    expect(snapshot.qualityIssues.some((issue) => issue.code === "high-inference-latency")).toBe(true);
  });

  it("separates low/unstable pose confidence from processing performance", () => {
    const monitor = new CapturePerformanceMonitor(3000);
    const confidences = [0.95, 0.45, 0.9, 0.4, 0.92, 0.42, 0.9, 0.45];
    let snapshot = monitor.add({ timestampMs: 0, inferenceLatencyMs: 12, poseConfidence: confidences[0] }, 30, "720p");
    confidences.slice(1).forEach((confidence, index) => {
      snapshot = monitor.add({ timestampMs: (index + 1) * 33.33, inferenceLatencyMs: 12, poseConfidence: confidence }, 30, "720p");
    });
    expect(snapshot.confidenceStdDev ?? 0).toBeGreaterThan(0.12);
    expect(snapshot.qualityIssues.some((issue) => issue.code === "unstable-pose-confidence")).toBe(true);
  });
});
