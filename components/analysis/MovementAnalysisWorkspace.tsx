"use client";

import { useMemo, useRef, useState } from "react";
import { PoseCapture } from "@/components/pose/PoseCapture";
import { computeAnglesForFrame, type AngleName, type AngleReading } from "@/lib/biomechanics/angles";
import {
  DEFAULT_MOVEMENT_RULES,
  evaluateMovementRules,
  type MovementFlag,
} from "@/lib/biomechanics/risk-rules";
import type { PoseFrame } from "@/lib/pose/types";
import { AngleTimeSeriesChart, SessionTrendChart } from "./AngleCharts";

const MAX_LIVE_POINTS = 9000;

export function MovementAnalysisWorkspace() {
  const [isRecording, setIsRecording] = useState(false);
  const [readings, setReadings] = useState<AngleReading[]>([]);
  const [flags, setFlags] = useState<MovementFlag[]>([]);
  const [live, setLive] = useState<AngleReading[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<AngleName>("leftKneeFlexion");
  const firstTimestampRef = useRef<number | null>(null);

  function handleFrame(frame: PoseFrame | null) {
    if (!frame) {
      setLive([]);
      return;
    }

    const next = computeAnglesForFrame(frame);
    setLive(next);
    if (!isRecording) return;

    if (firstTimestampRef.current === null) firstTimestampRef.current = frame.frameTimestamp;
    const sessionStart = firstTimestampRef.current;
    const normalized = next.map((item) => ({
      ...item,
      frameTimestamp: item.frameTimestamp - sessionStart,
    }));
    const nextFlags = evaluateMovementRules(normalized, DEFAULT_MOVEMENT_RULES);

    setReadings((current) => [...current, ...normalized].slice(-MAX_LIVE_POINTS));
    if (nextFlags.length) setFlags((current) => [...current, ...nextFlags]);
  }

  function startRecording() {
    firstTimestampRef.current = null;
    setReadings([]);
    setFlags([]);
    setIsRecording(true);
  }

  function stopRecording() {
    setIsRecording(false);
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

  const sessionTrend = useMemo(() => {
    if (!selectedReadings.length) return [];
    const max = Math.max(...selectedReadings.map((item) => Math.abs(item.value)));
    return [{ sessionLabel: "Current session", value: Number(max.toFixed(2)) }];
  }, [selectedReadings]);

  return (
    <div className="space-y-8">
      <div className="relative">
        <PoseCapture onFrame={handleFrame} />
        <div className="pointer-events-none absolute right-[380px] top-4 hidden rounded-xl bg-black/75 px-4 py-3 text-white backdrop-blur lg:block">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">Live angle</p>
          <p className="mt-1 text-sm font-medium">{selectedAngle}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {liveSelected ? `${liveSelected.value.toFixed(1)}°` : "—"}
          </p>
          <p className="text-xs text-white/60">
            {liveSelected ? `confidence ${liveSelected.confidence.toFixed(2)}` : "insufficient keypoint confidence"}
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Session capture</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">Movement-quality analysis</h2>
          </div>
          <div className="flex gap-2">
            {!isRecording ? (
              <button onClick={startRecording} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Start recording</button>
            ) : (
              <button onClick={stopRecording} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Stop recording</button>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="text-sm text-zinc-600">Angle</label>
          <select
            value={selectedAngle}
            onChange={(event) => setSelectedAngle(event.target.value as AngleName)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          >
            {[
              "leftKneeFlexion",
              "rightKneeFlexion",
              "leftKneeFrontalDeviation",
              "rightKneeFrontalDeviation",
              "trunkLean",
              "pelvicLineObliquity",
              "leftShoulderElevation",
              "rightShoulderElevation",
            ].map((name) => <option key={name}>{name}</option>)}
          </select>
          <span className="text-xs text-zinc-500">
            {DEFAULT_MOVEMENT_RULES.length === 0
              ? "No literature thresholds configured; biomechanical flags are disabled."
              : `${DEFAULT_MOVEMENT_RULES.length} sourced rules active.`}
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
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Across-session trend</h2>
        <p className="mt-1 text-sm text-zinc-500">
          This component accepts session aggregates from Supabase. Until prior sessions exist, it shows only the current-session aggregate.
        </p>
        <div className="mt-5"><SessionTrendChart points={sessionTrend} /></div>
      </section>
    </div>
  );
}
