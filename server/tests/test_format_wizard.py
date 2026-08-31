"""End-to-end tests for the template wizard endpoints.

Auth is stubbed; no database is touched. The point is the wizard contract:
a sample file in, a usable template out, and a dry-run that reports a bad
template as data rather than as an exception.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import settings  # noqa: E402
from app.dependencies import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402

from tests.test_real_formats import _find, JJW_FILE  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    # The wizard only reads user.id, so a detached instance is enough.
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, employee_id="t", name="Tester", password_hash="x", role="admin")
    # Constructed without a `with` block on purpose: entering the context would
    # run the app lifespan, which connects to MySQL and seeds it. These tests
    # touch no database.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def dongbu_file():
    path = _find("东部高科")
    if not path:
        pytest.skip("东部高科 sample not available")
    return path


def _upload(client, path, **form):
    with open(path, "rb") as fh:
        return client.post("/api/format-wizard/detect",
                           files={"file": (os.path.basename(path), fh.read())},
                           data={"use_ai": "false", **form})


class TestDetect:
    def test_returns_a_usable_template(self, client, dongbu_file):
        r = _upload(client, dongbu_file)
        assert r.status_code == 200, r.text
        body = r.json()
        t = body["template"]
        assert t["data_start_row"] == 15
        assert t["header_row"] == 10
        assert t["lower_limit_row"] == 11
        assert t["upper_limit_row"] == 12
        assert t["electrical_start_col"] == 7
        assert t["wafer_id_source"] == "column"

    def test_every_field_carries_evidence(self, client, dongbu_file):
        fields = _upload(client, dongbu_file).json()["fields"]
        populated = [f for f in fields.values() if f]
        assert populated
        for f in populated:
            assert f["evidence"]
            assert 0.0 <= f["confidence"] <= 1.0
            assert f["source"] in ("rule", "ai", "user")

    def test_preview_grid_is_returned(self, client, dongbu_file):
        preview = _upload(client, dongbu_file).json()["preview"]
        assert preview["nRows"] > 100
        assert preview["rows"][13][0] == "WAFER ID"   # r14, the id header row

    def test_missing_wafer_id_is_flagged_not_guessed(self, client):
        """世界先进 ships no wafer id; the wizard must say so in `missing` and
        leave the source unset for the user to choose."""
        path = _find("世界先进")
        if not path:
            pytest.skip("世界先进 sample not available")
        body = _upload(client, path).json()
        assert "wafer_id_source" in body["missing"]
        assert any("片號" in w for w in body["warnings"])

    def test_rejects_unsupported_extension(self, client, tmp_path):
        p = tmp_path / "notes.pdf"
        p.write_bytes(b"%PDF-1.4")
        with open(p, "rb") as fh:
            r = client.post("/api/format-wizard/detect",
                            files={"file": ("notes.pdf", fh.read())},
                            data={"use_ai": "false"})
        assert r.status_code == 400
        assert "不支援" in r.json()["detail"]


class TestDryRun:
    def _detect_then_dry_run(self, client, path, **overrides):
        body = _upload(client, path).json()
        template = dict(body["template"], **overrides)
        return client.post("/api/format-wizard/dry-run", json={
            "file_token": body["fileToken"], "template": template}).json()

    def test_detected_template_actually_parses(self, client, dongbu_file):
        out = self._detect_then_dry_run(client, dongbu_file)
        assert out["ok"], out
        assert out["waferCount"] >= 1
        assert out["dataRows"] > 100
        assert out["productId"] == "PJ0120N600G1"
        assert out["lotId"] == "1ACX01"
        assert out["paramNames"][0] == "OS"
        assert out["sampleRows"]

    def test_reports_spec_limits(self, client, dongbu_file):
        out = self._detect_then_dry_run(client, dongbu_file)
        assert any(s["lower"] is not None or s["upper"] is not None
                   for s in out["specs"])

    def test_incomplete_template_is_reported_as_data(self, client, dongbu_file):
        """A half-filled form is a normal state in this screen, not a 500."""
        body = _upload(client, dongbu_file).json()
        r = client.post("/api/format-wizard/dry-run", json={
            "file_token": body["fileToken"], "template": {"header_row": 10}})
        assert r.status_code == 200
        assert r.json()["ok"] is False
        assert "尚未設定" in r.json()["error"]

    def test_column_source_requires_a_column(self, client, dongbu_file):
        out = self._detect_then_dry_run(
            client, dongbu_file, wafer_id_source="column", wafer_id_col=None)
        assert out["ok"] is False
        assert "WAFER ID" in out["error"]

    def test_unset_source_asks_for_a_choice(self, client, dongbu_file):
        """世界先进's files resolve to no source at all; the dry-run must name
        the decision rather than complain about a column nobody chose."""
        out = self._detect_then_dry_run(client, dongbu_file, wafer_id_source=None)
        assert out["ok"] is False
        assert "片號來源" in out["error"]

    def test_wrong_wafer_column_surfaces_an_issue(self, client, dongbu_file):
        """Pointing the wafer id at an electrical column is exactly the mistake
        that used to reach production as wafer ids like "1.4728"."""
        out = self._detect_then_dry_run(client, dongbu_file, wafer_id_col=7)
        assert out["ok"]
        assert any("電性資料區" in i for i in out["issues"]), out["issues"]

    def test_bad_limit_rows_surface_an_issue(self, client, dongbu_file):
        out = self._detect_then_dry_run(
            client, dongbu_file, lower_limit_row=1, upper_limit_row=2)
        assert any("規格上下限" in i for i in out["issues"])

    def test_file_token_cannot_escape_the_upload_directory(self, client):
        r = client.post("/api/format-wizard/dry-run", json={
            "file_token": "../../../../etc/passwd",
            "template": {"header_row": 1, "data_start_row": 2,
                         "electrical_start_col": 1, "wafer_id_col": 1}})
        assert r.status_code == 400


class TestJjwRoundTrip:
    @pytest.mark.skipif(not os.path.exists(JJW_FILE), reason="JJW sample missing")
    def test_xuzhou_production_format(self, client):
        body = _upload(client, JJW_FILE).json()
        t = body["template"]
        assert (t["header_row"], t["data_start_row"]) == (8, 9)
        assert (t["lower_limit_row"], t["upper_limit_row"]) == (2, 3)
        assert t["electrical_start_col"] == 15
        out = client.post("/api/format-wizard/dry-run", json={
            "file_token": body["fileToken"], "template": t}).json()
        assert out["ok"]
        assert out["productId"] == "JI30050A"
        assert out["lotId"] == "PD03414"
