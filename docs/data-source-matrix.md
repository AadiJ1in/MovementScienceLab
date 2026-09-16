# Canonical data source matrix

`data/data-source-matrix.json` is the machine-readable provenance index for **active** MovementScienceLab data sources and data pieces. It connects external datasets, video-source classes, live webcam capture, derived measurement products, research feature domains, evidence sources, and Supabase persistence fields.

`data/research-source-intake-matrix.json` is the companion matrix for source-verified research datasets that are still intake-only. Keeping intake separate from active sources prevents a verified paper/download from silently becoming an authorized model input.

## Why this exists

Previously, provenance was split across `docs/dataset-registry.json`, `docs/evidence-registry.json`, the SoccerMon adapter, pose-stream types, Stage 2/3 types, ML feature lists, SQL migrations, and research notes. That made it easy for one part of the codebase to know about a field or source while another part did not.

The matrix layer gives TypeScript and Python code one stable place to answer questions such as:

- Which data pieces originate from SoccerMon?
- Which registered sources are used in `research-ml`?
- Which fields contain `participant_id` or `cadenceRpm`?
- Which video sources exist and whether raw video is stored?
- Which Supabase table stores measurement provenance?
- Which research datasets have verified DOI/download/license information but are not activated?
- Which exact registry versions and hashes should be stamped into a research artifact?

## Code access

### TypeScript: active matrix

Use `lib/research/data-matrix.ts`:

```ts
import {
  getDataSource,
  getDataPiecesForSource,
  getSourcesForStage,
  findDataPiecesContainingField,
} from "@/lib/research/data-matrix";

const soccerMon = getDataSource("soccermon");
const soccerMonPieces = getDataPiecesForSource("soccermon");
const researchSources = getSourcesForStage("research-ml");
const cadenceData = findDataPiecesContainingField("cadenceRpm");
```

The module validates referential integrity when it is loaded. A bad source reference, duplicate ID, active pending source, or raw-video persistence setting fails closed.

### TypeScript: verified intake

Use `lib/research/source-intake.ts`:

```ts
import {
  getResearchIntakeSource,
  researchIntakeSourcesWithVideo,
} from "@/lib/research/source-intake";

const rehab24 = getResearchIntakeSource("rehab24-6");
const externalMediaSources = researchIntakeSourcesWithVideo();
```

Intake records are deliberately typed with `status: "verified-intake-only"`.

### Python

Use `ml/data_source_matrix.py`:

```python
from data_source_matrix import (
    data_pieces_for_source,
    load_data_source_matrix,
    load_research_source_intake,
    source_provenance_snapshot,
)

matrix = load_data_source_matrix()
intake = load_research_source_intake()
soccer_mon = data_pieces_for_source("soccermon", matrix)
provenance = source_provenance_snapshot(["soccermon", "rehab24-6"])
```

Command-line queries:

```bash
python ml/data_source_matrix.py
python ml/data_source_matrix.py --source soccermon
python ml/data_source_matrix.py --intake-summary
python ml/data_source_matrix.py --intake-source rehab24-6
python ml/data_source_matrix.py --intake-source keraal
python ml/data_source_matrix.py --intake-source intellirehab
python ml/data_source_matrix.py --intake-source wu-2026-running-injury
python ml/data_source_matrix.py --stage research-ml
python ml/data_source_matrix.py --field participant_id
python ml/data_source_matrix.py --table movement_flags
python ml/data_source_matrix.py --provenance-source soccermon --data-piece soccermon-injury-event
```

## What is represented

The active matrix currently includes:

- UI-PRMD
- KIMORE
- ExeCheck
- SoccerMon
- licensed/expert-annotated public-video augmentation as a source class
- the live browser webcam + MediaPipe source
- Stage 3 clinician/researcher-reviewed rule protocols
- Stage 1 pose-frame metadata, all 33 normalized landmarks, model-relative world landmarks, and inference telemetry
- Stage 2 angle readings, session metric summaries, rep summaries, and consistency metrics
- Stage 3 reviewed rules and review flags
- SoccerMon daily-load, readiness, sleep-quality, soreness, and injury-event data
- prospective research feature domains and outcome/timing fields
- the movement-quality model feature vector
- the active literature/evidence registry
- all current Supabase data tables and provenance-relevant fields

The verified intake matrix currently includes:

- REHAB24-6
- KERAAL
- IntelliRehabDS
- the 2026 Wu et al. prospective multidisciplinary running-injury dataset and published supplementary-data filenames

Sources can therefore progress through three distinct states: named/pending → source-verified intake → canonical active. A verified intake record is not consumed by runtime/training until it is explicitly promoted with an adapter and reviewed mapping.

## Video policy

The matrices record video/media *sources and derived representations*, not copies of patient or external raw video.

Current invariants:

- `rawPatientVideoPersisted` is `false`.
- `bundledRawVideoFiles` is empty.
- every active registered video source has `rawVideoInRepository: false`.
- every active registered video source has `rawVideoPersisted: false`.
- verified intake video manifests must also keep `rawVideoInRepository` false.
- live webcam frames are processed client-side in the current capture workspace.
- external provider media should be downloaded only into controlled research storage, checksum-verified, transformed into the minimum needed representation, and linked back to its source manifest.

The preferred common representation is a provenance-linked landmark/measurement stream, not a repository full of raw videos.

## Adding a new dataset or video source

A new **active** source is not complete until all of the following are present:

1. A stable source ID.
2. Primary publication/source and actual data location.
3. License/usage-rights status compatible with the intended use.
4. Modalities and label semantics.
5. Explicit `bestUse` and `notValidFor` boundaries.
6. One or more structured `dataPieces` describing the actual fields consumed by code.
7. A canonical matrix row connecting source → data pieces → stage/use.
8. A code adapter or loader.
9. Participant/time grouping rules where human longitudinal data are modeled.
10. Tests that assert the new references resolve.
11. File/version/checksum provenance for downloaded research data where available.

If the source itself is understood but the adapter or intended-use review is incomplete, add it to the verified intake matrix instead of activating it. If basic source/license information is still unknown, keep it pending.

## Reproducible provenance

`source_provenance_snapshot()` produces a compact record containing:

- the SHA-256 of `data/data-source-matrix.json`;
- the SHA-256 of `data/research-source-intake-matrix.json`;
- every requested source ID and whether it is `canonical-active` or `verified-intake-only`;
- source/data URLs;
- canonical data-piece IDs used by the artifact.

This lets future model/cohort reports identify the exact source registry state used to create them while retaining the boundary that intake-only does not authorize use.

## Scientific boundary

The matrices organize provenance; they do not upgrade evidence quality. Movement-quality datasets and video examples do not become prospective injury ground truth by being combined. Measurement-quality variables do not automatically become biological predictors. Source-specific thresholds do not become webcam-compatible thresholds without measurement-method validation. Stage 3 remains a clinician/researcher review indicator system, not diagnosis, injury probability, or automatic treatment guidance.
