import matrixJson from "../../data/data-source-matrix.json";

export type MatrixSource = {
  id: string;
  category: string;
  name: string;
  status: string;
  primarySource: string | null;
  dataSource: string | null;
  subjects: number | null;
  modalities: string[];
  labels: string[];
  bestUse: string[];
  notValidFor: string[];
  licenseStatus: string;
  trustTier: string;
  codeAdapters: string[];
};

export type PendingMatrixSource = {
  id: string;
  name: string;
  status: string;
  sourceUrl: string | null;
  allowedUse: string;
};

export type MatrixVideoSource = {
  id: string;
  sourceId: string;
  kind: string;
  rawVideoInRepository: boolean;
  rawVideoPersisted: boolean;
  processing: string;
  derivedData: string[];
};

export type MatrixDataPiece = {
  id: string;
  layer: string;
  granularity: string;
  fields: string[];
  [key: string]: unknown;
};

export type MatrixEvidenceSource = {
  id: string;
  sourceUrl: string;
  role: string;
  runtimeUse: string;
  transferability: string;
};

export type MatrixSupabaseTable = {
  name: string;
  fields: string[];
  containsPatientData: boolean;
};

export type MatrixLink = {
  sourceId: string;
  dataPieceIds: string[];
  stages: string[];
  uses: string[];
};

export type DataSourceMatrix = {
  schemaVersion: string;
  lastReviewed: string;
  purpose: string;
  policy: {
    rawPatientVideoPersisted: boolean;
    bundledRawVideoFiles: string[];
    externalMediaMustHaveUsageRights: boolean;
    participantLevelSplitRequiredForHumanDatasetModeling: boolean;
    sourceProvenanceRequired: boolean;
    measurementMethodCompatibilityRequired: boolean;
    noInjuryProbabilityFromMovementQualityDatasets: boolean;
    noAutomaticTreatmentChangeFromReviewFlags: boolean;
    pendingSourcesCannotBeUsedByRuntimeOrTraining: boolean;
  };
  sources: MatrixSource[];
  pendingSources: PendingMatrixSource[];
  videoSources: MatrixVideoSource[];
  dataPieces: MatrixDataPiece[];
  evidenceSources: MatrixEvidenceSource[];
  supabaseTables: MatrixSupabaseTable[];
  matrix: MatrixLink[];
};

export const DATA_SOURCE_MATRIX = matrixJson as unknown as DataSourceMatrix;

export function assertDataSourceMatrixIntegrity(
  matrix: DataSourceMatrix = DATA_SOURCE_MATRIX,
): void {
  assertUnique(matrix.sources.map((source) => source.id), "source id");
  assertUnique(matrix.pendingSources.map((source) => source.id), "pending source id");
  assertUnique(matrix.videoSources.map((source) => source.id), "video source id");
  assertUnique(matrix.dataPieces.map((piece) => piece.id), "data-piece id");
  assertUnique(matrix.evidenceSources.map((source) => source.id), "evidence source id");
  assertUnique(matrix.supabaseTables.map((table) => table.name), "Supabase table name");

  const sourceIds = new Set(matrix.sources.map((source) => source.id));
  const pendingIds = new Set(matrix.pendingSources.map((source) => source.id));
  const dataPieceIds = new Set(matrix.dataPieces.map((piece) => piece.id));

  for (const video of matrix.videoSources) {
    if (!sourceIds.has(video.sourceId)) {
      throw new Error(`Video source ${video.id} references unknown active source ${video.sourceId}.`);
    }
    for (const pieceId of video.derivedData) {
      if (!dataPieceIds.has(pieceId) && pieceId !== "external-video-frame" && pieceId !== "external-skeleton-landmarks" && pieceId !== "clinician-quality-score" && pieceId !== "paired-form-label" && pieceId !== "expert-annotation") {
        throw new Error(`Video source ${video.id} references unknown data piece ${pieceId}.`);
      }
    }
  }

  for (const link of matrix.matrix) {
    if (!sourceIds.has(link.sourceId)) {
      throw new Error(`Matrix row references unknown active source ${link.sourceId}.`);
    }
    if (pendingIds.has(link.sourceId)) {
      throw new Error(`Pending source ${link.sourceId} cannot appear in the active matrix.`);
    }
    for (const pieceId of link.dataPieceIds) {
      if (!dataPieceIds.has(pieceId)) {
        throw new Error(`Matrix row for ${link.sourceId} references unknown data piece ${pieceId}.`);
      }
    }
  }

  if (matrix.policy.rawPatientVideoPersisted) {
    throw new Error("Canonical data matrix must not enable raw patient-video persistence.");
  }
  if (matrix.policy.bundledRawVideoFiles.length > 0) {
    throw new Error("Raw video files must not be bundled in the repository matrix.");
  }
  const persistedRawVideo = matrix.videoSources.filter((video) => video.rawVideoPersisted);
  if (persistedRawVideo.length > 0) {
    throw new Error(
      `Raw-video persistence is not allowed for registered video sources: ${persistedRawVideo.map((video) => video.id).join(", ")}.`,
    );
  }
}

export function getDataSource(id: string): MatrixSource | undefined {
  return DATA_SOURCE_MATRIX.sources.find((source) => source.id === id);
}

export function getPendingDataSource(id: string): PendingMatrixSource | undefined {
  return DATA_SOURCE_MATRIX.pendingSources.find((source) => source.id === id);
}

export function getDataPiece(id: string): MatrixDataPiece | undefined {
  return DATA_SOURCE_MATRIX.dataPieces.find((piece) => piece.id === id);
}

export function getDataPiecesForSource(sourceId: string): MatrixDataPiece[] {
  const ids = new Set(
    DATA_SOURCE_MATRIX.matrix
      .filter((row) => row.sourceId === sourceId)
      .flatMap((row) => row.dataPieceIds),
  );
  return DATA_SOURCE_MATRIX.dataPieces.filter((piece) => ids.has(piece.id));
}

export function getSourcesForStage(stage: string): MatrixSource[] {
  const ids = new Set(
    DATA_SOURCE_MATRIX.matrix
      .filter((row) => row.stages.includes(stage))
      .map((row) => row.sourceId),
  );
  return DATA_SOURCE_MATRIX.sources.filter((source) => ids.has(source.id));
}

export function getVideoSources(): MatrixVideoSource[] {
  return [...DATA_SOURCE_MATRIX.videoSources];
}

export function getSupabaseTable(name: string): MatrixSupabaseTable | undefined {
  return DATA_SOURCE_MATRIX.supabaseTables.find((table) => table.name === name);
}

export function findDataPiecesContainingField(field: string): MatrixDataPiece[] {
  return DATA_SOURCE_MATRIX.dataPieces.filter((piece) =>
    piece.fields.some((candidate) => candidate === field || candidate.endsWith(`.${field}`)),
  );
}

export function getFieldIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const piece of DATA_SOURCE_MATRIX.dataPieces) {
    for (const field of piece.fields) {
      const existing = index.get(field) ?? [];
      existing.push(piece.id);
      index.set(field, existing);
    }
  }
  for (const table of DATA_SOURCE_MATRIX.supabaseTables) {
    for (const field of table.fields) {
      const key = `supabase.${table.name}.${field}`;
      index.set(key, [table.name]);
    }
  }
  return index;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}.`);
    seen.add(value);
  }
}

assertDataSourceMatrixIntegrity();
