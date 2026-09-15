import { describe, expect, it } from "vitest";
import { MOVEMENT_QUALITY_FEATURE_NAMES } from "../ai/movement-quality-model";
import { getDataPiece } from "./data-matrix";

describe("model feature contracts stay aligned with the canonical data matrix", () => {
  it("keeps the movement-quality feature vector exactly synchronized", () => {
    const matrixPiece = getDataPiece("movement-quality-feature-vector");
    expect(matrixPiece).toBeDefined();
    expect(matrixPiece?.fields).toEqual([...MOVEMENT_QUALITY_FEATURE_NAMES]);
  });

  it("keeps measurement-quality fields explicit in the shared vector", () => {
    expect(MOVEMENT_QUALITY_FEATURE_NAMES).toContain("mean_pose_confidence");
    expect(MOVEMENT_QUALITY_FEATURE_NAMES).toContain("min_pose_confidence");
  });
});
