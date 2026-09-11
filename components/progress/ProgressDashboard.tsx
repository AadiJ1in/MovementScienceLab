"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { getMovementDefinition, MOVEMENT_DEFINITIONS } from "@/lib/assessment/movement-definitions";
import type { AngleName } from "@/lib/biomechanics/angles";
import {
  PROGRESS_METRICS,
  availableAngles,
  baselineChange,
  compatibilityKey,
  computeBaseline,
  filterByDateRange,
  filterCompatibleSessions,
  metricHistory,
  metricValue,
  normalizeRepTrajectory,
  type ProgressMetricKey,
  type ProgressSession,
} from "@/lib/progress/analytics";
import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { loadProgressSessions, saveProgressBaseline } from "@/lib/supabase/progress-data";
import type { MovementType } from "@/lib/pose/types";

const ANGLE_LABELS: Record<AngleName, string> = {
  leftKneeFlexion: "Left knee flexion",
  rightKneeFlexion: "Right knee flexion",
  leftKneeFrontalDeviation: "Left knee tracking proxy",
  rightKneeFrontalDeviation: "Right knee tracking proxy",
  trunkLean: "Trunk lean",
  pelvicLineObliquity: "Pelvic-line obliquity",
  leftShoulderElevation: "Left shoulder elevation",
  rightShoulderElevation: "Right shoulder elevation",
};

type DateRange = 7 | 30 | 90 | "all";
type BaselineStrategy = "first_session" | "first_n";

