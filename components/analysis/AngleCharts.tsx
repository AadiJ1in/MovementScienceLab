"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import type { AngleReading } from "@/lib/biomechanics/angles";
import type { MovementFlag } from "@/lib/biomechanics/risk-rules";

export function AngleTimeSeriesChart({
  readings,
  flags,
}: {
  readings: AngleReading[];
  flags: MovementFlag[];
}) {
  const data = readings.map((reading) => ({
    time: Math.round(reading.frameTimestamp),
    value: Number(reading.value.toFixed(2)),
    angleName: reading.angleName,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="time" tickFormatter={(value) => `${value}ms`} />
          <YAxis unit="°" />
          <Tooltip />
          <Line dataKey="value" dot={false} isAnimationActive={false} />
          {flags.map((flag) => (
            <ReferenceDot
              key={`${flag.ruleId}-${flag.frameTimestamp}`}
              x={Math.round(flag.frameTimestamp)}
              y={flag.measuredValue}
              r={5}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SessionTrendChart({
  points,
}: {
  points: { sessionLabel: string; value: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <XAxis dataKey="sessionLabel" />
          <YAxis unit="°" />
          <Tooltip />
          <Line dataKey="value" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
