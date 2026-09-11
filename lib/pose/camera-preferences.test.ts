import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_PREFERENCE,
  buildCameraConstraints,
  parseCameraPreference,
  withoutExactDevice,
} from "./camera-preferences";

describe("camera preferences", () => {
  it("falls back safely for missing or invalid storage", () => {
    expect(parseCameraPreference(null)).toEqual(DEFAULT_CAMERA_PREFERENCE);
    expect(parseCameraPreference("not-json")).toEqual(DEFAULT_CAMERA_PREFERENCE);
  });

  it("restores a tested external camera profile", () => {
    const preference = parseCameraPreference(
      JSON.stringify({ deviceId: "camera-123", facingMode: "environment", targetResolution: "1080p" }),
    );
    expect(preference).toEqual({
      deviceId: "camera-123",
      facingMode: "environment",
      targetResolution: "1080p",
    });
    expect(buildCameraConstraints(preference)).toEqual({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, min: 20 },
      deviceId: { exact: "camera-123" },
    });
  });

  it("removes an unavailable exact device while preserving quality and facing preference", () => {
    const fallback = withoutExactDevice({
      deviceId: "missing-camera",
      facingMode: "environment",
      targetResolution: "720p",
    });
    expect(fallback).toEqual({ facingMode: "environment", targetResolution: "720p" });
    expect(buildCameraConstraints(fallback)).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, min: 20 },
      facingMode: { ideal: "environment" },
    });
  });
});
