"""Tests for batch property clustering."""

from __future__ import annotations

import pathlib

from sort_structure.cluster import finalize_structure_property_clusters
from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate


def _country_property_auto_template() -> SortStructureTemplate:
    return SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                children=[
                    SortStructureModule(
                        id="p",
                        theme="property",
                        children=[SortStructureModule(id="a", theme="auto", children=[])],
                    )
                ],
            )
        ],
    )


def test_cluster_merges_building_32_rows() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "config": {"sort_structure_template": _country_property_auto_template().model_dump()},
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Apartment 0 In Street/Electricity",
                "structure_values": {"country": "Egypt", "property": "Apartment 0 In Street"},
                "document_briefing": "Electricity form plot 32 building 32 Hurghada hospital",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Infrastructure Project/Ownership",
                "structure_values": {"country": "Egypt", "property": "Infrastructure Project"},
                "document_briefing": "POA for plot 32 behind health directorate Hurghada",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 2
    folders = {f["suggested_folder"] for f in job["files"]}
    assert len(folders) == 2
    assert all(f.startswith("Egypt/Plot 32 — Hurghada/") for f in folders)
    assert job["files"][0]["decision_trace"].get("structure_cluster_id")
    assert (
        job["files"][0]["decision_trace"]["structure_cluster_id"]
        == job["files"][1]["decision_trace"]["structure_cluster_id"]
    )


def test_cluster_includes_uncertain_rows() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Uncertain",
                "structure_values": {"country": "Egypt"},
                "document_briefing": (
                    "canal electricity plot 32 hurghada hospital ministry justice"
                ),
                "decision_trace": {"structure_assist": {"auto_tail": "Electricity"}},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Uncertain",
                "structure_values": {"country": "Egypt"},
                "document_briefing": "POA plot 32 behind health directorate Hurghada basta",
                "structure_auto_tail": "Ownership",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 2
    assert all(
        f["suggested_folder"].startswith("Egypt/Plot 32 — Hurghada/")
        for f in job["files"]
    )


def test_cluster_skips_unrelated_plots() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Building 32 — Hospital Street/Electricity",
                "structure_values": {"country": "Egypt", "property": "Building 32 — Hospital Street"},
                "document_briefing": "plot 32 hurghada hospital",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Plot 204 — Intercontinental/Electricity",
                "structure_values": {"country": "Egypt", "property": "Plot 204 — Intercontinental"},
                "document_briefing": "plot 204 intercontinental hurghada",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 0
    assert len({f["suggested_folder"] for f in job["files"]}) == 2


def test_portfolio_cluster_pulls_general_property_rows() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "General Property",
                },
                "document_briefing": "Electricity form Hurghada hospital canal ministry justice",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Payments",
                "structure_values": {"country": "Egypt", "property": "General Property"},
                "document_briefing": (
                    "Cash deposit canal electricity Hurghada health directorate"
                ),
                "structure_auto_tail": "Payments",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Apartment 11, Street Of The Sea/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "Apartment 11, Street Of The Sea",
                },
                "document_briefing": (
                    "Ministry of Justice electricity meter Hurghada hospital street"
                ),
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n >= 3
    assert all(
        f["suggested_folder"].startswith("Egypt/Hurghada — Red Sea Utilities/")
        for f in job["files"]
    )
    cluster_ids = {
        f["decision_trace"].get("structure_cluster_id") for f in job["files"]
    }
    assert len(cluster_ids) == 1


def test_portfolio_cluster_canal_deposits_without_hurghada() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "General Property",
                },
                "document_briefing": "Electricity form Hurghada hospital canal",
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Payments",
                "structure_values": {"country": "Egypt", "property": "General Property"},
                "document_briefing": "Cash deposit شركة القناة لتوزيع 32 EGP",
                "structure_auto_tail": "Payments",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 2
    assert job["files"][1]["suggested_folder"] == "Egypt/Hurghada — Red Sea Utilities/Payments"


