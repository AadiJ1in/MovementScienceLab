export type ReferencePoint = { phase: number; value: number };

export type DtwResult = {
  normalizedDistance: number;
  pathLength: number;
  comparedSamples: number;
};

export function dynamicTimeWarping(
  sample: number[],
  reference: number[],
): DtwResult {
  if (sample.length === 0 || reference.length === 0) {
    throw new Error("DTW requires non-empty sample and reference series.");
  }

  const rows = sample.length + 1;
  const cols = reference.length + 1;
  const cost = Array.from({ length: rows }, () => Array(cols).fill(Number.POSITIVE_INFINITY));
  const steps = Array.from({ length: rows }, () => Array(cols).fill(0));
  cost[0][0] = 0;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const localCost = Math.abs(sample[i - 1] - reference[j - 1]);
      const candidates = [
        { cost: cost[i - 1][j], steps: steps[i - 1][j] },
        { cost: cost[i][j - 1], steps: steps[i][j - 1] },
        { cost: cost[i - 1][j - 1], steps: steps[i - 1][j - 1] },
      ];
      const best = candidates.reduce((a, b) => (a.cost <= b.cost ? a : b));
      cost[i][j] = localCost + best.cost;
      steps[i][j] = best.steps + 1;
    }
  }

  const pathLength = steps[sample.length][reference.length];
  return {
    normalizedDistance: cost[sample.length][reference.length] / pathLength,
    pathLength,
    comparedSamples: sample.length,
  };
}

export type FormDeviationResult = {
  angleName: string;
  normalizedDistance: number;
  interpretation: "closer-to-reference" | "more-deviant-from-reference";
};

/**
 * The interpretation boundary is caller-supplied and must be validated against labeled data.
 * DTW similarity is movement-form comparison, not injury prediction or diagnosis.
 */
export function compareRepToReference(
  angleName: string,
  sample: number[],
  reference: number[],
  deviationBoundary: number,
): FormDeviationResult {
  const result = dynamicTimeWarping(sample, reference);
  return {
    angleName,
    normalizedDistance: result.normalizedDistance,
    interpretation:
      result.normalizedDistance > deviationBoundary
        ? "more-deviant-from-reference"
        : "closer-to-reference",
  };
}
