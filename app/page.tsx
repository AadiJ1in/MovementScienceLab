import Link from "next/link";

const CAPABILITIES = [
  { title: "Camera-based tracking", text: "MediaPipe pose estimation runs on ordinary browser camera input." },
  { title: "Range-of-motion measurement", text: "Supported 2D joint-angle measurements are calculated from trusted landmarks." },
  { title: "Repetition analysis", text: "Exercise-specific rep logic is enabled only where the current detector is supported." },
  { title: "Movement-quality feedback", text: "Descriptive biomechanical measurements and capture-quality guidance stay separate from diagnosis." },
  { title: "Longitudinal progress", text: "Compatible sessions can be compared without mixing movement, view, or measurement definitions." },
] as const;

export default function Home() {
  return (
    <main className="overflow-hidden bg-[#f7f8fa]">
      <section className="relative border-b border-zinc-200/70 bg-[radial-gradient(circle_at_78%_15%,#bae6fd_0,transparent_28%),radial-gradient(circle_at_12%_0%,#e0f2fe_0,transparent_24%),linear-gradient(#fff,#f7f8fa)]">
        <div className="mx-auto grid min-h-[74vh] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Movement Science Lab</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.045em] text-zinc-950 sm:text-6xl lg:text-7xl">Objective movement analysis using an ordinary camera.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">Use your camera to measure and understand movement with pose tracking, supported joint-angle measurements, repetition analysis, movement-quality feedback, and longitudinal session data.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/assessment" className="rounded-xl bg-zinc-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-zinc-950/10 transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-sky-500">Start Movement Assessment</Link>
              <a href="#how-it-works" className="rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-300 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-sky-500">See How It Works</a>
            </div>
            <p className="mt-5 max-w-xl text-xs leading-5 text-zinc-500">Movement Science Lab provides camera-derived movement measurements. It is not a medical diagnosis or injury-prediction system.</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-[3rem] bg-sky-200/30 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] bg-zinc-950 p-5 shadow-2xl shadow-zinc-950/20">
              <div className="flex items-center justify-between text-xs text-white/60"><span>Live movement assessment</span><span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-300">Camera ready</span></div>
              <div className="mt-5 aspect-video rounded-[1.5rem] bg-[radial-gradient(circle_at_50%_40%,#3f3f46_0,#18181b_45%,#09090b_100%)] p-6">
                <div className="relative mx-auto h-full w-[42%] rounded-[45%] border-2 border-dashed border-sky-300/70">
                  <span className="absolute left-1/2 top-[18%] h-5 w-5 -translate-x-1/2 rounded-full bg-sky-300" />
                  <span className="absolute left-1/2 top-[28%] h-[38%] w-1 -translate-x-1/2 bg-sky-300" />
                  <span className="absolute left-[20%] top-[33%] h-1 w-[60%] bg-sky-300" />
                  <span className="absolute left-[28%] top-[61%] h-1 w-[44%] bg-sky-300" />
                  <span className="absolute left-[34%] top-[61%] h-[27%] w-1 rotate-6 bg-sky-300" />
                  <span className="absolute right-[34%] top-[61%] h-[27%] w-1 -rotate-6 bg-sky-300" />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-white">
                <PreviewMetric label="Knee flexion" value="87°" />
                <PreviewMetric label="Confidence" value="High" />
                <PreviewMetric label="Reps" value="6" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">From camera setup to understandable movement data.</h2>
          <p className="mt-4 text-base leading-7 text-zinc-600">The default workflow hides research controls and walks a patient through movement selection, camera setup, calibration, exercise capture, and results.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {CAPABILITIES.map((item, index) => (
            <div key={item.title} className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200/80">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">{index + 1}</span>
              <h3 className="mt-5 font-semibold text-zinc-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Research stays available</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Advanced controls moved out of the patient path—not removed.</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">Researchers can still inspect raw metrics, confidence, source provenance, rule configuration, angle traces, reference comparison, camera telemetry, diagnostics, validation material, and experimental dual-camera tools.</p>
          </div>
          <Link href="/research" className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">Open Research & Validation</Link>
        </div>
      </section>
    </main>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/8 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
