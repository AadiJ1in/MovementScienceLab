"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { PoseCapture } from "@/components/pose/PoseCapture";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { RuleConfigurationPanel } from "./RuleConfigurationPanel";
import { ReferenceComparisonPanel } from "./ReferenceComparisonPanel";
import { computeAnglesForFrame, type AngleName, type AngleReading } from "@/lib/biomechanics/angles";
import {
  collapseMovementFlags,
  DEFAULT_MOVEMENT_RULES,
  evaluateMovementRules,
  type MovementFlag,
  type MovementRule,
} from "@/lib/biomechanics/risk-rules";
import {
  DEFAULT_KNEE_REP_CONFIG,
  RepSegmenter,
  type RepSummary,
} from "@/lib/biomechanics/rep-segmentation";
import { aggregateReps } from "@/lib/biomechanics/session-aggregation";
import { KEYPOINT_VISIBILITY_THRESHOLD } from "@/lib/pose/camera-guidance";
import type { MovementType, PoseFrame } from "@/lib/pose/types";
import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import {
  completeMovementSession,
  createMovementSession,
  loadAngleTrend,
  saveAngleSamples,
  saveMovementFlags,
  saveRepSummaries,
  type TrendPoint,
} from "@/lib/supabase/movement-data";
import { AngleTimeSeriesChart, SessionTrendChart } from "./AngleCharts";

const MAX_LIVE_POINTS = 9000;
const STORAGE_INTERVAL_MS = 100;
const ANGLES: AngleName[] = [
  "leftKneeFlexion",
  "rightKneeFlexion",
  "leftKneeFrontalDeviation",
  "rightKneeFrontalDeviation",
  "trunkLean",
  "pelvicLineObliquity",
  "leftShoulderElevation",
  "rightShoulderElevation",
];

