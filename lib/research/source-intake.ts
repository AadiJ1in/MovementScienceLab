import intakeJson from "../../data/research-source-intake-matrix.json";

export type ResearchIntakeSource = {
  id: string;
  name: string;
  status: "verified-intake-only";
  primarySource: string;
  dataSource: string;
  codeSource?: string;
  publication?: string;
  subjects?: number;
  modalities: string[];
  labels: string[];
  licenseStatus: string;
  bestUse: string[];
  notValidFor: string[];
  activationBlockers: string[];
  videoManifest?: {
    rawVideoInRepository?: boolean;
    [key: string]: unknown;
  };
  fileManifest?: Array<Record<string, unknown>>;
  supplementManifest?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ResearchSourceIntakeMatrix = {
  schemaVersion: string;
  lastReviewed: string;
  purpose: string;
  activationRule: string;
  sources: ResearchIntakeSource[];
};

export const RESEARCH_SOURCE_INTAKE = intakeJson as unknown as ResearchSourceIntakeMatrix;

export function assertResearchSourceIntakeIntegrity(
  intake: ResearchSourceIntakeMatrix = RESEARCH_SOURCE_INTAKE,
): void {
  const ids = new Set<string>();
  for (const source of intake.sources) {
    if (ids.has(source.id)) {
      throw new Error(`Duplicate research intake source id: ${source.id}.`);
    }
    ids.add(source.id);
    if (source.status !== "verified-intake-only") {
      throw new Error(
        `Research intake source ${source.id} must remain verified-intake-only until canonical activation.`,
      );
    }
    if (!source.primarySource || !source.dataSource) {
      throw new Error(`Research intake source ${source.id} requires source provenance.`);
    }
    if (source.videoManifest?.rawVideoInRepository === true) {
      throw new Error(`Research intake source ${source.id} cannot bundle raw video in the repository.`);
    }
  }
}

export function getResearchIntakeSource(id: string): ResearchIntakeSource | undefined {
  return RESEARCH_SOURCE_INTAKE.sources.find((source) => source.id === id);
}

export function listResearchIntakeSources(): ResearchIntakeSource[] {
  return [...RESEARCH_SOURCE_INTAKE.sources];
}

export function researchIntakeSourcesWithVideo(): ResearchIntakeSource[] {
  return RESEARCH_SOURCE_INTAKE.sources.filter((source) => source.videoManifest != null);
}

assertResearchSourceIntakeIntegrity();
