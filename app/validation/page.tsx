const MODEL_ROWS = [
  { movement: "Squat", reps: 98, subjects: 9, auroc: 0.731, balancedAccuracy: 0.753, status: "Research-only" },
  { movement: "Leg abduction", reps: 116, subjects: 9, auroc: 0.73, balancedAccuracy: 0.715, status: "Research-only" },
  { movement: "Arm V/W", reps: 109, subjects: 9, auroc: 0.713, balancedAccuracy: 0.674, status: "Research-only" },
  { movement: "Arm abduction", reps: 88, subjects: 8, auroc: 0.632, balancedAccuracy: 0.63, status: "Research-only" },
  { movement: "Table push-up", reps: 107, subjects: 10, auroc: 0.611, balancedAccuracy: 0.617, status: "Research-only" },
  { movement: "Lunge", reps: 88, subjects: 8, auroc: 0.396, balancedAccuracy: 0.531, status: "Blocked" },
];

export default function ValidationPage() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Movement Science Lab</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Clinical validation status</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">
            This page separates what the system can currently measure from what has not yet been clinically validated. Movement-quality outputs must not be interpreted as diagnosis, confirmation of injury, or a guarantee of future injury.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard title="Webcam capture" status="Engineering validated" detail="Client-side pose capture, visibility gating, camera guidance, and deterministic angle calculations are covered by automated tests." />
          <StatusCard title="Movement AI" status="Research-only" detail="Task-specific models are trained on rehabilitation datasets with subject-grouped validation, but require independent webcam-domain and external-site validation." />
          <StatusCard title="Injury prediction" status="Not validated" detail="No current model may claim that a person is injured or will become injured. Prospective outcome-labeled validation is required before any such clinical claim is considered." />
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-6">
            <h2 className="text-xl font-semibold text-zinc-950">Current research-model performance</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Metrics are research evidence, not clinical clearance. Models below threshold remain blocked rather than forced into production.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-6 py-3 font-medium">Movement</th>
                  <th className="px-6 py-3 font-medium">Reps</th>
                  <th className="px-6 py-3 font-medium">Subjects</th>
                  <th className="px-6 py-3 font-medium">Grouped-CV AUROC</th>
                  <th className="px-6 py-3 font-medium">Balanced accuracy</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {MODEL_ROWS.map((row) => (
                  <tr key={row.movement}>
                    <td className="px-6 py-4 font-medium text-zinc-950">{row.movement}</td>
                    <td className="px-6 py-4 text-zinc-600">{row.reps}</td>
                    <td className="px-6 py-4 text-zinc-600">{row.subjects}</td>
                    <td className="px-6 py-4 text-zinc-600">{row.auroc.toFixed(3)}</td>
                    <td className="px-6 py-4 text-zinc-600">{row.balancedAccuracy.toFixed(3)}</td>
                    <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.status === "Blocked" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Hospital release gates</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              "Dedicated hospital backend and signed BAAs where PHI is handled",
              "MFA, role-based access, least privilege, and auditable account lifecycle",
              "Immutable clinical/audit event trail and documented retention/deletion policy",
              "Backups, PITR, monitoring, incident response, and security review",
              "Independent webcam-domain model validation on unseen participants",
              "External-site validation and subgroup performance analysis",
              "Clinician and human-factors validation for intended workflow",
              "Regulatory review of the final intended-use statement before clinical decision support claims",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">{item}</div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({ title, status, detail }: { title: string; status: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className="mt-2 text-sm font-medium text-zinc-700">{status}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}
