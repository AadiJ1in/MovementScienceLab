import { describe, expect, it } from "vitest";
import {
  MEASUREMENT_VALIDATION_REGISTRY,
  assertMeasurementValidationRegistryIntegrity,
  getMeasurementValidationEntry,
  measurementUncertaintyLabel,
  patientMeasurementStatusLabel,
} from "./measurement-validation";

const CURRENT_BROWSER_METRICS = [
  "leftKneeFlexion",
  "rightKneeFlexion",
  "leftKneeFrontalDeviation",
  "rightKneeFrontalDeviation",
  "trunkLean",
  "pelvicLineObliquity",
  "leftShoulderElevation",
  "rightShoulderElevation",
  "leftElbowFlexion",
  "rightElbowFlexion",
] as const;

describe("measurement validation registry", () => {
  it("covers every current browser angle metric exactly once", () => {
    expect(() => assertMeasurementValidationRegistryIntegrity()).not.toThrow();
    const ids = MEASUREMENT_VALIDATION_REGISTRY.metrics.map((metric) => metric.id).sort();
    expect(ids).toEqual([...CURRENT_BROWSER_METRICS].sort());
  });

  it("does not manufacture empirical uncertainty before reference data exist", () => {
    for (const metric of CURRENT_BROWSER_METRICS) {
      expect(getMeasurementValidationEntry(metric).empiricalUncertainty).toBeNull();
      expect(measurementUncertaintyLabel(metric)).toBeNull();
    }
  });

  it("keeps patient-facing status conservative until reference validation exists", () => {
    for (const metric of CURRENT_BROWSER_METRICS) {
      expect(patientMeasurementStatusLabel(metric)).toBe("Experimental measurement");
    }
  });

  it("keeps known projection proxies explicitly separate from laboratory 3D constructs", () => {
    const knee = getMeasurementValidationEntry("leftKneeFrontalDeviation");
    expect(knee.kind).toBe("proxy");
    expect(knee.notEquivalentTo).toContain("3d-knee-abduction-angle");

    const pelvis = getMeasurementValidationEntry("pelvicLineObliquity");
    expect(pelvis.kind).toBe("proxy");
    expect(pelvis.notEquivalentTo).toContain("clinical-pelvic-tilt");
  });
});
