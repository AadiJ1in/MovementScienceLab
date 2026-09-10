"use client";

import { useMemo, useState } from "react";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import { compareRepToReference, scoreRepAgainstReference } from "@/lib/biomechanics/dtw";
import type { CaptureView } from "@/lib/pose/types";

export type ReferenceTrajectoryFile = {
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

export function ReferenceComparisonPanel({
  angleName,
  captureView,
  readings,
}: {
  angleName: AngleName;
  captureView: CaptureView;
  readings: AngleReading[];
}) {
  const [reference, setReference] = useState<ReferenceTrajectoryFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const referenceMatchesMetric =
    reference?.angleName === angleName && reference?.captureView === captureView;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ReferenceTrajectoryFile>;
      if (parsed.angleName !== angleName) {
        throw new Error(`Reference angleName must match ${angleName}.`);
      }
      if (parsed.captureView !== captureView) {
        throw new Error(`Reference captureView must match ${captureView}.`);
      }
      if (!Array.isArray(parsed.values) || parsed.values.length < 3 || !parsed.values.every(Number.isFinite)) {
        throw new Error("Reference values must be an array of at least 3 finite numbers.");
      }
      if (!parsed.sourceLabel?.trim()) {
        throw new Error("Reference sourceLabel is required so trajectory provenance is explicit.");
      }
      if (!parsed.sourceUrl?.trim()) {
        throw new Error("Reference sourceUrl is required.");
      }
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

      setReference(parsed as ReferenceTrajectoryFile);
      setMessage(null);
    } catch (error) {
      setReference(null);
      setMessage(error instanceof Error ? error.message : "Could not load reference trajectory.");
    }
  }

  const result = useMemo(() => {
    if (
      !reference ||
      reference.angleName !== angleName ||
      reference.captureView !== captureView
    ) {
      return null;
    }
    const sample = readings.map((reading) => reading.value);
    if (sample.length < 3) return null;

    if (reference.deviationBoundary !== undefined) {
      const comparison = compareRepToReference(
        angleName,
        sample,
        reference.values,
        reference.deviationBoundary,
      );
      return {
        score: comparison.normalizedDistance,
        interpretation: comparison.interpretation,
      };
    }

    return {
      score: scoreRepAgainstReference(angleName, sample, reference.values).normalizedDistance,
      interpretation: null,
    };
  }, [angleName, captureView, readings, reference]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Reference-form comparison</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-600">
            Load a labeled trajectory measured for the same metric and camera projection. DTW reports
            reference-form deviation, not injury probability. Classification is enabled only when the
            supplied deviation boundary has its own explicit source provenance.
          </p>
        </div>
        <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
          Import reference
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
      </div>

      {reference && referenceMatchesMetric && (
        <div className="mt-3 text-xs leading-5 text-zinc-600">
          Reference: {reference.sourceLabel} · {reference.values.length} samples · {reference.captureView} view
          <br />
          Source measurement: {reference.sourceMeasurementMethod}
        </div>
      )}
      {reference && !referenceMatchesMetric && (
        <p className="mt-3 text-xs text-zinc-600">
          The previous reference belongs to another metric or camera view. Import a {captureView}-view
          reference for {angleName} before comparing.
        </p>
      )}
      {result && (
        <div className="mt-3 rounded-xl bg-white p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">DTW normalized distance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">{result.score.toFixed(2)}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {result.interpretation
              ? `${result.interpretation}. Classification uses the explicitly sourced boundary supplied with this reference file.`
              : "No sourced classification boundary supplied; displaying similarity/deviation score only."}
          </p>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
