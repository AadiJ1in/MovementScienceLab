import type { AngleName, AngleReading } from "../biomechanics/angles";
import { RepSegmenter, type RepSummary } from "../biomechanics/rep-segmentation";
import { getExerciseDefinition } from "./registry";
import type { MovementType } from "../pose/types";

export type ExerciseRepState = {
  signalAngleName: AngleName | null;
  activeRepIndex: number | null;
  completedRepCount: number;
};

export interface ExerciseRepSegmenter {
  ingest(readings: readonly AngleReading[]): RepSummary | null;
  reset(): void;
  getCurrentState(): ExerciseRepState;
  getCompletedReps(): readonly RepSummary[];
}

class RegisteredAngleCycleSegmenter implements ExerciseRepSegmenter {
  private segmenter: RepSegmenter | null = null;
  private signalAngleName: AngleName | null = null;
  private completed: RepSummary[] = [];

  constructor(private readonly movement: MovementType) {}

  ingest(readings: readonly AngleReading[]): RepSummary | null {
    const definition = getExerciseDefinition(this.movement);
    if (definition.segmentation.strategy !== "angle-cycle" || !definition.segmentation.config) return null;

    if (!this.segmenter) {
      const candidates = readings
        .filter((reading) => definition.segmentation.signalAngles.includes(reading.angleName))
        .sort((a, b) => b.confidence - a.confidence);
      const signal = candidates[0];
      if (!signal) return null;
      this.signalAngleName = signal.angleName;
      this.segmenter = new RepSegmenter({ ...definition.segmentation.config, angleName: signal.angleName });
    }

    const reading = readings.find((item) => item.angleName === this.signalAngleName);
    if (!reading) return null;
    const rep = this.segmenter.ingest(reading);
    if (rep) this.completed.push(rep);
    return rep;
  }

  reset() {
    this.segmenter?.reset();
    this.segmenter = null;
    this.signalAngleName = null;
    this.completed = [];
  }

  getCurrentState(): ExerciseRepState {
    return {
      signalAngleName: this.signalAngleName,
      activeRepIndex: this.segmenter?.activeRepIndex ?? null,
      completedRepCount: this.completed.length,
    };
  }

  getCompletedReps(): readonly RepSummary[] {
    return this.completed;
  }
}

export function createExerciseRepSegmenter(movement: MovementType): ExerciseRepSegmenter | null {
  return getExerciseDefinition(movement).segmentation.strategy === "angle-cycle"
    ? new RegisteredAngleCycleSegmenter(movement)
    : null;
}