export function ProgressDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<ProgressSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<MovementType>("squat-side");
  const [angleName, setAngleName] = useState<AngleName>("leftKneeFlexion");
  const [metric, setMetric] = useState<ProgressMetricKey>("excursion");
  const [dateRange, setDateRange] = useState<DateRange>(30);
  const [protocolKey, setProtocolKey] = useState("");
  const [baselineStrategy, setBaselineStrategy] = useState<BaselineStrategy>("first_n");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleUserChange = useCallback((next: User | null) => setUser(next), []);

  useEffect(() => {
    if (!user || !hasSupabaseConfig()) {
      setSessions([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void loadProgressSessions(createBrowserSupabaseClient(), user.id)
      .then((data) => {
        if (!active) return;
        setSessions(data);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load movement progress.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  const movementSessions = useMemo(
    () => sessions.filter((session) => session.captureMode === captureMode),
    [sessions, captureMode],
  );
  const angleOptions = useMemo(() => {
    const set = new Set<AngleName>();
    movementSessions.forEach((session) => availableAngles(session).forEach((angle) => set.add(angle)));
    return [...set].sort();
  }, [movementSessions]);

  useEffect(() => {
    if (angleOptions.length && !angleOptions.includes(angleName)) setAngleName(angleOptions[0]);
  }, [angleOptions, angleName]);

  const groups = useMemo(() => {
    const map = new Map<string, ProgressSession[]>();
    movementSessions.forEach((session) => {
      if (!availableAngles(session).includes(angleName)) return;
      const key = compatibilityKey(session, angleName);
      map.set(key, [...(map.get(key) ?? []), session]);
    });
    return [...map.entries()].sort((a, b) => {
      const aTime = Math.max(...a[1].map((session) => new Date(session.startedAt).getTime()));
      const bTime = Math.max(...b[1].map((session) => new Date(session.startedAt).getTime()));
      return bTime - aTime;
    });
  }, [movementSessions, angleName]);

  useEffect(() => {
    if (!groups.length) {
      setProtocolKey("");
      return;
    }
    if (!groups.some(([key]) => key === protocolKey)) setProtocolKey(groups[0][0]);
  }, [groups, protocolKey]);

  const compatibleAll = useMemo(
    () => groups.find(([key]) => key === protocolKey)?.[1] ?? [],
    [groups, protocolKey],
  );
  const compatible = useMemo(
    () => filterByDateRange(compatibleAll, dateRange),
    [compatibleAll, dateRange],
  );
  const history = useMemo(
    () => metricHistory(compatible, metric, angleName),
    [compatible, metric, angleName],
  );
  const baselineCount = baselineStrategy === "first_session" ? 1 : Math.min(3, compatibleAll.length);
  const baseline = useMemo(
    () => computeBaseline(compatibleAll, metric, angleName, Math.max(1, baselineCount)),
    [compatibleAll, metric, angleName, baselineCount],
  );
  const latest = compatible.at(-1) ?? null;
  const latestValue = latest ? metricValue(latest, metric, angleName) : null;
  const change = baselineChange(latestValue, baseline);
  const metricDefinition = PROGRESS_METRICS.find((item) => item.key === metric) ?? PROGRESS_METRICS[0];

  useEffect(() => {
    if (!compatible.length) {
      setCompareA("");
      setCompareB("");
      return;
    }
    if (!compatible.some((session) => session.id === compareA)) setCompareA(compatible.at(-2)?.id ?? compatible[0].id);
    if (!compatible.some((session) => session.id === compareB)) setCompareB(compatible.at(-1)?.id ?? compatible[0].id);
  }, [compatible, compareA, compareB]);

  const sessionA = compatible.find((session) => session.id === compareA) ?? null;
  const sessionB = compatible.find((session) => session.id === compareB) ?? null;

  const totalReps = compatible.reduce((sum, session) => sum + session.reps.length, 0);
  const meanTracking = compatible.length
    ? compatible.map((session) => metricValue(session, "tracking-confidence", angleName)).filter((value): value is number => value !== null)
    : [];
  const trackingReliability = meanTracking.length ? meanTracking.reduce((sum, value) => sum + value, 0) / meanTracking.length : null;

  async function persistBaseline() {
    if (!user || !baseline || !protocolKey) return;
    setSaveMessage("Saving baseline…");
    try {
      await saveProgressBaseline(createBrowserSupabaseClient(), {
        userId: user.id,
        compatibilityKey: protocolKey,
        metricKey: metric,
        angleName,
        strategy: baselineStrategy,
        baseline,
      });
      setSaveMessage(`Baseline saved from ${baseline.sessionCount} compatible session${baseline.sessionCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Baseline could not be saved.";
      setSaveMessage(`Baseline calculated locally but not persisted: ${message}`);
    }
  }

  return (
    <div className="space-y-6">
      <AuthPanel onUserChange={handleUserChange} />

      {!user && (
        <EmptyState title="Sign in to load movement progress" text="Progress uses your saved movement sessions. Camera capture can still run locally without an account." />
      )}
      {loading && <StatusPanel text="Loading compatible movement sessions…" />}
      {error && <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {user && !loading && sessions.length === 0 && (
        <EmptyState title="No movement sessions yet" text="Complete your first saved assessment to begin tracking camera-derived movement measurements." />
      )}

      {user && sessions.length > 0 && (
        <>
          <section className="grid gap-4 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200 lg:grid-cols-4">
            <Filter label="Exercise and view">
              <select value={captureMode} onChange={(event) => setCaptureMode(event.target.value as MovementType)} className="input-select">
                {MOVEMENT_DEFINITIONS.map((definition) => <option key={definition.id} value={definition.id}>{definition.title} · {definition.viewLabel}</option>)}
              </select>
            </Filter>
            <Filter label="Measurement">
              <select value={angleName} onChange={(event) => setAngleName(event.target.value as AngleName)} className="input-select">
                {angleOptions.map((angle) => <option key={angle} value={angle}>{ANGLE_LABELS[angle]}</option>)}
              </select>
            </Filter>
            <Filter label="Metric">
              <select value={metric} onChange={(event) => setMetric(event.target.value as ProgressMetricKey)} className="input-select">
                {PROGRESS_METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Filter>
            <Filter label="Date range">
              <select value={String(dateRange)} onChange={(event) => setDateRange(event.target.value === "all" ? "all" : Number(event.target.value) as 7 | 30 | 90)} className="input-select">
                <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="all">All sessions</option>
              </select>
            </Filter>
          </section>

          {groups.length > 1 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">Multiple measurement definitions or implementation versions are present.</p>
              <p className="mt-1 leading-6">They are kept separate and are never combined into one trend. Choose which compatible protocol to inspect.</p>
              <select aria-label="Compatible measurement protocol" value={protocolKey} onChange={(event) => setProtocolKey(event.target.value)} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm">
                {groups.map(([key, group]) => <option key={key} value={key}>{group[0].measurementVersion} · {group[0].measurementDefinitionVersion} · {group.length} session{group.length === 1 ? "" : "s"}</option>)}
              </select>
            </section>
          )}

          {compatible.length === 0 ? (
            <EmptyState title="No compatible sessions in this range" text="Try a longer date range. Sessions with different capture modes, measurement versions, or definitions remain separated." />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <SummaryCard label="Sessions completed" value={String(compatible.length)} />
                <SummaryCard label="Repetitions analyzed" value={String(totalReps)} />
                <SummaryCard label="Most recent session" value={latest ? formatDate(latest.startedAt) : "—"} />
                <SummaryCard label="Baseline established" value={baseline ? `${baseline.sessionCount} session${baseline.sessionCount === 1 ? "" : "s"}` : "Not available"} />
                <SummaryCard label="Tracking reliability" value={trackingReliability === null ? "Unavailable" : `${trackingReliability.toFixed(0)}% mean confidence`} />
                <SummaryCard label="Compatible measurements" value={String(compatibleAll.length)} />
              </section>

              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-lg font-semibold text-zinc-950">{metricDefinition.label} over time</h2><p className="mt-1 text-sm text-zinc-600">{metricDefinition.description}</p></div>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">{getMovementDefinition(captureMode).viewLabel}</span>
                  </div>
                  <div className="mt-5 h-72"><HistoryChart history={history} unit={metricDefinition.unit} /></div>
                </div>

                <div className="rounded-[1.75rem] bg-zinc-950 p-5 text-white">
                  <h2 className="text-lg font-semibold">Patient-specific baseline</h2>
                  <p className="mt-2 text-sm leading-6 text-white/65">A baseline is descriptive history, not a clinical target or definition of healthy movement.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setBaselineStrategy("first_session")} className={`rounded-xl px-3 py-2 text-sm ${baselineStrategy === "first_session" ? "bg-white text-zinc-950" : "bg-white/10 text-white"}`}>First session</button>
                    <button type="button" onClick={() => setBaselineStrategy("first_n")} className={`rounded-xl px-3 py-2 text-sm ${baselineStrategy === "first_n" ? "bg-white text-zinc-950" : "bg-white/10 text-white"}`}>First 3 sessions</button>
                  </div>
                  {baseline ? <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><Metric label="Mean" value={`${baseline.mean.toFixed(2)}${metricDefinition.unit}`} /><Metric label="Median" value={`${baseline.median.toFixed(2)}${metricDefinition.unit}`} /><Metric label="Standard deviation" value={`${baseline.standardDeviation.toFixed(2)}${metricDefinition.unit}`} /><Metric label="Sessions" value={String(baseline.sessionCount)} /></dl> : <p className="mt-5 text-sm text-white/65">Not enough compatible data for this metric.</p>}
                  {change && <p className="mt-5 rounded-xl bg-white/10 p-3 text-sm leading-6">Latest {metricDefinition.label.toLowerCase()} is <strong>{signed(change.delta)}{metricDefinition.unit}</strong> relative to the selected baseline mean. This is a descriptive change, not a clinical interpretation.</p>}
                  <button type="button" disabled={!baseline} onClick={() => void persistBaseline()} className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Save this baseline</button>
                  {saveMessage && <p className="mt-3 text-xs leading-5 text-white/65">{saveMessage}</p>}
                </div>
              </section>

              <SessionComparison sessions={compatible} angleName={angleName} metric={metric} unit={metricDefinition.unit} sessionA={sessionA} sessionB={sessionB} compareA={compareA} compareB={compareB} setCompareA={setCompareA} setCompareB={setCompareB} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function SessionComparison({ sessions, angleName, metric, unit, sessionA, sessionB, compareA, compareB, setCompareA, setCompareB }: {
  sessions: ProgressSession[]; angleName: AngleName; metric: ProgressMetricKey; unit: string;
  sessionA: ProgressSession | null; sessionB: ProgressSession | null; compareA: string; compareB: string;
  setCompareA: (id: string) => void; setCompareB: (id: string) => void;
}) {
  if (sessions.length < 2) return <EmptyState title="Compare Sessions" text="Complete at least two compatible sessions to enable side-by-side comparison." />;
  const valueA = sessionA ? metricValue(sessionA, metric, angleName) : null;
  const valueB = sessionB ? metricValue(sessionB, metric, angleName) : null;
  const delta = valueA !== null && valueB !== null ? valueB - valueA : null;
  const normalized = buildNormalizedComparison(sessionA, sessionB, angleName);
  const raw = buildRawComparison(sessionA, sessionB, angleName);
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div><h2 className="text-xl font-semibold text-zinc-950">Compare Sessions</h2><p className="mt-1 text-sm text-zinc-600">Only sessions from the selected compatible measurement protocol are available here.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SessionSelect label="Session A" value={compareA} sessions={sessions} onChange={setCompareA} />
        <SessionSelect label="Session B" value={compareB} sessions={sessions} onChange={setCompareB} />
      </div>
      {sessionA && sessionB && <>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><SummaryCard label="Session A" value={valueA === null ? "Unavailable" : `${valueA.toFixed(2)}${unit}`} /><SummaryCard label="Session B" value={valueB === null ? "Unavailable" : `${valueB.toFixed(2)}${unit}`} /><SummaryCard label="B − A" value={delta === null ? "Unavailable" : `${signed(delta)}${unit}`} /></div>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <TrajectoryPanel title="Normalized rep trajectories" subtitle="Each detected repetition is mapped to 0–100% of its own movement cycle. Timing is inspected separately below."><ComparisonChart data={normalized} xKey="cycle" xLabel="Movement cycle (%)" /></TrajectoryPanel>
          <TrajectoryPanel title="Raw session timing" subtitle="Angle samples retain their original milliseconds so timing differences are not erased by normalization."><ComparisonChart data={raw} xKey="time" xLabel="Time (s)" /></TrajectoryPanel>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ComparisonStat label="Repetitions" a={String(sessionA.reps.length)} b={String(sessionB.reps.length)} /><ComparisonStat label="Mean rep duration" a={formatNullable(metricValue(sessionA, "mean-rep-duration", angleName), "s")} b={formatNullable(metricValue(sessionB, "mean-rep-duration", angleName), "s")} /><ComparisonStat label="Left/right difference proxy" a={formatNullable(metricValue(sessionA, "symmetry-proxy", angleName), "°")} b={formatNullable(metricValue(sessionB, "symmetry-proxy", angleName), "°")} /><ComparisonStat label="Tracking confidence" a={formatNullable(metricValue(sessionA, "tracking-confidence", angleName), "%")} b={formatNullable(metricValue(sessionB, "tracking-confidence", angleName), "%")} /></div>
      </>}
    </section>
  );
}

function buildNormalizedComparison(a: ProgressSession | null, b: ProgressSession | null, angleName: AngleName) {
  const rows = new Map<number, Record<string, number>>();
  for (const [session, prefix] of [[a, "A"], [b, "B"]] as const) {
    if (!session) continue;
    session.reps.slice(0, 6).forEach((rep) => normalizeRepTrajectory(session, rep, angleName, 21).forEach((point) => {
      const row = rows.get(point.cyclePercent) ?? { cycle: point.cyclePercent };
      row[`${prefix} rep ${rep.repIndex}`] = point.value;
      rows.set(point.cyclePercent, row);
    }));
  }
  return [...rows.values()].sort((x, y) => x.cycle - y.cycle);
}

function buildRawComparison(a: ProgressSession | null, b: ProgressSession | null, angleName: AngleName) {
  const rows = new Map<number, Record<string, number>>();
  for (const [session, key] of [[a, "Session A"], [b, "Session B"]] as const) {
    if (!session) continue;
    session.angleSamples.filter((sample) => sample.angleName === angleName).forEach((sample) => {
      const time = Number((sample.frameTimestampMs / 1000).toFixed(2));
      const row = rows.get(time) ?? { time };
      row[key] = sample.valueDegrees;
      rows.set(time, row);
    });
  }
  return [...rows.values()].sort((x, y) => x.time - y.time);
}

function ComparisonChart({ data, xKey, xLabel }: { data: Record<string, number>[]; xKey: string; xLabel: string }) {
  const lines = [...new Set(data.flatMap((row) => Object.keys(row)).filter((key) => key !== xKey))];
  if (!data.length) return <div className="flex h-64 items-center justify-center text-sm text-zinc-500">No compatible trajectory data for this selection.</div>;
  return <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={xKey} type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} label={{ value: xLabel, position: "insideBottom", offset: -3, fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />{lines.map((line) => <Line key={line} dataKey={line} type="monotone" dot={false} strokeWidth={2} connectNulls />)}</LineChart></ResponsiveContainer></div>;
}

function HistoryChart({ history, unit }: { history: { sessionId: string; startedAt: string; value: number }[]; unit: string }) {
  const data = history.map((point) => ({ ...point, date: formatDate(point.startedAt) }));
  if (!data.length) return <div className="flex h-full items-center justify-center text-sm text-zinc-500">No compatible values for this metric.</div>;
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [`${Number(value).toFixed(2)}${unit}`, "Measurement"]} /><Line type="monotone" dataKey="value" strokeWidth={3} /></LineChart></ResponsiveContainer>;
}
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-medium text-zinc-800"><span>{label}</span><div className="mt-2">{children}</div></label>; }
function SummaryCard({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-2 text-lg font-semibold text-zinc-950">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-white/55">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function StatusPanel({ text }: { text: string }) { return <div className="rounded-2xl bg-white p-5 text-sm text-zinc-600 shadow-sm ring-1 ring-zinc-200">{text}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-white p-8 text-center"><h2 className="font-semibold text-zinc-950">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">{text}</p></div>; }
function TrajectoryPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200"><h3 className="font-semibold text-zinc-950">{title}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p><div className="mt-4">{children}</div></div>; }
function SessionSelect({ label, value, sessions, onChange }: { label: string; value: string; sessions: ProgressSession[]; onChange: (id: string) => void }) { return <label className="text-sm font-medium text-zinc-800">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="input-select mt-2">{sessions.map((session) => <option key={session.id} value={session.id}>{formatDateTime(session.startedAt)} · {session.reps.length} reps</option>)}</select></label>; }
function ComparisonStat({ label, a, b }: { label: string; a: string; b: string }) { return <div className="rounded-2xl bg-zinc-50 p-4 text-sm ring-1 ring-zinc-200"><p className="font-medium text-zinc-950">{label}</p><p className="mt-2 text-zinc-600">A: {a}</p><p className="text-zinc-600">B: {b}</p></div>; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function formatNullable(value: number | null, unit: string) { return value === null ? "Unavailable" : `${value.toFixed(2)}${unit}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
