import Link from "next/link";
import { MotionCaptureLab } from "@/components/pose/MotionCaptureLab";

export default function CameraLabPage() {
  return (
    <main className="min-h-screen bg-[#f2f3f1] text-zinc-950">
      <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="border-b border-zinc-300 pb-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <span>Movement Science Lab</span>
                <span className="text-zinc-300">/</span>
                <span>Motion Capture</span>
                <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">Stage 1</span>
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-zinc-950 sm:text-5xl">
                Browser-based human motion capture with a transparent landmark stream.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">
                The webcam feed is processed locally with MediaPipe Pose Landmarker. This stage records the measurement substrate only: timestamped landmarks, visibility, capture quality, and runtime telemetry. No joint-angle interpretation or injury flagging is performed here.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-500"
              >
                Overview
              </Link>
              <Link
                href="/diagnostics"
                className="border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Browser diagnostics
              </Link>
            </div>
          </div>
        </header>

        <div className="mt-7">
          <MotionCaptureLab />
        </div>

        <section className="mt-8 grid gap-px bg-zinc-300 md:grid-cols-3">
          <BoundaryCard
            number="01"
            title="On-device video processing"
            text="The browser camera stream is consumed locally for pose inference. This Stage 1 implementation does not upload or persist video frames."
          />
          <BoundaryCard
            number="02"
            title="Measurement, not diagnosis"
            text="Visibility/trust gates indicate whether landmarks are usable for engineering analysis. They are not clinical cutoffs or evidence of pathology."
          />
          <BoundaryCard
            number="03"
            title="Stage 2 intentionally disabled"
            text="Angles, smoothing, repetition segmentation, tempo, range of motion, and plane-deviation metrics remain the next reviewed implementation stage."
          />
        </section>
      </div>
    </main>
  );
}

function BoundaryCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="bg-white p-5 sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{number}</p>
      <h2 className="mt-3 text-base font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
    </div>
  );
}
