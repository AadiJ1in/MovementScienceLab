export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">About</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Movement analysis designed around transparent measurements.</h1>
        <div className="mt-8 space-y-6 text-base leading-8 text-zinc-600">
          <p>Movement Science Lab uses ordinary camera input and MediaPipe pose landmarks to derive movement measurements such as selected joint angles, movement symmetry proxies, repetition timing, and capture-quality information.</p>
          <p>The platform deliberately separates direct camera-derived measurements, 2D projection-based proxies, engineering confidence scores, research classifiers, and clinically validated outputs. Those categories are not interchangeable.</p>
          <p>It is not a medical diagnosis system, does not currently predict future injury, and does not claim laboratory-grade 3D kinetics or joint loading from a webcam.</p>
        </div>
      </div>
    </main>
  );
}
