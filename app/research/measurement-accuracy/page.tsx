import Link from "next/link";
import { MEASUREMENT_VALIDATION_REGISTRY } from "@/lib/biomechanics/measurement-validation";

function number(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits);
}

function statusLabel(value: string) {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}

export default function MeasurementAccuracyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Research · Measurement accuracy</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Camera versus reference validation</h1>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              This dashboard separates camera tracking confidence from empirical measurement accuracy. A metric only receives error estimates after paired webcam-versus-reference data have been analyzed for the same measurement version. Empty cells mean the evidence has not been established yet; they are never filled from MediaPipe confidence.
            </p>
          </div>
          <Link href="/research" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700">Back to research</Link>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatusCard label="Measurement version" value={MEASUREMENT_VALIDATION_REGISTRY.cameraMeasurementVersion} />
          <StatusCard label="Registered metrics" value={String(MEASUREMENT_VALIDATION_REGISTRY.metrics.length)} />
          <StatusCard label="Reference-validated" value={String(MEASUREMENT_VALIDATION_REGISTRY.metrics.filter((metric) => metric.status === "reference-validated" || metric.status === "externally-validated").length)} />
          <StatusCard label="Automatic clinical cutoffs" value="None" />
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-6">
            <h2 className="text-xl font-semibold text-zinc-950">Metric validation registry</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
              MAE, RMSE, bias, limits of agreement, ICC(A,1), SEM, and MDC95 are populated only from an empirical paired-reference report. Device strata remain visible as a separate evidence dimension rather than being collapsed into a single confidence score.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1420px] text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Metric</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">MAE</th>
                  <th className="px-4 py-3 font-semibold">RMSE</th>
                  <th className="px-4 py-3 font-semibold">Bias</th>
                  <th className="px-4 py-3 font-semibold">95% LoA</th>
                  <th className="px-4 py-3 font-semibold">ICC(A,1)</th>
                  <th className="px-4 py-3 font-semibold">SEM</th>
                  <th className="px-4 py-3 font-semibold">MDC95</th>
                  <th className="px-4 py-3 font-semibold">Device strata</th>
                  <th className="px-4 py-3 font-semibold">Patient label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {MEASUREMENT_VALIDATION_REGISTRY.metrics.map((metric) => {
                  const result = metric.empiricalUncertainty;
                  return (
                    <tr key={metric.id} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-zinc-950">{metric.label}</p>
                        <p className="mt-1 font-mono text-[10px] text-zinc-400">{metric.id}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-600">{statusLabel(metric.kind)}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">{statusLabel(metric.status)}</span></td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result ? `${number(result.maeDeg)}°` : "—"}</td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result ? `${number(result.rmseDeg)}°` : "—"}</td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result ? `${number(result.biasDeg)}°` : "—"}</td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result ? `${number(result.lower95LimitOfAgreementDeg)}° to ${number(result.upper95LimitOfAgreementDeg)}°` : "—"}</td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result ? number(result.iccA1, 3) : "—"}</td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result?.semDeg !== null && result?.semDeg !== undefined ? `${number(result.semDeg)}°` : "—"}</td>
                      <td className="px-4 py-4 tabular-nums text-zinc-700">{result?.mdc95Deg !== null && result?.mdc95Deg !== undefined ? `${number(result.mdc95Deg)}°` : "—"}</td>
                      <td className="px-4 py-4 text-zinc-600">{result?.deviceStrata?.length ? result.deviceStrata.join(", ") : "Not yet reported"}</td>
                      <td className="px-4 py-4 text-zinc-700">{metric.patientLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Paired validation data contract</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Each record can carry participant/session identity, metric and side, webcam and reference values, measurement version, device, resolution, distance, condition, and capture view. Lighting and clothing/occlusion strata are also supported when the protocol collects them.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="/templates/camera-measurement-validation-template.csv" className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">CSV template</a>
              <a href="/templates/camera-measurement-validation-protocol.json" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700">Protocol template</a>
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Interpretation boundary</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
              <li>• Correlation is not agreement; Bland–Altman error and absolute-agreement ICC are reported separately.</li>
              <li>• Landmark confidence is capture confidence, not measurement error.</li>
              <li>• A 2D proxy is not automatically equivalent to a 3D laboratory quantity.</li>
              <li>• No universal acceptance threshold is built in; the research protocol must pre-specify one when required.</li>
              <li>• Measurement validation does not validate an injury-risk model.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}
