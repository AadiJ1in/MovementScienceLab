# Canonical data source matrix

`data/data-source-matrix.json` is the single machine-readable provenance index for MovementScienceLab. It connects external datasets, video-source classes, live webcam capture, derived measurement products, research feature domains, evidence sources, and Supabase persistence fields.

## Why this exists

Previously, provenance was split across `docs/dataset-registry.json`, `docs/evidence-registry.json`, the SoccerMon adapter, pose-stream types, Stage 2/3 types, ML feature lists, and SQL migrations. That made it easy for one part of the codebase to know about a field or source while another part did not.

The canonical matrix gives TypeScript and Python code one stable place to answer questions such as:

- Which data pieces originate from SoccerMon?
- Which registered sources are used in `research-ml`?
- Which fields contain `participant_id` or `cadenceRpm`?
- Which video sources exist and whether raw video is stored?
- Which Supabase table stores measurement provenance?
- Is a research source active, or merely pending provenance/license review?

## Code access

### TypeScript

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

### Python

Use `ml/data_source_matrix.py`:

```python
from data_source_matrix import load_data_source_matrix, data_pieces_for_source

matrix = load_data_source_matrix()
soccer_mon = data_pieces_for_source("soccermon", matrix)
```

It can also be queried from the command line:

```bash
python ml/data_source_matrix.py
python ml/data_source_matrix.py --source soccermon
python ml/data_source_matrix.py --stage research-ml
python ml/data_source_matrix.py --field participant_id
python ml/data_source_matrix.py --table movement_flags
```

## What is represented

The matrix currently includes:

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

Sources previously considered in research but not fully wired into current `main` are placed in `pendingSources`. Pending entries cannot appear in active matrix rows. They must not be used by runtime or training until their exact source URL, license, data manifest, and adapter/provenance mapping are registered.

## Video policy

The matrix records video *sources and derived representations*, not copies of patient or external raw video.

Current invariants:

- `rawPatientVideoPersisted` is `false`.
- `bundledRawVideoFiles` is empty.
- every registered video source has `rawVideoInRepository: false`.
- every registered video source has `rawVideoPersisted: false`.
- live webcam frames are processed client-side in the current capture workspace.
- KIMORE/ExeCheck/public augmentation video should only be ingested when terms permit the intended use.

The preferred common representation is a provenance-linked landmark/measurement stream, not a repository full of raw videos.

## Adding a new dataset or video source

A new active source is not complete until all of the following are present:

1. A stable `sources[].id`.
2. Primary publication/source and actual data location when available.
3. License/usage-rights status.
4. Modalities and label semantics.
5. Explicit `bestUse` and `notValidFor` boundaries.
6. One or more structured `dataPieces` describing the actual fields consumed by code.
7. A `matrix` row connecting source → data pieces → stage/use.
8. A code adapter or loader when the source is actually consumed.
9. Participant/time grouping rules where human longitudinal data are modeled.
10. Tests that assert the new references resolve.

If any of those items are still unknown, keep the source under `pendingSources` rather than silently using it.

## Scientific boundary

The matrix organizes provenance; it does not upgrade evidence quality. Movement-quality datasets and video examples do not become prospective injury ground truth by being combined. Measurement-quality variables do not automatically become biological predictors. Source-specific thresholds do not become webcam-compatible thresholds without measurement-method validation. Stage 3 remains a clinician/researcher review indicator system, not diagnosis, injury probability, or automatic treatment guidance.
