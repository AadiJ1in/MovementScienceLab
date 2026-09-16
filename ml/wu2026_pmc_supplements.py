from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

PMC_BUCKET_HTTPS = "https://pmc-oa-opendata.s3.amazonaws.com"
PMCID = "PMC12987969"
EXPECTED_DOI = "10.1038/s41746-026-02413-y"
EXPECTED_XLSX = {
    "41746_2026_2413_MOESM2_ESM.xlsx": "Supplementary Data1",
    "41746_2026_2413_MOESM3_ESM.xlsx": "Supplementary Data2",
}
USER_AGENT = "MovementScienceLab-Wu2026SourceAudit/1.0"


def _get_bytes(url: str, timeout: int = 90) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def _falsey(value: Any) -> bool:
    if isinstance(value, bool):
        return not value
    if value is None:
        return True
    return str(value).strip().lower() in {"0", "false", "no", "n", ""}


def normalize_doi(value: Any) -> str:
    text = str(value or "").strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if text.startswith(prefix):
            text = text[len(prefix) :]
    return text.strip()


def list_article_versions(pmcid: str = PMCID) -> list[str]:
    query = f"?list-type=2&prefix={quote(pmcid + '.', safe='')}&delimiter=/"
    raw = _get_bytes(PMC_BUCKET_HTTPS + "/" + query)
    root = ET.fromstring(raw)
    versions: list[str] = []
    for element in root.iter():
        if element.tag.endswith("Prefix") and element.text and element.text.startswith(pmcid + "."):
            versions.append(element.text.rstrip("/"))
    return sorted(set(versions))


def article_metadata_url(version_prefix: str) -> str:
    return f"{PMC_BUCKET_HTTPS}/{version_prefix}/{version_prefix}.json"


def load_article_metadata(version_prefix: str) -> tuple[dict[str, Any], bytes]:
    raw = _get_bytes(article_metadata_url(version_prefix))
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"PMC metadata for {version_prefix} must be a JSON object.")
    return data, raw


def select_published_open_access_version(
    records: Iterable[tuple[str, dict[str, Any], bytes]],
    *,
    expected_doi: str = EXPECTED_DOI,
) -> tuple[str, dict[str, Any], bytes]:
    expected = normalize_doi(expected_doi)
    candidates: list[tuple[str, dict[str, Any], bytes]] = []
    for prefix, metadata, raw in records:
        if normalize_doi(metadata.get("doi")) != expected:
            continue
        if not _falsey(metadata.get("is_manuscript")):
            continue
        if not _truthy(metadata.get("is_pmc_openaccess")):
            continue
        candidates.append((prefix, metadata, raw))

    if not candidates:
        raise ValueError(
            f"No non-manuscript open-access PMC article version matched DOI {expected_doi}."
        )
    if len(candidates) != 1:
        prefixes = ", ".join(prefix for prefix, _, _ in candidates)
        raise ValueError(
            "Multiple non-manuscript open-access PMC versions matched the DOI; "
            f"refusing to guess which is the intended published version: {prefixes}."
        )
    return candidates[0]


def _media_url_value(item: Any) -> str | None:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        for key in ("url", "s3_url", "href", "uri"):
            value = item.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def normalize_cloud_url(url: str) -> str:
    if url.startswith("s3://pmc-oa-opendata/"):
        return PMC_BUCKET_HTTPS + "/" + url.removeprefix("s3://pmc-oa-opendata/")
    return url


def supplement_urls(metadata: dict[str, Any]) -> dict[str, str]:
    media_urls = metadata.get("media_urls")
    if not isinstance(media_urls, list):
        raise ValueError("PMC metadata does not contain a media_urls list.")

    found: dict[str, str] = {}
    for item in media_urls:
        value = _media_url_value(item)
        if not value:
            continue
        url = normalize_cloud_url(value)
        filename = Path(urlparse(url).path).name
        if filename in EXPECTED_XLSX:
            found[filename] = url

    missing = sorted(set(EXPECTED_XLSX) - set(found))
    if missing:
        raise ValueError(
            "PMC media manifest is missing expected processed-data supplements: "
            + ", ".join(missing)
        )
    return found


def checksum_bytes(data: bytes) -> dict[str, str]:
    return {
        "md5": hashlib.md5(data, usedforsecurity=False).hexdigest(),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def source_md5_from_url(url: str) -> str | None:
    values = parse_qs(urlparse(url).query).get("md5", [])
    if not values:
        return None
    return values[0].lower()


def fetch_wu2026_supplements(output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    versions = list_article_versions(PMCID)
    if not versions:
        raise ValueError(f"PMC cloud returned no article versions for {PMCID}.")

    records = []
    for version in versions:
        metadata, raw = load_article_metadata(version)
        records.append((version, metadata, raw))

    version, metadata, metadata_raw = select_published_open_access_version(records)
    urls = supplement_urls(metadata)

    downloads: list[dict[str, Any]] = []
    for filename, label in EXPECTED_XLSX.items():
        url = urls[filename]
        payload = _get_bytes(url, timeout=180)
        checksums = checksum_bytes(payload)
        expected_md5 = source_md5_from_url(url)
        if expected_md5 and checksums["md5"] != expected_md5:
            raise ValueError(
                f"MD5 mismatch for {filename}: PMC metadata URL expected {expected_md5}, "
                f"download produced {checksums['md5']}."
            )
        path = output_dir / filename
        path.write_bytes(payload)
        downloads.append(
            {
                "label": label,
                "filename": filename,
                "bytes": len(payload),
                "md5": checksums["md5"],
                "sha256": checksums["sha256"],
                "sourceMd5": expected_md5,
                "sourceUrl": url,
                "workbookParsed": False,
            }
        )

    metadata_checksums = checksum_bytes(metadata_raw)
    manifest = {
        "schemaVersion": "1.0.0",
        "purpose": "source/file verification before any Wu 2026 model reanalysis",
        "sourceId": "wu-2026-running-injury",
        "pmcid": PMCID,
        "doi": EXPECTED_DOI,
        "selectedPmcVersion": version,
        "selectionRule": "exact DOI + non-manuscript + PMC open-access; fail if ambiguous",
        "metadataUrl": article_metadata_url(version),
        "metadataMd5": metadata_checksums["md5"],
        "metadataSha256": metadata_checksums["sha256"],
        "licenseCode": metadata.get("license_code"),
        "isPmcOpenAccess": metadata.get("is_pmc_openaccess"),
        "isManuscript": metadata.get("is_manuscript"),
        "downloads": downloads,
        "modelWasFit": False,
        "workbookContentsInspected": False,
        "clinicalValidationClaim": False,
        "note": (
            "This manifest proves only which publisher-deposited processed-data files were fetched. "
            "Participant grouping, temporal order, outcome timing, missingness, and leakage safety must "
            "be audited from workbook contents before any model fitting."
        ),
    }
    manifest_path = output_dir / "wu2026-pmc-source-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch the Wu et al. 2026 processed running-injury XLSX supplements from the official "
            "PMC Open Data S3 mirror without parsing or fitting them."
        )
    )
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    manifest = fetch_wu2026_supplements(args.output_dir)
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
