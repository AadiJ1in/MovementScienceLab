from __future__ import annotations

import unittest

from wu2026_pmc_supplements import (
    EXPECTED_XLSX,
    normalize_cloud_url,
    normalize_doi,
    select_published_open_access_version,
    source_md5_from_url,
    supplement_urls,
)


class Wu2026PmcSupplementTests(unittest.TestCase):
    def test_normalize_doi(self) -> None:
        self.assertEqual(
            normalize_doi("https://doi.org/10.1038/s41746-026-02413-y"),
            "10.1038/s41746-026-02413-y",
        )
        self.assertEqual(
            normalize_doi("DOI:10.1038/S41746-026-02413-Y"),
            "10.1038/s41746-026-02413-y",
        )

    def test_selects_only_unambiguous_published_open_access_version(self) -> None:
        records = [
            (
                "PMC12987969.1",
                {
                    "doi": "10.1038/s41746-026-02413-y",
                    "is_manuscript": False,
                    "is_pmc_openaccess": True,
                },
                b"{}",
            ),
            (
                "PMC12987969.2",
                {
                    "doi": "10.1038/s41746-026-02413-y",
                    "is_manuscript": True,
                    "is_pmc_openaccess": True,
                },
                b"{}",
            ),
        ]
        prefix, _, _ = select_published_open_access_version(records)
        self.assertEqual(prefix, "PMC12987969.1")

    def test_ambiguous_published_versions_fail_closed(self) -> None:
        records = [
            (
                "PMC12987969.1",
                {
                    "doi": "10.1038/s41746-026-02413-y",
                    "is_manuscript": "no",
                    "is_pmc_openaccess": "yes",
                },
                b"{}",
            ),
            (
                "PMC12987969.2",
                {
                    "doi": "10.1038/s41746-026-02413-y",
                    "is_manuscript": "no",
                    "is_pmc_openaccess": "yes",
                },
                b"{}",
            ),
        ]
        with self.assertRaises(ValueError):
            select_published_open_access_version(records)

    def test_extracts_expected_xlsx_from_string_and_object_media_urls(self) -> None:
        metadata = {
            "media_urls": [
                "s3://pmc-oa-opendata/PMC12987969.1/41746_2026_2413_MOESM2_ESM.xlsx?md5=abc",
                {
                    "url": "https://pmc-oa-opendata.s3.amazonaws.com/PMC12987969.1/41746_2026_2413_MOESM3_ESM.xlsx?md5=def"
                },
                "s3://pmc-oa-opendata/PMC12987969.1/figure.jpg?md5=123",
            ]
        }
        result = supplement_urls(metadata)
        self.assertEqual(set(result), set(EXPECTED_XLSX))
        self.assertTrue(result["41746_2026_2413_MOESM2_ESM.xlsx"].startswith("https://"))

    def test_missing_expected_workbook_fails_closed(self) -> None:
        metadata = {
            "media_urls": [
                "s3://pmc-oa-opendata/PMC12987969.1/41746_2026_2413_MOESM2_ESM.xlsx"
            ]
        }
        with self.assertRaises(ValueError):
            supplement_urls(metadata)

    def test_cloud_url_and_source_md5_helpers(self) -> None:
        url = normalize_cloud_url(
            "s3://pmc-oa-opendata/PMC12987969.1/file.xlsx?md5=ABCDEF"
        )
        self.assertEqual(
            url,
            "https://pmc-oa-opendata.s3.amazonaws.com/PMC12987969.1/file.xlsx?md5=ABCDEF",
        )
        self.assertEqual(source_md5_from_url(url), "abcdef")


if __name__ == "__main__":
    unittest.main()
