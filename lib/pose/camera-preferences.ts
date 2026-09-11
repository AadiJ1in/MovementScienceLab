export const CAMERA_PROFILE_STORAGE_KEY = "movement-science-camera-profile-v1";

export type CameraTargetResolution = "720p" | "1080p";

export type CameraPreference = {
  deviceId?: string;
  facingMode: "user" | "environment";
  targetResolution: CameraTargetResolution;
};

export const DEFAULT_CAMERA_PREFERENCE: CameraPreference = {
  facingMode: "user",
  targetResolution: "720p",
};

export function parseCameraPreference(raw: string | null | undefined): CameraPreference {
  if (!raw) return DEFAULT_CAMERA_PREFERENCE;
  try {
    const value = JSON.parse(raw) as Partial<CameraPreference>;
    const facingMode = value.facingMode === "environment" ? "environment" : "user";
    const targetResolution = value.targetResolution === "1080p" ? "1080p" : "720p";
    const deviceId = typeof value.deviceId === "string" && value.deviceId.trim() ? value.deviceId.trim() : undefined;
    return { facingMode, targetResolution, ...(deviceId ? { deviceId } : {}) };
  } catch {
    return DEFAULT_CAMERA_PREFERENCE;
  }
}

export function buildCameraConstraints(preference: CameraPreference): MediaTrackConstraints {
  const dimensions =
    preference.targetResolution === "1080p"
      ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

  return {
    ...dimensions,
    frameRate: { ideal: 30, min: 20 },
    ...(preference.deviceId
      ? { deviceId: { exact: preference.deviceId } }
      : { facingMode: { ideal: preference.facingMode } }),
  };
}

export function withoutExactDevice(preference: CameraPreference): CameraPreference {
  return {
    facingMode: preference.facingMode,
    targetResolution: preference.targetResolution,
  };
}
