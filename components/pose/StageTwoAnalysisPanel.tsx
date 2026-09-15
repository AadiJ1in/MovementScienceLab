"use client";

import type {
  StageTwoAnalysisSnapshot,
  StageTwoMetricSummary,
} from "@/lib/biomechanics/stage-two-analysis";

export function StageTwoAnalysisPanel({
  analysis,
}: {
  analysis: StageTwoAnalysisSnapshot | null;
}) {
  const primary = choosePrimaryMetric(analysis);
  const consistency = analysis?.consistency;
  const recentReps = analysis?.completedReps.slice(-6).reverse() ?? [];

  return (
    <section className="overflow-hidden border border-zinc-300 bg-white shadow-[0_18px_60px_rgba(24,24,27,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 bg-[#13201b] px-5 py-4 text-white sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
            Stage 2 · Movement measurement
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            Joint motion, repetition, and tempo analysis
          </h2>
        </div>
        <div className="border border-white/15 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
          Measurement only · no risk classification
        </div>
      </div>

      <div className="grid gap-px bg-zinc-200 md:grid-cols-2 xl:grid-cols-4">
        <AnalysisMetric
          label="Completed reps"
          value={consistency ? String(consistency.repCount) : "—"}
          detail={
            analysis?.selectedSignalAngle
              ? `${humanizeCamel(analysis.selectedSignalAngle)} selected for cycle segmentation.`
              : "Rep segmentation activates only for supported exercise profiles."
          }
        />
        <AnalysisMetric
          label={primary?.label ?? "Primary measurement"}
          value={formatDegrees(primary?.currentDeg)}
          detail={
            primary?.rawCurrentDeg !== null && primary?.rawCurrentDeg !== undefined
              ? `Raw ${formatDegrees(primary.rawCurrentDeg)} · One Euro filtered display.`
              : "Waiting for trusted landmarks."
          }
        />
        <AnalysisMetric
          label="Session excursion"
          value={formatDegrees(primary?.sessionRangeDeg)}
          detail="Maximum minus minimum filtered projection during this capture session."
        />
        <AnalysisMetric
          label="Mean rep duration"
          value={
            consistency?.meanRepDurationMs !== null &&
            consistency?.meanRepDurationMs !== undefined
              ? `${(consistency.meanRepDurationMs / 1000).toFixed(2)} s`
              : "—"
          }
          detail={
            consistency?.meanCadenceRpm !== null &&
            consistency?.meanCadenceRpm !== undefined
              ? `${consistency.meanCadenceRpm.toFixed(1)} cycles/min mean cadence.`
              : "Available after a completed supported movement cycle."
          }
        />
      </div>

      <div className="grid gap-px bg-zinc-200 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
        <div className="bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Live kinematics
              </p>
              <h3 className="mt-1 text-base font-semibold text-zinc-950">
                Filtered 2D projection measurements
              </h3>
            </div>
            <span className="text-xs text-zinc-500">
              {analysis
                ? `${Math.round(analysis.measurementFrameFraction * 100)}% frames with usable measurements`
                : "Waiting for capture"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Measurement</th>
                  <th className="px-4 py-3 font-semibold">Filtered</th>
                  <th className="px-4 py-3 font-semibold">Raw</th>
                  <th className="px-4 py-3 font-semibold">Session min</th>
                  <th className="px-4 py-3 font-semibold">Session max</th>
                  <th className="px-4 py-3 font-semibold">Range</th>
                  <th className="px-4 py-3 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {analysis?.metricSummaries.some((metric) => metric.samples > 0) ? (
                  analysis.metricSummaries
                    .filter((metric) => metric.samples > 0)
                    .map((metric) => (
                      <tr key={metric.angleName}>
                        <td className="px-5 py-3 font-medium text-zinc-950">{metric.label}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-zinc-950">
                          {formatDegrees(metric.currentDeg)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatDegrees(metric.rawCurrentDeg)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatDegrees(metric.sessionMinDeg)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatDegrees(metric.sessionMaxDeg)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatDegrees(metric.sessionRangeDeg)}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {metric.meanConfidence === null
                            ? "—"
                            : metric.meanConfidence.toFixed(3)}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-zinc-500">
                      Enable the camera and keep the required joints visible to begin Stage 2 measurement.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="bg-[#f6f7f5] p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Signal processing
          </p>
          <h3 className="mt-2 text-base font-semibold text-zinc-950">Adaptive One Euro filter</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Slow or stationary measurements receive stronger smoothing to reduce landmark jitter. During faster movement, the cutoff rises so the signal can follow the motion with less lag than a fixed moving average.
          </p>
          <dl className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200 text-xs">
            <FilterRow label="Minimum cutoff" value={analysis ? `${analysis.filter.minCutoffHz.toFixed(2)} Hz` : "1.20 Hz"} />
            <FilterRow label="Speed response β" value={analysis ? analysis.filter.beta.toFixed(3) : "0.035"} />
            <FilterRow label="Derivative cutoff" value={analysis ? `${analysis.filter.derivativeCutoffHz.toFixed(2)} Hz` : "1.00 Hz"} />
            <FilterRow label="Tracking-gap reset" value={analysis ? `${analysis.filter.resetGapMs} ms` : "750 ms"} />
          </dl>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            These are engineering filter parameters. They are not normal ranges, clinical cutoffs, or injury-risk thresholds.
          </p>
        </aside>
      </div>

      <div className="grid gap-px bg-zinc-200 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
        <div className="bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Completed cycles
            </p>
            <h3 className="mt-1 text-base font-semibold text-zinc-950">Rep-by-rep timing and excursion</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Rep</th>
                  <th className="px-4 py-3 font-semibold">Signal</th>
                  <th className="px-4 py-3 font-semibold">Excursion</th>
                  <th className="px-4 py-3 font-semibold">Outbound</th>
                  <th className="px-4 py-3 font-semibold">Return</th>
                  <th className="px-4 py-3 font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Cadence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {recentReps.length ? (
                  recentReps.map((rep) => (
                    <tr key={rep.repIndex}>
                      <td className="px-5 py-3 font-semibold text-zinc-950">#{rep.repIndex}</td>
                      <td className="px-4 py-3">{rep.signalLabel}</td>
                      <td className="px-4 py-3 tabular-nums">{rep.excursionDegrees.toFixed(1)}°</td>
                      <td className="px-4 py-3 tabular-nums">{(rep.outboundDurationMs / 1000).toFixed(2)} s</td>
                      <td className="px-4 py-3 tabular-nums">{(rep.returnDurationMs / 1000).toFixed(2)} s</td>
                      <td className="px-4 py-3 tabular-nums">{(rep.durationMs / 1000).toFixed(2)} s</td>
                      <td className="px-4 py-3 tabular-nums">{rep.cadenceRpm.toFixed(1)}/min</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-zinc-500">
                      No completed supported movement cycles yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="bg-[#111413] p-5 text-white sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Tempo consistency
          </p>
          <h3 className="mt-2 text-lg font-semibold">Transparent variability metrics</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Consistency is reported as coefficient of variation (CV), not converted into a proprietary score. Lower CV means the captured reps were more similar to one another.
          </p>
          <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-xs">
            <FilterRow
              dark
              label="Rep count"
              value={consistency ? String(consistency.repCount) : "—"}
            />
            <FilterRow
              dark
              label="Duration CV"
              value={formatPercent(consistency?.durationCoefficientOfVariationPct)}
            />
            <FilterRow
              dark
              label="Excursion CV"
              value={formatPercent(consistency?.excursionCoefficientOfVariationPct)}
            />
            <FilterRow
              dark
              label="Selected side"
              value={analysis?.selectedSide ? humanizeCamel(analysis.selectedSide) : "—"}
            />
          </dl>
          <div className="mt-5 border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-white/55">
            Rep segmentation uses hysteresis, a return-to-baseline check, minimum excursion, timing bounds, tracking confidence, and a tracking-gap reset. These parameters prevent obvious jitter cycles from becoming reps; they are not clinical movement-quality thresholds.
          </div>
        </aside>
      </div>

      <div className="border-t border-zinc-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-950 sm:px-6">
        <span className="font-semibold">Clinical boundary:</span> these values are monocular 2D projection estimates derived from MediaPipe landmarks. They can support measurement and research workflows, but they are not validated clinical goniometry, diagnosis, injury prediction, or treatment guidance. Stage 3 risk thresholds remain disabled.
      </div>
    </section>
  );
}

function choosePrimaryMetric(
  analysis: StageTwoAnalysisSnapshot | null,
): StageTwoMetricSummary | null {
  if (!analysis) return null;
  if (analysis.selectedSignalAngle) {
    const selected = analysis.metricSummaries.find(
      (metric) => metric.angleName === analysis.selectedSignalAngle,
    );
    if (selected) return selected;
  }
  return analysis.metricSummaries.find((metric) => metric.samples > 0) ?? null;
}

function AnalysisMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-h-[148px] bg-white p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

function FilterRow({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 py-3">
      <dt className={dark ? "text-white/40" : "text-zinc-500"}>{label}</dt>
      <dd className={dark ? "font-medium text-white/80 tabular-nums" : "font-medium text-zinc-900 tabular-nums"}>{value}</dd>
    </div>
  );
}

function formatDegrees(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(1)}°`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(1)}%`;
}

function humanizeCamel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}
