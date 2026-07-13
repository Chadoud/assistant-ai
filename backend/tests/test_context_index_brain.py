"""Tests for context_index brain-map export."""

from context_index import ContextIndex


def test_list_brain_map_files_exports_folders_and_excerpts(tmp_path):
    idx = ContextIndex(str(tmp_path / "ctx.json"))
    idx.update_with_classification("Invoices", "January electric bill 120 CHF", "/out/Invoices/jan.pdf")
    idx.update_with_classification("Invoices", "February gas bill", "/out/Invoices/feb.pdf")

    rows = idx.list_brain_map_files(max_folders=10, max_files_per_folder=10)
    assert len(rows) == 1
    assert rows[0]["folder_name"] == "Invoices"
    assert rows[0]["file_count"] == 2
    assert len(rows[0]["files"]) == 2
    paths = {f["path"] for f in rows[0]["files"]}
    assert "/out/Invoices/jan.pdf" in paths
    assert any("electric" in f["excerpt"].lower() for f in rows[0]["files"])


def test_list_brain_map_files_hides_os_junk(tmp_path):
    idx = ContextIndex(str(tmp_path / "ctx.json"))
    idx.update_with_classification("Invoices", "January electric bill", "/out/Invoices/jan.pdf")
    idx.update_with_classification("Invoices", "", "/out/Invoices/.DS_Store")
    idx.update_with_classification("Invoices", "", "/out/Invoices/Thumbs.db")

    rows = idx.list_brain_map_files(max_folders=10, max_files_per_folder=10)
    assert len(rows) == 1
    names = {f["name"] for f in rows[0]["files"]}
    assert names == {"jan.pdf"}
    assert rows[0]["file_count"] == 1


def test_list_brain_map_files_drops_folder_with_only_junk(tmp_path):
    idx = ContextIndex(str(tmp_path / "ctx.json"))
    idx.update_with_classification("Bud1", "", "/out/Bud1/.DS_Store")
    idx.update_with_classification("Bud1", "", "/out/Bud1/._cache")

    rows = idx.list_brain_map_files(max_folders=10, max_files_per_folder=10)
    assert rows == []


def test_list_brain_map_files_excludes_newsletter_folders(tmp_path):
    idx = ContextIndex(str(tmp_path / "ctx.json"))
    idx.update_with_classification(
        "Newsletters/Quora Digest",
        "Will doing push-ups improve your bench press",
        "/out/Newsletters/Quora Digest/q1.eml",
    )
    idx.update_with_classification(
        "Invoices",
        "January electric bill 120 CHF",
        "/out/Invoices/jan.pdf",
    )

    rows = idx.list_brain_map_files(max_folders=10, max_files_per_folder=10)
    assert len(rows) == 1
    assert rows[0]["folder_name"] == "Invoices"


def test_list_brain_map_files_filters_promotional_excerpt_in_real_folder(tmp_path):
    idx = ContextIndex(str(tmp_path / "ctx.json"))
    idx.update_with_classification(
        "Work",
        "Team contract draft",
        "/out/Work/contract.pdf",
    )
    idx.update_with_classification(
        "Work",
        "50% off — limited time newsletter sale",
        "/out/Work/promo.eml",
    )

    rows = idx.list_brain_map_files(max_folders=10, max_files_per_folder=10)
    assert len(rows) == 1
    names = {f["name"] for f in rows[0]["files"]}
    assert names == {"contract.pdf"}


def test_list_brain_map_files_hides_config_artifacts(tmp_path):
    idx = ContextIndex(str(tmp_path / "ctx.json"))
    idx.update_with_classification(
        "Config",
        '{ "_comment": "Copy from example" }',
        "/out/Config/integration-config.json",
    )
    idx.update_with_classification(
        "Invoices",
        "January electric bill 120 CHF",
        "/out/Invoices/jan.pdf",
    )

    rows = idx.list_brain_map_files(max_folders=10, max_files_per_folder=10)
    assert len(rows) == 1
    assert rows[0]["folder_name"] == "Invoices"
