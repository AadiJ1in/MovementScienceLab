import { describe, expect, it } from "vitest";
import {
  RESEARCH_SOURCE_INTAKE,
  assertResearchSourceIntakeIntegrity,
  getResearchIntakeSource,
  researchIntakeSourcesWithVideo,
} from "./source-intake";

describe("verified research source intake matrix", () => {
  it("is internally valid and remains intake-only", () => {
    expect(() => assertResearchSourceIntakeIntegrity()).not.toThrow();
    for (const source of RESEARCH_SOURCE_INTAKE.sources) {
      expect(source.status).toBe("verified-intake-only");
    }
  });

  it("contains the research sources previously tracked only by name", () => {
    expect(getResearchIntakeSource("rehab24-6")?.subjects).toBe(10);
    expect(getResearchIntakeSource("keraal")?.subjects).toBe(21);
    expect(getResearchIntakeSource("intellirehab")?.subjects).toBe(29);
    expect(getResearchIntakeSource("wu-2026-running-injury")?.subjects).toBe(142);
  });

  it("keeps raw external videos out of the repository", () => {
    for (const source of researchIntakeSourcesWithVideo()) {
      expect(source.videoManifest?.rawVideoInRepository).toBe(false);
    }
  });

  it("records a concrete downloadable manifest where one is known", () => {
    const rehab24 = getResearchIntakeSource("rehab24-6");
    expect(rehab24?.fileManifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "videos.zip" }),
        expect.objectContaining({ file: "Segmentation.csv" }),
      ]),
    );

    const intelliRehab = getResearchIntakeSource("intellirehab");
    expect(intelliRehab?.fileManifest).toEqual(
      expect.arrayContaining([expect.objectContaining({ file: "SkeletonData.zip" })]),
    );
  });

  it("records the 2026 runner supplementary data without authorizing it", () => {
    const runner = getResearchIntakeSource("wu-2026-running-injury");
    expect(runner?.supplementManifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Supplementary Data1" }),
        expect.objectContaining({ label: "Supplementary Data2" }),
      ]),
    );
    expect(runner?.activationBlockers).toContain(
      "verify participant identifiers are preserved in processed supplements",
    );
  });
});
