import registryJson from "../../data/measurement-validation-registry.json";
import type { AngleName } from "./angles";

export type MeasurementValidationStatus =
  | "experimental"
  | "research"
  | "internally-validated"
  | "reference-validated"
  | "externally-validated";

export type MeasurementKind = "measurement" | "proxy";

export type EmpiricalMeasurementUncertainty = {
  sourceReportId: string;
  cameraMeasurementVersion: string;
  nParticipants: number;
  maeDeg: number;
  rmseDeg: number;
  biasDeg: number;
  sdErrorDeg: number;
  lower95LimitOfAgreementDeg: number;
  upper95LimitOfAgreementDeg: number;
  semDeg: number | null;
  mdc95Deg: number | null;
  uncertaintyDisplayDeg: number;
  uncertaintyDisplayMethod: "mae" | "mdc95" | "half-limit-of-agreement-span";
};

export type MeasurementValidationEntry = {
  id: AngleName;
  label: string;
  kind: MeasurementKind;
  unit: "deg";
  requiredViews: Array<"front" | "side">;
  status: MeasurementValidationStatus;
  patientLabel: "Validated measurement" | "Experimental measurement";
  referenceMethods: string[];
  latestValidation: null | {
    reportId: string;
    referenceSystem: string;
    reviewedAt: string;
  };
  empiricalUncertainty: EmpiricalMeasurementUncertainty | null;
  proxyFor?: string;
  notEquivalentTo?: string[];
};

export type MeasurementValidationRegistry = {
  schemaVersion: string;
  cameraMeasurementVersion: string;
  statusOrder: MeasurementValidationStatus[];
  patientStatusRules: {
    validatedStatuses: MeasurementValidationStatus[];
    validatedLabel: "Validated measurement";
    experimentalLabel: "Experimental measurement";
  };
  interpretation: {
    poseConfidenceIsMeasurementAccuracy: false;
    measurementUncertaintyMustBeEmpirical: true;
    automaticClinicalAcceptanceThresholds: false;
    note: string;
  };
  metrics: MeasurementValidationEntry[];
};

export const MEASUREMENT_VALIDATION_REGISTRY =
  registryJson as unknown as MeasurementValidationRegistry;

const byId = new Map(
  MEASUREMENT_VALIDATION_REGISTRY.metrics.map((metric) => [metric.id, metric] as const),
);

export function getMeasurementValidationEntry(
  angleName: AngleName,
): MeasurementValidationEntry {
  const metric = byId.get(angleName);
  if (!metric) {
    throw new Error(`No measurement-validation registry entry exists for ${angleName}.`);
  }
  return metric;
}

export function isPatientValidatedMeasurement(
  status: MeasurementValidationStatus,
): boolean {
  return MEASUREMENT_VALIDATION_REGISTRY.patientStatusRules.validatedStatuses.includes(status);
}

export function patientMeasurementStatusLabel(
  angleName: AngleName,
): "Validated measurement" | "Experimental measurement" {
  const metric = getMeasurementValidationEntry(angleName);
  return isPatientValidatedMeasurement(metric.status)
    ? MEASUREMENT_VALIDATION_REGISTRY.patientStatusRules.validatedLabel
    : MEASUREMENT_VALIDATION_REGISTRY.patientStatusRules.experimentalLabel;
}

export function measurementUncertaintyLabel(
  angleName: AngleName,
): string | null {
  const uncertainty = getMeasurementValidationEntry(angleName).empiricalUncertainty;
  if (!uncertainty) return null;
  return `±${uncertainty.uncertaintyDisplayDeg.toFixed(1)}°`;
}

export function assertMeasurementValidationRegistryIntegrity(): void {
  const ids = new Set<string>();
  for (const metric of MEASUREMENT_VALIDATION_REGISTRY.metrics) {
    if (ids.has(metric.id)) throw new Error(`Duplicate measurement metric ${metric.id}.`);
    ids.add(metric.id);

    const validated = isPatientValidatedMeasurement(metric.status);
    const expected = validated ? "Validated measurement" : "Experimental measurement";
    if (metric.patientLabel !== expected) {
      throw new Error(
        `${metric.id} patientLabel must be ${expected} for status ${metric.status}.`,
      );
    }

    if (metric.empiricalUncertainty) {
      const uncertainty = metric.empiricalUncertainty;
      if (uncertainty.cameraMeasurementVersion !== MEASUREMENT_VALIDATION_REGISTRY.cameraMeasurementVersion) {
        throw new Error(`${metric.id} uncertainty measurement version does not match registry version.`);
      }
      if (uncertainty.nParticipants < 1 || uncertainty.uncertaintyDisplayDeg < 0) {
        throw new Error(`${metric.id} contains invalid empirical uncertainty metadata.`);
      }
    }
  }
}

assertMeasurementValidationRegistryIntegrity();
