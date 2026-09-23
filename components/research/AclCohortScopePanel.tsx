export function AclCohortScopePanel() {
  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr_.8fr]">
      <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Model A · First-time ACL
        </p>
        <h2 className="mt-2 text-lg font-semibold text-zinc-950">
          Athletes with no ACL rupture before the prediction index
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Learns a first-injury equation from pre-injury mechanics, strength,
          exposure/fatigue, intrinsic factors, and context. Prior ACL history is
          not allowed to become a dominant shortcut because this cohort excludes it.
        </p>
      </div>
      <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-800">
          Model B · Secondary ACL
        </p>
        <h2 className="mt-2 text-lg font-semibold text-zinc-950">
          Athletes with a prior ACL rupture or reconstruction
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Must be fitted independently because graft/reconstruction state,
          rehabilitation, time since surgery, return-to-sport exposure, and
          contralateral risk change the prediction problem.
        </p>
      </div>
      <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
          Evidence ceiling
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-950">
          A large prospective 3D/physical screening ML study reported mean AUROC
          0.63 for its best classifier. More model complexity does not create a
          solved clinical prediction problem without better prospective signal.
        </p>
        <p className="mt-3 text-[11px] leading-5 text-amber-900">
          Jauhiainen et al., 2022 · PMID 35984748
        </p>
      </div>
    </section>
  );
}
