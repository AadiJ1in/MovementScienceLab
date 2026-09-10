import { afterEach, describe, expect, it } from "vitest";
import { getHospitalReadinessStatus } from "./hospital-readiness";

const keys = [
  "HOSPITAL_MODE",
  "HOSPITAL_DEDICATED_BACKEND_CONFIRMED",
  "HOSPITAL_HOSTING_BAA_CONFIRMED",
  "HOSPITAL_DATABASE_BAA_CONFIRMED",
  "HOSPITAL_ACCESS_CONTROL_REVIEW_CONFIRMED",
  "HOSPITAL_AUDIT_SECURITY_REVIEW_CONFIRMED",
  "HOSPITAL_SECURITY_REVIEW_CONFIRMED",
  "HOSPITAL_PRIVACY_REVIEW_CONFIRMED",
  "HOSPITAL_CAMERA_VALIDATION_CONFIRMED",
  "HOSPITAL_EXTERNAL_MODEL_VALIDATION_CONFIRMED",
  "HOSPITAL_CLINICAL_REVIEW_CONFIRMED",
  "HOSPITAL_REGULATORY_REVIEW_CONFIRMED",
] as const;

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe("hospital readiness", () => {
  it("defaults to research-pilot rather than claiming hospital production", () => {
    const status = getHospitalReadinessStatus();
    expect(status.deploymentClass).toBe("research-pilot");
    expect(status.readyForHospitalProduction).toBe(false);
  });

  it("fails closed when hospital mode is requested with unmet gates", () => {
    process.env.HOSPITAL_MODE = "true";
    const status = getHospitalReadinessStatus();
    expect(status.deploymentClass).toBe("hospital-production-blocked");
    expect(status.readyForHospitalProduction).toBe(false);
  });

  it("requires every declared gate before hospital production is reported", () => {
    for (const key of keys) process.env[key] = "true";
    const status = getHospitalReadinessStatus();
    expect(status.checks.every((check) => check.passed)).toBe(true);
    expect(status.readyForHospitalProduction).toBe(true);
    expect(status.deploymentClass).toBe("hospital-production");
  });
});
