# Hospital Production Readiness

MovementScienceLab is currently suitable for research/pilot evaluation only. It must not be represented as a diagnostic, injury-prediction, FDA-cleared, or HIPAA-compliant product until the requirements below are completed and independently verified.

## Clinical scope
- Define intended use and excluded uses in writing.
- Keep the product clinician-supportive, not autonomous diagnostic decision-making.
- Separate movement-quality outputs from injury-risk claims.
- Require clinician review for any clinically meaningful interpretation.
- Maintain explicit single-camera 2D limitations and capture-quality requirements.

## Model validation
- Validate each model on participants excluded from training.
- Validate on an external dataset collected independently from the training source.
- Validate on the exact webcam + MediaPipe acquisition pipeline used in production.
- Report AUROC, AUPRC, sensitivity, specificity, balanced accuracy, calibration/Brier score, confidence intervals, subgroup results, and abstention/OOD performance.
- Freeze model/version, feature definitions, preprocessing, decision thresholds, training-data provenance, and validation reports for every production release.
- Never display movement-quality probability as injury probability.
- Maintain an uncertainty/abstention state when the sample is outside the validated domain.

## PHI and privacy
- Do not store raw webcam video or images by default.
- Document every PHI field, data flow, processor, subprocesser, log sink, backup, export, and retention period.
- Use only vendors/environments covered by appropriate BAAs when PHI is processed.
- Encrypt data in transit and at rest.
- Prevent PHI from entering analytics, crash reports, build logs, URLs, browser storage, or third-party telemetry unless explicitly approved and covered.
- Provide patient-data deletion, export, retention, and legal-hold procedures.

## Identity and access
- Enforce authenticated user identity server-side.
- Use least-privilege RBAC for patient, clinician, administrator, researcher, and support roles.
- Enforce tenant/patient isolation with database RLS and authorization checks on every object.
- Require MFA for workforce/clinician/admin accounts before hospital production.
- Define session expiration, device logout, account recovery, failed-login protections, and emergency-access procedures.
- Review all service-role and administrative credentials; none may be exposed to the browser.

## Auditability
- Maintain immutable audit events for sign-in, record reads, writes, exports, plan/model changes, administrative actions, and access-grant changes.
- Include actor, patient/tenant context, object, action, timestamp, request/session correlation ID, outcome, and model/version where applicable.
- Prevent normal application users from modifying or deleting audit history.
- Define audit-log retention and hospital export/review procedures.

## Application security
- Maintain dependency lockfiles and reproducible builds.
- Require tests, lint, typecheck, production build, and security checks before deployment.
- Add dependency vulnerability scanning, secret scanning, SAST, and periodic DAST/pentest coverage.
- Use CSP after MediaPipe runtime resources are fully enumerated and tested.
- Keep camera permission scoped to self; microphone/geolocation disabled unless clinically required.
- Add rate limiting and abuse controls to authentication and write endpoints.
- Define incident response, vulnerability disclosure, patch SLAs, backups, disaster recovery, and rollback procedures.

## Infrastructure
- Use a dedicated hospital/pilot Supabase project; do not reuse Axion production.
- Complete Supabase HIPAA/BAA and high-compliance configuration before PHI use.
- Use a Vercel plan/environment covered by the required agreement/BAA before PHI use.
- Separate development, staging, pilot, and production environments and credentials.
- Configure production domains, HTTPS, monitoring, error alerting, uptime checks, backups, PITR, and restore testing.

## Operational readiness
- Assign security/privacy ownership.
- Complete risk assessment and threat model.
- Maintain data-flow diagram, architecture diagram, inventory, subprocessors, policies, SOPs, change-control records, and training evidence.
- Create hospital onboarding/offboarding procedures.
- Run tabletop incident and disaster-recovery exercises.
- Obtain legal/regulatory review of intended use and whether FDA medical-device requirements apply.

## Release gate

A hospital-production release must be blocked unless all of the following are documented as complete:
1. BAA/compliant infrastructure for all PHI processors.
2. Independent security review and remediation of critical/high findings.
3. External + production-camera model validation for every enabled AI model.
4. Clinical intended-use and limitations approved.
5. Access control, audit logging, retention/deletion, backup/restore, monitoring, and incident-response procedures verified.
6. Exact release commit passes CI and staging end-to-end testing.
7. Production deployment is smoke-tested and monitored before patient enrollment.
