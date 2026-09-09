"use client";

import { useMemo, useState } from "react";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import { compareRepToReference, scoreRepAgainstReference } from "@/lib/biomechanics/dtw";

export type ReferenceTrajectoryFile = {
  angleName: AngleName;
  values: number[];
  sourceLabel: string;
  deviationBoundary?: number;
};

export function ReferenceComparisonPanel({
  angleName,
  readings,
}: {
  angleName: AngleName;
  readings: AngleReading[];
}) {
  const [reference, setReference] = useState<ReferenceTrajectoryFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const referenceMatchesMetric = reference?.angleName === angleName;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ReferenceTrajectoryFile>;
      if (parsed.angleName !== angleName) {
        throw new Error(`Reference angleName must match ${angleName}.`);
      }
      if (!Array.isArray(parsed.values) || parsed.values.length < 3 || !parsed.values.every(Number.isFinite)) {
        throw new Error("Reference values must be an array of at least 3 finite numbers.");
      }
      if (!parsed.sourceLabel?.trim()) {
        throw new Error("Reference sourceLabel is required so trajectory provenance is explicit.");
      }
      if (parsed.deviationBoundary !== undefined && !Number.isFinite(parsed.deviationBoundary)) {
        throw new Error("deviationBoundary must be numeric when supplied.");
      }
      setReference(parsed as ReferenceTrajectoryFile);
      setMessage(null);
    } catch (error) {
      setReference(null);
      setMessage(error instanceof Error ? error.message : "Could not load reference trajectory.");
    }
  }

  const result = useMemo(() => {
    if (!reference || reference.angleName !== angleName) return null;
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
  }, [angleName, readings, reference]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Reference-form comparison</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Load a labeled angle trajectory with provenance and compare the current captured trajectory with DTW. The score is form deviation, not injury probability.
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
        <div className="mt-3 text-xs text-zinc-600">
          Reference: {reference.sourceLabel} · {reference.values.length} samples
        </div>
      )}
      {reference && !referenceMatchesMetric && (
        <p className="mt-3 text-xs text-zinc-600">
          The previous reference belongs to another metric. Import a reference for {angleName} before comparing.
        </p>
      )}
      {result && (
        <div className="mt-3 rounded-xl bg-white p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">DTW normalized distance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">{result.score.toFixed(2)}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {result.interpretation
              ? `${result.interpretation}. The supplied boundary must be independently validated.`
              : "No classification boundary supplied; displaying similarity/deviation score only."}
          </p>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
