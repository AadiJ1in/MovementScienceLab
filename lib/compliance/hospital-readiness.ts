export type HospitalReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  category: "infrastructure" | "security" | "privacy" | "clinical" | "regulatory";
};

export type HospitalReadinessStatus = {
  hospitalModeRequested: boolean;
  readyForHospitalProduction: boolean;
  deploymentClass: "research-pilot" | "hospital-production-blocked" | "hospital-production";
  checks: HospitalReadinessCheck[];
};

function envTrue(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export function getHospitalReadinessStatus(): HospitalReadinessStatus {
  const hospitalModeRequested = envTrue("HOSPITAL_MODE");

  const checks: HospitalReadinessCheck[] = [
    {
      id: "dedicated-backend",
      label: "Dedicated hospital backend is configured and isolated from development/startup data",
      passed: envTrue("HOSPITAL_DEDICATED_BACKEND_CONFIRMED"),
      category: "infrastructure",
    },
    {
      id: "vercel-baa",
      label: "Hosting BAA and applicable enterprise/compliance terms are executed",
      passed: envTrue("HOSPITAL_HOSTING_BAA_CONFIRMED"),
      category: "privacy",
    },
    {
      id: "database-baa",
      label: "Database/storage BAA and HIPAA-capable configuration are executed",
      passed: envTrue("HOSPITAL_DATABASE_BAA_CONFIRMED"),
      category: "privacy",
    },
    {
      id: "mfa-rbac",
      label: "MFA, least-privilege RBAC, clinician/patient authorization, and admin separation are verified",
      passed: envTrue("HOSPITAL_ACCESS_CONTROL_REVIEW_CONFIRMED"),
      category: "security",
    },
    {
      id: "audit-integrity",
      label: "Audit logging, tamper resistance, retention, backup, recovery, and integrity controls are verified",
      passed: envTrue("HOSPITAL_AUDIT_SECURITY_REVIEW_CONFIRMED"),
      category: "security",
    },
    {
      id: "security-assessment",
      label: "Threat model, dependency review, vulnerability testing, incident response, and security sign-off are complete",
      passed: envTrue("HOSPITAL_SECURITY_REVIEW_CONFIRMED"),
      category: "security",
    },
    {
      id: "privacy-review",
      label: "PHI data flow, minimum-necessary use, consent, retention/deletion, and vendor subprocessors are reviewed",
      passed: envTrue("HOSPITAL_PRIVACY_REVIEW_CONFIRMED"),
      category: "privacy",
    },
    {
      id: "camera-domain-validation",
      label: "Production webcam/MediaPipe measurement pipeline is validated against the intended clinical population",
      passed: envTrue("HOSPITAL_CAMERA_VALIDATION_CONFIRMED"),
      category: "clinical",
    },
    {
      id: "external-model-validation",
      label: "AI model has external validation on independent subjects/sites and prespecified performance targets",
      passed: envTrue("HOSPITAL_EXTERNAL_MODEL_VALIDATION_CONFIRMED"),
      category: "clinical",
    },
    {
      id: "clinical-human-factors",
      label: "Clinical workflow, human factors, failure modes, uncertainty handling, and clinician override are validated",
      passed: envTrue("HOSPITAL_CLINICAL_REVIEW_CONFIRMED"),
      category: "clinical",
    },
    {
      id: "regulatory-review",
      label: "Intended use and FDA/device-software regulatory pathway have been reviewed and documented",
      passed: envTrue("HOSPITAL_REGULATORY_REVIEW_CONFIRMED"),
      category: "regulatory",
    },
  ];

  const readyForHospitalProduction = hospitalModeRequested && checks.every((check) => check.passed);

  return {
    hospitalModeRequested,
    readyForHospitalProduction,
    deploymentClass: readyForHospitalProduction
      ? "hospital-production"
      : hospitalModeRequested
        ? "hospital-production-blocked"
        : "research-pilot",
    checks,
  };
}