export function MovementAnalysisWorkspace() {
  const [isRecording, setIsRecording] = useState(false);
  const [readings, setReadings] = useState<AngleReading[]>([]);
  const [flags, setFlags] = useState<MovementFlag[]>([]);
  const [rules, setRules] = useState<MovementRule[]>(DEFAULT_MOVEMENT_RULES);
  const [reps, setReps] = useState<RepSummary[]>([]);
  const [live, setLive] = useState<AngleReading[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<AngleName>("leftKneeFlexion");
  const [movement, setMovement] = useState<MovementType>("squat-front");
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<string>("Local session not started.");
  const [historicalTrend, setHistoricalTrend] = useState<TrendPoint[]>([]);

  const firstTimestampRef = useRef<number | null>(null);
  const segmenterRef = useRef<RepSegmenter | null>(null);
  const recordingRef = useRef(false);
  const activeRulesRef = useRef<MovementRule[]>([]);
  const storageReadingsRef = useRef<AngleReading[]>([]);
  const storageBucketRef = useRef<Map<AngleName, number>>(new Map());
  const userChange = useCallback((nextUser: User | null) => setUser(nextUser), []);

  useEffect(() => {
    recordingRef.current = isRecording;
  }, [isRecording]);

  const refreshTrend = useCallback(async () => {
    if (!hasSupabaseConfig() || !user) {
      setHistoricalTrend([]);
      return;
    }
    try {
      const points = await loadAngleTrend(createBrowserSupabaseClient(), selectedAngle, user.id);
      setHistoricalTrend(points);
    } catch (error) {
      setPersistenceStatus(
        `Could not load prior sessions: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }, [selectedAngle, user]);

  useEffect(() => {
    void refreshTrend();
  }, [refreshTrend]);

  function handleFrame(frame: PoseFrame | null) {
    if (!frame) {
      setLive([]);
      return;
    }

    const next = computeAnglesForFrame(frame);
    setLive(next);
    if (!recordingRef.current) return;

    if (firstTimestampRef.current === null) firstTimestampRef.current = frame.frameTimestamp;
    const sessionStart = firstTimestampRef.current;
    const normalized = next.map((item) => ({
      ...item,
      frameTimestamp: item.frameTimestamp - sessionStart,
    }));

    for (const reading of normalized) {
      const bucket = Math.floor(reading.frameTimestamp / STORAGE_INTERVAL_MS);
      if (storageBucketRef.current.get(reading.angleName) !== bucket) {
        storageBucketRef.current.set(reading.angleName, bucket);
        storageReadingsRef.current.push(reading);
      }
    }

    if (!segmenterRef.current) {
      const kneeCandidates = normalized
        .filter(
          (reading) =>
            reading.angleName === "leftKneeFlexion" || reading.angleName === "rightKneeFlexion",
        )
        .sort((a, b) => b.confidence - a.confidence);
      const bestKnee = kneeCandidates[0];
      if (bestKnee) {
        segmenterRef.current = new RepSegmenter({
          ...DEFAULT_KNEE_REP_CONFIG,
          angleName: bestKnee.angleName,
        });
      }
    }

    let frameRepIndex: number | undefined;
    const segmenter = segmenterRef.current;
    if (segmenter) {
      const signal = normalized.find(
        (reading) => reading.angleName === segmenter.signalAngleName,
      );
      if (signal) {
        const before = segmenter.activeRepIndex ?? undefined;
        const completed = segmenter.ingest(signal);
        const after = segmenter.activeRepIndex ?? undefined;
        frameRepIndex = completed?.repIndex ?? after ?? before;
        if (completed) setReps((current) => [...current, completed]);
      }
    }

    const nextFlags = evaluateMovementRules(
      normalized,
      activeRulesRef.current,
      frameRepIndex,
    );
    setReadings((current) => [...current, ...normalized].slice(-MAX_LIVE_POINTS));
    if (nextFlags.length) setFlags((current) => [...current, ...nextFlags]);
  }

  async function startRecording() {
    const protocolRules = rules.map((rule) => ({ ...rule }));
    activeRulesRef.current = protocolRules;
    firstTimestampRef.current = null;
    segmenterRef.current = null;
    storageReadingsRef.current = [];
    storageBucketRef.current.clear();
    setReadings([]);
    setFlags([]);
    setReps([]);
    setSessionId(null);
    setIsRecording(true);

    if (!hasSupabaseConfig()) {
      setPersistenceStatus(
        `Recording locally with ${protocolRules.length} sourced rules; Supabase is not configured.`,
      );
      return;
    }
    if (!user) {
      setPersistenceStatus("Recording locally; sign in before starting to save this session.");
      return;
    }

    try {
      const id = await createMovementSession(createBrowserSupabaseClient(), {
        userId: user.id,
        captureMode: movement,
        rules: protocolRules,
        keypointVisibilityThreshold: KEYPOINT_VISIBILITY_THRESHOLD,
        storageIntervalMs: STORAGE_INTERVAL_MS,
      });
      setSessionId(id);
      setPersistenceStatus(
        `Recording ${movement}; database session created with ${protocolRules.length} sourced rules snapshotted.`,
      );
    } catch (error) {
      setPersistenceStatus(
        `Recording locally; database session could not be created: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    recordingRef.current = false;

    if (!sessionId) {
      setPersistenceStatus("Session completed locally.");
      return;
    }

    try {
      setPersistenceStatus("Saving session…");
      const supabase = createBrowserSupabaseClient();
      const sampled = storageReadingsRef.current;
      const repAggregates = aggregateReps(reps, sampled);
      const persistedFlags = collapseMovementFlags(flags);
      await saveAngleSamples(supabase, sessionId, sampled);
      await saveRepSummaries(supabase, sessionId, repAggregates);
      await saveMovementFlags(supabase, sessionId, persistedFlags);
      await completeMovementSession(supabase, sessionId);
      setPersistenceStatus(
        `Saved ${repAggregates.length} reps, ${sampled.length} downsampled angle samples, and ${persistedFlags.length} explainable flags.`,
      );
      await refreshTrend();
    } catch (error) {
      setPersistenceStatus(
        `Session stopped, but persistence failed: ${error instanceof Error ? error.message : "unknown error"}. The captured data remains in this page until it is refreshed.`,
      );
    }
  }

  const liveSelected = live.find((reading) => reading.angleName === selectedAngle);
  const selectedReadings = useMemo(
    () => readings.filter((reading) => reading.angleName === selectedAngle),
    [readings, selectedAngle],
  );
  const selectedFlags = useMemo(
    () => flags.filter((flag) => flag.angleName === selectedAngle),
    [flags, selectedAngle],
  );

  const referenceReadings = useMemo(() => {
    const lastRep = reps.at(-1);
    if (!lastRep) return selectedReadings;
    return selectedReadings.filter(
      (reading) =>
        reading.frameTimestamp >= lastRep.startedMs && reading.frameTimestamp <= lastRep.endedMs,
    );
  }, [reps, selectedReadings]);

  const currentSessionTrend = useMemo(() => {
    if (!selectedReadings.length) return [];
    const max = Math.max(...selectedReadings.map((item) => Math.abs(item.value)));
    return [{ sessionLabel: "Current", value: Number(max.toFixed(2)) }];
  }, [selectedReadings]);
  const sessionTrend = [...historicalTrend, ...currentSessionTrend];
  const displayedRuleCount = isRecording ? activeRulesRef.current.length : rules.length;

  const videoOverlay = (
    <div className="max-w-[180px] rounded-xl bg-black/75 px-3 py-2 text-right text-white backdrop-blur sm:max-w-none sm:px-4 sm:py-3 sm:text-left">
      <p className="text-[9px] uppercase tracking-[0.16em] text-white/60 sm:text-[10px]">Live angle</p>
      <p className="mt-0.5 truncate text-xs font-medium sm:text-sm">{selectedAngle}</p>
      <p className="text-xl font-semibold tabular-nums sm:text-2xl">
        {liveSelected ? `${liveSelected.value.toFixed(1)}°` : "—"}
      </p>
      <p className="hidden text-xs text-white/60 sm:block">
        {liveSelected
          ? `confidence ${liveSelected.confidence.toFixed(2)}`
          : "insufficient keypoint confidence"}
      </p>
    </div>
  );

  return (
    <div className="space-y-8">
      <AuthPanel onUserChange={userChange} />
      <RuleConfigurationPanel rules={rules} onRulesChange={setRules} disabled={isRecording} />

      <PoseCapture
        onFrame={handleFrame}
        onMovementChange={setMovement}
        movementLocked={isRecording}
        videoOverlay={videoOverlay}
      />

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Session capture</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">Movement-quality analysis</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {movement} · Detected reps: {reps.length}
            </p>
          </div>
          {!isRecording ? (
            <button onClick={startRecording} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Start recording</button>
          ) : (
            <button onClick={stopRecording} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Stop & save</button>
          )}
        </div>

        <div className="mt-4 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          {persistenceStatus}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="text-sm text-zinc-600">Angle</label>
          <select
            value={selectedAngle}
            onChange={(event) => setSelectedAngle(event.target.value as AngleName)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          >
            {ANGLES.map((name) => <option key={name}>{name}</option>)}
          </select>
          <span className="text-xs text-zinc-500">
            {displayedRuleCount === 0
              ? "No literature thresholds configured; biomechanical flags are disabled."
              : `${displayedRuleCount} sourced rules active for this ${isRecording ? "recording" : "configuration"}.`}
          </span>
        </div>

        <div className="mt-6">
          <AngleTimeSeriesChart readings={selectedReadings} flags={selectedFlags} />
        </div>

        {selectedFlags.length > 0 && (
          <div className="mt-5 space-y-2">
            {selectedFlags.slice(-8).map((flag) => (
              <div key={`${flag.ruleId}-${flag.frameTimestamp}`} className="rounded-xl border border-zinc-200 p-3 text-sm">
                <strong>{flag.severity}:</strong> {flag.message} <span className="text-zinc-500">Source: {flag.sourceLabel}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <ReferenceComparisonPanel angleName={selectedAngle} readings={referenceReadings} />
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Across-session trend</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Maximum absolute value for the selected 2D metric across recent completed sessions. A trend is descriptive and must not be interpreted as injury probability.
        </p>
        <div className="mt-5"><SessionTrendChart points={sessionTrend} /></div>
      </section>
    </div>
  );
}
