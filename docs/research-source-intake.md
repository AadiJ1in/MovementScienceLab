# Verified research source intake matrix

`data/research-source-intake-matrix.json` records external datasets that have been source-verified but are **not automatically authorized for runtime or model training**.

This separates two concepts that should not be conflated:

1. **Verified source** — the publication/data location, files, modalities, labels, and usage terms are known.
2. **Canonical active source** — the repository has an implemented and reviewed adapter, the intended use is compatible with the source terms, and the source has been deliberately promoted into `data/data-source-matrix.json`.

A source can therefore be well documented without silently entering a training pipeline.

## Verified intake sources

### REHAB24-6

- DOI/data record: `10.5281/zenodo.13305826`
- 10 subjects, 65 recordings, 184,825 frames at 30 FPS, 1,072 annotated repetitions.
- Six rehabilitation exercises.
- Two synchronized RGB cameras plus 2D/3D joints and motion-capture markers.
- Binary correctness, direction/view, lighting, and repetition start/end labels.
- Exact public file names and published MD5 values are recorded in the intake matrix.
- Provider terms restrict use to academic/non-profit noncommercial research unless separate commercial permission is obtained.

### KERAAL

- Official dataset page: `https://keraal.enstb.org/KeraalDataset.html`
- Code/documentation: `nguyensmai/KeraalDataset`
- 9 healthy subjects and 12 low-back-pain patients.
- RGB video, Kinect, Vicon, OpenPose, BlazePose, and clinician annotation layers.
- Correctness, error type, responsible body part, and temporal error localization.
- Official page states CC BY-NC-SA terms.

### IntelliRehabDS

- Paper DOI: `10.3390/data6050046`
- Data record: `10.5281/zenodo.4610859`
- Code: `alina-miron/intellirehabds`
- 15 patients and 14 healthy controls performing nine rehabilitation gestures.
- Public data include Kinect 3D skeleton coordinates and depth-image archives.
- Exact `SkeletonData.zip` and depth-archive names/checksums are recorded.
- Correct/incorrect execution, subject, session/date, gesture, repetition, and position metadata are available.
- Subject-disjoint evaluation is required; repetition-level random splits are not acceptable for MovementScienceLab benchmarking.

### 2026 prospective runner cohort

- Paper DOI: `10.1038/s41746-026-02413-y`
- 142 competitive endurance runners monitored prospectively for 12 months.
- 6,181 weekly samples and 564 reported injury instances in the ML-ready dataset description.
- Predictor domains include history, training, strength, biomechanics, body composition, nutrition, and genetics.
- Processed data are distributed through two supplementary XLSX files; their published filenames are recorded in the intake matrix.
- This is a promising injury-prediction research source, but it remains intake-only until participant identifiers, weekly temporal order, exact outcome construction, and leakage-safe grouped evaluation can be independently verified.

## Querying the intake matrix

Python:

```bash
python ml/data_source_matrix.py --intake-summary
python ml/data_source_matrix.py --intake-source rehab24-6
python ml/data_source_matrix.py --intake-source keraal
python ml/data_source_matrix.py --intake-source intellirehab
python ml/data_source_matrix.py --intake-source wu-2026-running-injury
```

A combined provenance snapshot can include both already-active and intake-only sources while preserving their status:

```bash
python ml/data_source_matrix.py \
  --provenance-source soccermon \
  --provenance-source wu-2026-running-injury \
  --data-piece soccermon-injury-event
```

The resulting record includes SHA-256 fingerprints of both source registries. Including an intake source in provenance does **not** activate it.

## Video handling

The source matrix records the existence and exact origin of external video/depth media without copying those large files into Git. Raw patient/external video remains outside the repository. Training adapters should ingest provider files from controlled storage, verify checksums, derive the needed landmark/measurement representation, and retain source/file provenance.
