import type { AngleName } from "./angles";
import { ANGLE_NAMES_BY_VIEW } from "./measurement-profile";
import type { CaptureView } from "@/lib/pose/types";

export type ReferenceTrajectory = {
  angleName: AngleName;
  captureView: CaptureView;
  values: number[];
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
  deviationBoundary?: number;
  deviationBoundarySourceLabel?: string;
  deviationBoundarySourceUrl?: string;
};

function assertHttpUrl(value: string, field: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${field} must use http or https.`);
  }
}

export function parseReferenceTrajectory(
  input: unknown,
  expectedAngleName?: AngleName,
  expectedCaptureView?: CaptureView,
): ReferenceTrajectory {
  if (!input || typeof input !== "object") {
    throw new Error("Reference trajectory must be a JSON object.");
  }

  const parsed = input as Partial<ReferenceTrajectory>;
  if (!parsed.angleName) throw new Error("Reference angleName is required.");
  if (parsed.captureView !== "front" && parsed.captureView !== "side") {
    throw new Error('Reference captureView must be "front" or "side".');
  }
  if (!ANGLE_NAMES_BY_VIEW[parsed.captureView].includes(parsed.angleName)) {
    throw new Error(
      `Reference ${parsed.angleName} is not valid for ${parsed.captureView}-view capture.`,
    );
  }
  if (expectedAngleName && parsed.angleName !== expectedAngleName) {
    throw new Error(`Reference angleName must match ${expectedAngleName}.`);
  }
  if (expectedCaptureView && parsed.captureView !== expectedCaptureView) {
    throw new Error(`Reference captureView must match ${expectedCaptureView}.`);
  }
  if (
    !Array.isArray(parsed.values) ||
    parsed.values.length < 3 ||
    !parsed.values.every((value) => Number.isFinite(value))
  ) {
    throw new Error("Reference values must be an array of at least 3 finite numbers.");
  }
  if (!parsed.sourceLabel?.trim()) {
    throw new Error("Reference sourceLabel is required so trajectory provenance is explicit.");
  }
  if (!parsed.sourceUrl?.trim()) throw new Error("Reference sourceUrl is required.");
  assertHttpUrl(parsed.sourceUrl, "sourceUrl");
  if (!parsed.sourceMeasurementMethod?.trim()) {
    throw new Error("Reference sourceMeasurementMethod is required.");
  }

  if (parsed.deviationBoundary !== undefined) {
    if (!Number.isFinite(parsed.deviationBoundary) || parsed.deviationBoundary < 0) {
      throw new Error("deviationBoundary must be a non-negative number when supplied.");
    }
    if (!parsed.deviationBoundarySourceLabel?.trim() || !parsed.deviationBoundarySourceUrl?.trim()) {
      throw new Error(
        "A deviationBoundary requires deviationBoundarySourceLabel and deviationBoundarySourceUrl; arbitrary classification cutoffs are not accepted.",
      );
    }
    assertHttpUrl(parsed.deviationBoundarySourceUrl, "deviationBoundarySourceUrl");
  }

  return parsed as ReferenceTrajectory;
}