def test_portfolio_preserves_electricity_subject_row4() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "General Property",
                },
                "document_briefing": "Electricity Hurghada hospital canal ministry justice",
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property",
                "structure_values": {
                    "country": "Egypt",
                    "property": "General Property",
                },
                "document_briefing": (
                    "Canal health inspection form Hurghada hospital electricity wiring"
                ),
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n >= 2
    assert job["files"][1]["suggested_folder"] == "Egypt/Hurghada — Red Sea Utilities/Electricity"
    assert job["files"][1]["decision_trace"].get("structure_auto_tail") == "Electricity"


def test_portfolio_does_not_merge_cairo_contracts() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Building 32 — Hospital Street/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "Building 32 — Hospital Street",
                },
                "document_briefing": "Electricity Hurghada hospital canal",
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Contracts",
                "structure_values": {"country": "Egypt", "property": "General Property"},
                "document_briefing": "Formal letter from Cairo ministry correspondence",
                "structure_auto_tail": "Contracts",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 0
    assert job["files"][1]["suggested_folder"] == "Egypt/General Property/Contracts"


def test_portfolio_cluster_row12_apartment_moj_form() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/General Property/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "General Property",
                },
                "document_briefing": "Electricity form Hurghada hospital canal ministry justice",
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Apartment 11, Street Of The Sea/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "Apartment 11, Street Of The Sea",
                },
                "document_briefing": (
                    "Ministry of Justice electricity meter Hurghada hospital street"
                ),
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 2
    assert job["files"][1]["suggested_folder"] == "Egypt/Hurghada — Red Sea Utilities/Electricity"


def test_portfolio_cluster_pulls_uae_country_with_egypt_geo() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Building 32 — Hospital Street/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "Building 32 — Hospital Street",
                },
                "analysis_excerpt": (pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus" / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8"),
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "United Arab Emirates/Building 32 — Hospital Street/Electricity",
                "structure_values": {
                    "country": "United Arab Emirates",
                    "property": "Building 32 — Hospital Street",
                },
                "analysis_excerpt": (pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus" / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8"),
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 2
    assert job["files"][1]["suggested_folder"] == "Egypt/Plot 32 — Hurghada/Electricity"
    assert job["files"][1]["structure_values"]["country"] == "Egypt"


def test_portfolio_cluster_skips_boat_certificate() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Building 32 — Hospital Street/Electricity",
                "structure_values": {
                    "country": "Egypt",
                    "property": "Building 32 — Hospital Street",
                },
                "document_briefing": "Electricity Hurghada hospital canal",
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Port Of Hurghada",
                "structure_values": {"country": "Egypt", "property": "Port Of Hurghada"},
                "document_briefing": "Sea certificate boat registration Hurghada port",
                "primary_purpose": "boat registration",
                "structure_auto_tail": "Electricity",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert n == 0
    assert job["files"][1]["suggested_folder"] == "Egypt/Port Of Hurghada"


def test_cluster_skips_reconciled_rows() -> None:
    contract = compile_classify_contract(_country_property_auto_template(), language="English")
    job = {
        "config": {"sort_structure_template": _country_property_auto_template().model_dump()},
        "files": [
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Plot 32 — Hurghada/Electricity",
                "structure_values": {"country": "Egypt", "property": "Plot 32 — Hurghada"},
                "document_briefing": "MoJ meter building 32",
                "decision_trace": {"structure_reconcile": True},
            },
            {
                "status": "review_ready",
                "suggested_folder": "Egypt/Wrong Label/Electricity",
                "structure_values": {"country": "Egypt", "property": "Wrong Label"},
                "document_briefing": "Canal electricity plot 32 Hurghada",
                "decision_trace": {},
            },
        ],
    }
    n = finalize_structure_property_clusters(job, contract)
    assert job["files"][0]["suggested_folder"] == "Egypt/Plot 32 — Hurghada/Electricity"
    assert n <= 1
