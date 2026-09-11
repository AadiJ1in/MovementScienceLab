import { computeAnglesForMovement } from "@/lib/biomechanics/measurement-profile";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import type { MovementType, PoseFrame } from "./types";

export type MeasurementMarker = {
  x: number;
  y: number;
  value: number;
  confidence: number;
  label: string;
  angleName: AngleName;
  interpretation: "2d-angle" | "2d-projection-proxy";
};

type MarkerOption = {
  angleName: AngleName;
  landmarkIndex: number;
  label: string;
  interpretation: MeasurementMarker["interpretation"];
};

const OPTIONS: Record<MovementType, readonly MarkerOption[]> = {
  "squat-front": [
    { angleName: "leftKneeFrontalDeviation", landmarkIndex: 25, label: "Knee tracking proxy", interpretation: "2d-projection-proxy" },
    { angleName: "rightKneeFrontalDeviation", landmarkIndex: 26, label: "Knee tracking proxy", interpretation: "2d-projection-proxy" },
  ],
  "squat-side": [
    { angleName: "leftKneeFlexion", landmarkIndex: 25, label: "Knee flexion", interpretation: "2d-angle" },
    { angleName: "rightKneeFlexion", landmarkIndex: 26, label: "Knee flexion", interpretation: "2d-angle" },
  ],
  "push-up-side": [
    { angleName: "leftShoulderElevation", landmarkIndex: 11, label: "Shoulder elevation", interpretation: "2d-angle" },
    { angleName: "rightShoulderElevation", landmarkIndex: 12, label: "Shoulder elevation", interpretation: "2d-angle" },
  ],
  "general-front": [
    { angleName: "leftKneeFrontalDeviation", landmarkIndex: 25, label: "Knee tracking proxy", interpretation: "2d-projection-proxy" },
    { angleName: "rightKneeFrontalDeviation", landmarkIndex: 26, label: "Knee tracking proxy", interpretation: "2d-projection-proxy" },
  ],
  "general-side": [
    { angleName: "leftKneeFlexion", landmarkIndex: 25, label: "Knee flexion", interpretation: "2d-angle" },
    { angleName: "rightKneeFlexion", landmarkIndex: 26, label: "Knee flexion", interpretation: "2d-angle" },
  ],
};

export function getPrimaryMeasurementMarker(frame: PoseFrame | null, movement: MovementType): MeasurementMarker | null {
  if (!frame) return null;
  const readings = computeAnglesForMovement(frame, movement);
  const byName = new Map<AngleName, AngleReading>(readings.map((reading) => [reading.angleName, reading]));

  const candidates = OPTIONS[movement]
    .map((option) => {
      const reading = byName.get(option.angleName);
      const point = frame.keypoints[option.landmarkIndex];
      if (!reading || !point?.trusted) return null;
      return { option, reading, point };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => b.reading.confidence - a.reading.confidence);

  const best = candidates[0];
  if (!best) return null;
  return {
    x: best.point.x,
    y: best.point.y,
    value: best.reading.value,
    confidence: best.reading.confidence,
    label: best.option.label,
    angleName: best.option.angleName,
    interpretation: best.option.interpretation,
  };
}
