const MODEL_ROWS = [
  {
    movement: "Leg abduction",
    reps: 116,
    subjects: 9,
    representation: "Temporal",
    auroc: 0.793,
    balancedAccuracy: 0.738,
    sensitivity: 0.604,
    specificity: 0.873,
    status: "Research candidate",
  },
  {
    movement: "Squat",
    reps: 98,
    subjects: 9,
    representation: "Static summary",
    auroc: 0.731,
    balancedAccuracy: 0.753,
    sensitivity: 0.769,
    specificity: 0.736,
    status: "Research candidate",
  },
  {
    movement: "Arm V/W",
    reps: 109,
    subjects: 9,
    representation: "Temporal",
    auroc: 0.732,
    balancedAccuracy: 0.709,
    sensitivity: 0.459,
    specificity: 0.958,
    status: "Blocked",
  },
  {
    movement: "Arm abduction",
    reps: 88,
    subjects: 8,
    representation: "Temporal",
    auroc: 0.677,
    balancedAccuracy: 0.645,
    sensitivity: 0.439,
    specificity: 0.851,
    status: "Blocked",
  },
  {
    movement: "Table push-up",
    reps: 107,
    subjects: 10,
    representation: "Static summary",
    auroc: 0.611,
    balancedAccuracy: 0.617,
    sensitivity: 0.6,
    specificity: 0.635,
    status: "Blocked",
  },
  {
    movement: "Lunge",
    reps: 88,
    subjects: 8,
    representation: "Temporal",
    auroc: 0.485,
    balancedAccuracy: 0.569,
    sensitivity: 0.163,
    specificity: 0.974,
    status: "Blocked",
  },
] as const;

const RELEASE_GATES = [
  "Dedicated clinical backend and signed BAAs wherever protected health information is handled",
  "MFA, role-based access, least privilege, auditable account lifecycle, and emergency access policy",
  "Immutable clinical/audit event trail plus documented retention, export, and deletion procedures",
  "Backups, point-in-time recovery, monitoring, incident response, dependency review, and penetration/security testing",
  "Independent webcam-domain validation on unseen participants and multiple devices/camera conditions",
  "External-site validation with confidence intervals, calibration analysis, and subgroup performance reporting",
  "Clinician validation, usability/human-factors testing, and clearly defined intended workflow",
  "Regulatory review of the final intended-use statement before any diagnostic or predictive clinical claim",
] as const;

export default function ValidationPage() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Movement Science Lab
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Clinical validation status
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-600">
            This page separates engineering capability, research evidence, and clinical readiness. A
            movement-quality score is not a diagnosis, proof of injury, or a guarantee that an injury
            will occur. Unsupported or weak models are blocked rather than presented as clinical truth.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatusCard
            title="Webcam capture"
            status="Engineering tested"
            tone="neutral"
            detail="Client-side pose capture, camera-position guidance, visibility gating, and deterministic kinematic calculations are covered by automated engineering tests."
          />
          <StatusCard
            title="Movement-quality AI"
            status="Research only"
            tone="warning"
            detail="Models distinguish source-dataset reference versus deviation examples. They still require independent webcam-domain and external-site validation."
          />
          <StatusCard
            title="Injury diagnosis"
            status="Blocked"
            tone="danger"
            detail="The webcam system may not diagnose an injury or replace an examination by a licensed clinician."
          />
          <StatusCard
            title="Future injury prediction"
            status="Blocked"
            tone="danger"
            detail="No current model is validated to tell a person that they will or will not become injured. Prospective outcome-labeled evidence is required."
          />
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-3">
            <EvidenceCard
              title="What the system can report"
              items={[
                "Pose/keypoint confidence and camera-position quality",
                "Exercise-specific 2D joint-angle and trajectory measurements",
                "Reference-form similarity and movement-deviation flags where the measurement method is compatible",
                "Uncertainty or insufficient-data states instead of forced classifications",
              ]}
            />
            <EvidenceCard
              title="What requires clinician interpretation"
              items={[
                "Whether a movement deviation is clinically meaningful for a specific patient",
                "Whether pain, weakness, instability, or functional loss suggests an injury",
                "How movement findings should alter rehabilitation or return-to-activity decisions",
                "Whether additional examination, imaging, or referral is appropriate",
              ]}
            />
            <EvidenceCard
              title="What the system must not claim"
              items={[
                "You have a specific injury based on webcam movement alone",
                "You will sustain an ACL tear or other future injury",
                "A single 2D angle is equivalent to 3D joint loading or force-plate data",
                "A research-model probability is a clinically validated personal-risk percentage",
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-6">
            <h2 className="text-xl font-semibold text-zinc-950">Current research-model performance</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
              These results use subject-grouped out-of-fold validation on the REHAB24-6 research
              dataset. The best validated representation is selected independently for each exercise.
              Internal research gates require at least 8 subjects, AUROC ≥ 0.70, balanced accuracy ≥
              0.68, sensitivity ≥ 0.50, and specificity ≥ 0.50. Passing those engineering gates does
              not establish clinical validity.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Movement</th>
                  <th className="px-5 py-3 font-medium">Representation</th>
                  <th className="px-5 py-3 font-medium">Reps</th>
                  <th className="px-5 py-3 font-medium">Subjects</th>
                  <th className="px-5 py-3 font-medium">AUROC</th>
                  <th className="px-5 py-3 font-medium">Balanced acc.</th>
                  <th className="px-5 py-3 font-medium">Sensitivity</th>
                  <th className="px-5 py-3 font-medium">Specificity</th>
                  <th className="px-5 py-3 font-medium">Gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {MODEL_ROWS.map((row) => (
                  <tr key={row.movement}>
                    <td className="px-5 py-4 font-medium text-zinc-950">{row.movement}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.representation}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.reps}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.subjects}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.auroc.toFixed(3)}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.balancedAccuracy.toFixed(3)}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.sensitivity.toFixed(3)}</td>
                    <td className="px-5 py-4 text-zinc-600">{row.specificity.toFixed(3)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          row.status === "Blocked"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Fail-closed release policy</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              A model that is weak, uncertain, out of domain, missing required measurements, or not
              validated for the selected camera view must return an unavailable/uncertain state. It must
              not manufacture a reassuring or alarming clinical conclusion.
            </p>
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
              Research candidate ≠ clinical model. Every research candidate remains blocked from clinical
              deployment until external validation, webcam-domain validation, subgroup analysis, license
              review, intended-use review, and clinician/human-factors validation are complete.
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Current evidence limitations</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
              <li>• Current research cohorts are small: roughly 8–10 subjects per exercise.</li>
              <li>• Source research data are not equivalent to real-world MediaPipe webcam recordings.</li>
              <li>• Single-camera 2D measurements are sensitive to camera angle, occlusion, clothing, lens geometry, body rotation, and out-of-plane motion.</li>
              <li>• BlazePose does not provide true ASIS/PSIS landmarks, so pelvic-line obliquity must not be described as true clinical pelvic tilt.</li>
              <li>• Frontal knee deviation is a 2D projection proxy and must not be represented as diagnostic valgus/varus or joint loading.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Hospital release gates</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {RELEASE_GATES.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  status,
  detail,
  tone,
}: {
  title: string;
  status: string;
  detail: string;
  tone: "neutral" | "warning" | "danger";
}) {
  const badge =
    tone === "danger"
      ? "bg-red-50 text-red-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-800"
        : "bg-zinc-100 text-zinc-700";

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badge}`}>{status}</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

function EvidenceCard({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
