import Link from "next/link";

const PIPELINE = [
  ["1. Capture", "Explicitly enabled browser webcam capture. Raw video is not persisted by default."],
  ["2. Pose estimation", "MediaPipe Pose Landmarker estimates 33 landmarks. Low-visibility landmarks are excluded from downstream measurements."],
  ["3. Camera-quality gate", "The selected exercise/view must satisfy positioning and visibility requirements before recording is treated as usable."],
  ["4. Kinematics", "Deterministic 2D joint-angle and trajectory calculations are derived from trusted landmarks."],
  ["5. Exercise-specific analysis", "Only measurements compatible with the selected view and exercise are evaluated. Unsupported combinations fail closed."],
  ["6. Research model or rule", "Research-only models and sourced rules may flag resemblance to known movement-deviation patterns; they do not diagnose injury."],
  ["7. Uncertainty gate", "Missing, low-confidence, out-of-domain, or incompatible inputs produce an uncertain/unavailable result rather than a forced classification."],
  ["8. Human interpretation", "Clinicians decide whether the movement information is clinically meaningful and whether further examination is appropriate."],
] as const;

const VALIDATION_LAYERS = [
  {
    title: "Engineering validation",
    detail:
      "Automated tests verify deterministic calculations, camera-guidance logic, rep segmentation behavior, data integrity, and fail-closed conditions. This verifies software behavior, not medical effectiveness.",
  },
  {
    title: "Dataset validation",
    detail:
      "Research models are evaluated with subject-grouped splits so repetitions from the same person do not leak across train and validation folds. AUROC, balanced accuracy, sensitivity, specificity, calibration/Brier score, and confusion matrices are tracked.",
  },
  {
    title: "Webcam-domain validation",
    detail:
      "Required before model promotion because source rehabilitation datasets and a consumer monocular webcam are different measurement domains. Device, browser, camera angle, clothing, occlusion, lighting, and body-size effects must be tested directly.",
  },
  {
    title: "External clinical validation",
    detail:
      "Required on participants and sites not used for model development, with prespecified endpoints, confidence intervals, subgroup reporting, clinician-defined ground truth, and prospective protocols where future outcomes are claimed.",
  },
] as const;

export default function MethodologyPage() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Movement Science Lab
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Measurement & validation methodology
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-600">
            This page documents how movement data are captured, measured, rejected when unreliable,
            and evaluated before any model is considered for broader use. It intentionally separates
            software validation from clinical validation.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
              Back to analysis
            </Link>
            <Link href="/validation" className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
              Clinical validation status
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Analysis pipeline</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {PIPELINE.map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {VALIDATION_LAYERS.map((item) => (
            <article key={item.title} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{item.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Measurement semantics</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Output</th>
                  <th className="px-4 py-3 font-medium">What it means</th>
                  <th className="px-4 py-3 font-medium">What it does not mean</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <MeasurementRow
                  output="Knee flexion"
                  means="2D angle derived from visible hip, knee, and ankle landmarks in a compatible camera view."
                  not="Direct cartilage load, ligament strain, joint torque, or 3D knee mechanics."
                />
                <MeasurementRow
                  output="Frontal knee deviation"
                  means="A 2D projection-based alignment proxy from webcam landmarks."
                  not="A diagnosis of dynamic valgus/varus or a direct ACL injury-risk percentage."
                />
                <MeasurementRow
                  output="Trunk lean"
                  means="Projected torso orientation relative to the image frame using visible shoulder/hip landmarks."
                  not="A laboratory-grade 3D trunk angle when the person rotates out of plane."
                />
                <MeasurementRow
                  output="Pelvic-line obliquity"
                  means="Orientation of the line between MediaPipe hip landmarks in the image plane."
                  not="True ASIS/PSIS-based clinical pelvic tilt. BlazePose does not expose those anatomical landmarks."
                />
                <MeasurementRow
                  output="Reference similarity"
                  means="Similarity of a compatible movement trajectory to a defined reference trajectory."
                  not="Proof that a movement is safe, unsafe, injured, or injury-free."
                />
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm">
          <h2 className="text-xl font-semibold">Non-negotiable release rule</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-300">
            A more complex model is not promoted merely because it exists. It must outperform the
            simpler alternative on unseen people, remain calibrated, preserve clinically important
            sensitivity and specificity, survive webcam-domain testing, and pass independent validation.
            If evidence is insufficient, the system reports uncertainty or blocks the model.
          </p>
        </section>
      </div>
    </main>
  );
}

function MeasurementRow({ output, means, not }: { output: string; means: string; not: string }) {
  return (
    <tr>
      <td className="px-4 py-4 font-medium text-zinc-950">{output}</td>
      <td className="px-4 py-4 leading-6 text-zinc-600">{means}</td>
      <td className="px-4 py-4 leading-6 text-zinc-600">{not}</td>
    </tr>
  );
}
