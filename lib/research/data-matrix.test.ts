import { describe, expect, it } from "vitest";
import {
  DATA_SOURCE_MATRIX,
  assertDataSourceMatrixIntegrity,
  findDataPiecesContainingField,
  getDataPiece,
  getDataPiecesForSource,
  getDataSource,
  getSourcesForStage,
  getSupabaseTable,
  getVideoSources,
} from "./data-matrix";

describe("canonical data source matrix", () => {
  it("passes referential-integrity and privacy guards", () => {
    expect(() => assertDataSourceMatrixIntegrity()).not.toThrow();
    expect(DATA_SOURCE_MATRIX.policy.rawPatientVideoPersisted).toBe(false);
    expect(DATA_SOURCE_MATRIX.policy.bundledRawVideoFiles).toEqual([]);
  });

  it("registers the complete SoccerMon subjective source set", () => {
    expect(getDataSource("soccermon")?.licenseStatus).toBe("CC BY 4.0");
    const pieces = getDataPiecesForSource("soccermon").map((piece) => piece.id);
    expect(pieces).toEqual(
      expect.arrayContaining([
        "soccermon-daily-load",
        "soccermon-readiness",
        "soccermon-sleep-quality",
        "soccermon-soreness",
        "soccermon-injury-event",
      ]),
    );
  });

  it("never marks registered raw video as persisted or bundled", () => {
    for (const video of getVideoSources()) {
      expect(video.rawVideoInRepository).toBe(false);
      expect(video.rawVideoPersisted).toBe(false);
    }
  });

  it("keeps pending research sources out of the active code matrix", () => {
    const activeSourceIds = new Set(DATA_SOURCE_MATRIX.matrix.map((row) => row.sourceId));
    for (const pending of DATA_SOURCE_MATRIX.pendingSources) {
      expect(activeSourceIds.has(pending.id)).toBe(false);
    }
  });

  it("enumerates all 33 MediaPipe landmark names", () => {
    const landmarks = getDataPiece("normalized-pose-landmarks");
    expect(landmarks).toBeDefined();
    expect(landmarks?.landmarkNames).toHaveLength(33);
    expect(landmarks?.landmarkNames).toContain("left_knee");
    expect(landmarks?.landmarkNames).toContain("right_foot_index");
  });

  it("indexes fields across runtime, research, and persistence layers", () => {
    expect(findDataPiecesContainingField("participant_id").map((piece) => piece.id)).toContain(
      "prospective-outcome-and-timing",
    );
    expect(findDataPiecesContainingField("cadenceRpm").map((piece) => piece.id)).toContain(
      "stage2-rep-summary",
    );
    expect(getSupabaseTable("movement_flags")?.fields).toContain("source_measurement_method");
  });

  it("can query sources by processing stage", () => {
    expect(getSourcesForStage("stage-1").map((source) => source.id)).toContain(
      "mediapipe-live-webcam",
    );
    expect(getSourcesForStage("research-ml").map((source) => source.id)).toEqual(
      expect.arrayContaining(["ui-prmd", "kimore", "execheck", "soccermon"]),
    );
  });
});
