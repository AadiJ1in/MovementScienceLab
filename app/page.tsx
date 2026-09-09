import { PoseCapture } from "@/components/pose/PoseCapture";

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Movement Science Lab
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Webcam pose capture
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">
            Stage 1 captures MediaPipe Pose landmarks locally in the browser and checks whether
            the required body landmarks are visible enough for later movement-quality analysis.
            This is not an injury prediction or diagnostic tool.
          </p>
        </header>

        <PoseCapture />

        <p className="mt-6 max-w-4xl text-sm leading-6 text-zinc-500">
          Camera guidance reduces obvious positioning errors but cannot eliminate perspective
          distortion or infer true three-dimensional joint geometry from a single webcam.
        </p>
      </div>
    </main>
  );
}
