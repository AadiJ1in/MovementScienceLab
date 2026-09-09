import type { AngleName, AngleReading } from "./angles";
import type { RepSummary } from "./rep-segmentation";

export type AngleAggregate = {
  min: number;
  max: number;
  mean: number;
  samples: number;
  meanConfidence: number;
};

export type PersistableRepSummary = RepSummary & {
  angleSummary: Partial<Record<AngleName, AngleAggregate>>;
};

export function downsampleReadings(
  readings: AngleReading[],
  intervalMs = 100,
): AngleReading[] {
  const buckets = new Map<string, AngleReading>();

  for (const reading of readings) {
    const bucket = Math.floor(reading.frameTimestamp / intervalMs);
    const key = `${reading.angleName}:${bucket}`;
    const existing = buckets.get(key);
    if (!existing || reading.confidence > existing.confidence) {
      buckets.set(key, reading);
    }
  }

  return [...buckets.values()].sort(
    (a, b) => a.frameTimestamp - b.frameTimestamp || a.angleName.localeCompare(b.angleName),
  );
}

export function aggregateReps(
  reps: RepSummary[],
  readings: AngleReading[],
): PersistableRepSummary[] {
  return reps.map((rep) => {
    const withinRep = readings.filter(
      (reading) =>
        reading.frameTimestamp >= rep.startedMs && reading.frameTimestamp <= rep.endedMs,
    );
    const grouped = new Map<AngleName, AngleReading[]>();
    for (const reading of withinRep) {
      const group = grouped.get(reading.angleName) ?? [];
      group.push(reading);
      grouped.set(reading.angleName, group);
    }

    const angleSummary: Partial<Record<AngleName, AngleAggregate>> = {};
    for (const [angleName, group] of grouped) {
      const values = group.map((reading) => reading.value);
      angleSummary[angleName] = {
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        samples: values.length,
        meanConfidence:
          group.reduce((sum, reading) => sum + reading.confidence, 0) / group.length,
      };
    }

    return { ...rep, angleSummary };
  });
}
