"""Tests for wftdm_dashboard.postprocessor.manifest (T017)."""

from __future__ import annotations

import yaml

from wftdm_dashboard.postprocessor.manifest import TABLEAU10, generate_manifest, write_manifest


def test_display_name_falls_back_to_scenario_name():
    manifest = generate_manifest(scenario_name="abm_2026")

    assert manifest.display_name == "abm_2026"


def test_display_name_uses_supplied_value_when_given():
    manifest = generate_manifest(scenario_name="abm_2026", display_name="2026 ABM Baseline")

    assert manifest.display_name == "2026 ABM Baseline"


def test_engine_is_always_activitysim():
    manifest = generate_manifest(scenario_name="x")

    assert manifest.engine == "activitysim"


def test_pinned_defaults_to_false():
    manifest = generate_manifest(scenario_name="x")

    assert manifest.pinned is False


def test_pinned_true_when_requested():
    manifest = generate_manifest(scenario_name="x", pinned=True)

    assert manifest.pinned is True


def test_model_version_and_notes_default_to_none():
    manifest = generate_manifest(scenario_name="x")

    assert manifest.model_version is None
    assert manifest.notes is None


def test_color_is_deterministic_across_repeated_calls():
    first = generate_manifest(scenario_name="abm_2026").color
    second = generate_manifest(scenario_name="abm_2026").color

    assert first == second
    assert first in TABLEAU10


def test_explicit_color_is_used_verbatim():
    manifest = generate_manifest(scenario_name="x", color="#123456")

    assert manifest.color == "#123456"


def test_write_manifest_omits_model_version_and_notes_when_not_supplied(tmp_path):
    manifest = generate_manifest(scenario_name="abm_2026", run_date="2026-06-15")

    path = write_manifest(manifest, tmp_path)

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert "model_version" not in data
    assert "notes" not in data
    assert data["scenario_name"] == "abm_2026"
    assert data["run_date"] == "2026-06-15"


def test_write_manifest_includes_model_version_and_notes_when_supplied(tmp_path):
    manifest = generate_manifest(
        scenario_name="abm_2026", model_version="1.3", notes="First full-region run"
    )

    path = write_manifest(manifest, tmp_path)

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert data["model_version"] == "1.3"
    assert data["notes"] == "First full-region run"
