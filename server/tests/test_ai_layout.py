"""Tests for the LLM-assisted layout stages.

No network: the gateway call is stubbed. What matters here is the contract
around the model — which fields it may touch, how malformed replies are
handled, and that an unreachable gateway degrades to the rule result instead of
failing an upload.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.parser import ai_layout  # noqa: E402
from app.services.parser.grid import open_grid  # noqa: E402
from app.services.parser.layout_detect import Candidate, LayoutDetection  # noqa: E402


@pytest.fixture
def sample_grid(tmp_path):
    p = tmp_path / "cp.csv"
    p.write_text(
        "TEST NUMBER,,,,1,2\n"        # r1 — an index row, not a limit
        "LOWER LIMIT,,,,0,0\n"        # r2
        "UPPER LIMIT,,,,10,20\n"      # r3
        "UNIT,,,,V,V\n"               # r4
        "WAFER,BIN,X,Y,P1,P2\n"       # r5
        "W01,1,0,0,1.0,2.0\n"
        "W01,1,1,0,1.1,2.1\n"
        "W01,1,2,0,1.2,2.2\n"
        "W01,1,3,0,1.3,2.3\n"
        "W01,1,4,0,1.4,2.4\n"
        "W01,1,5,0,1.5,2.5\n",
        encoding="utf-8")
    return open_grid(str(p))


class TestJsonExtraction:
    def test_plain_object(self):
        assert ai_layout._extract_json('{"header_row": 5}') == {"header_row": 5}

    def test_fenced_block(self):
        assert ai_layout._extract_json('```json\n{"header_row": 5}\n```') \
            == {"header_row": 5}

    def test_strips_harmony_channel_markers(self):
        """gpt-oss models leak their reasoning channel into the content."""
        raw = ('<|channel|>analysis<|message|>thinking out loud<|end|>'
               '<|start|>assistant<|channel|>final<|message|>{"header_row": 7}')
        assert ai_layout._extract_json(raw) == {"header_row": 7}

    @pytest.mark.parametrize("raw", ["", "no json here", "[1,2,3]", None])
    def test_rejects_unusable(self, raw):
        assert ai_layout._extract_json(raw) is None


class TestGracefulDegradation:
    def test_unconfigured_gateway_keeps_rule_result(self, sample_grid, monkeypatch):
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "")
        det, conflicts = ai_layout.detect_layout_full(sample_grid, use_ai=True)
        assert det.value("upper_limit_row") == 3
        assert conflicts == []
        assert any("未設定地端模型" in w for w in det.warnings)

    def test_gateway_failure_keeps_rule_result(self, sample_grid, monkeypatch):
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "http://x/v1")
        monkeypatch.setattr(ai_layout, "_ask", lambda *a, **k: None)
        det = ai_layout.complete_with_ai(
            sample_grid, ai_layout.detect_layout(sample_grid))
        assert det.value("upper_limit_row") == 3
        assert any("無回應" in w for w in det.warnings)


class TestFieldRestrictions:
    def test_structural_fields_are_off_limits(self):
        """The benchmark had both model families scoring 0/4 on
        electrical_start_col while the rules got it right, so the LLM is never
        asked about it — nor about the data start row."""
        assert "electrical_start_col" not in ai_layout.AI_FIELDS
        assert "data_start_row" not in ai_layout.AI_FIELDS

    def test_model_cannot_move_a_structural_field(self, sample_grid, monkeypatch):
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "http://x/v1")
        monkeypatch.setattr(
            ai_layout, "_ask",
            lambda *a, **k: {"header_row": 5, "data_start_row": 99,
                             "electrical_start_col": 99})
        det = ai_layout.detect_layout(sample_grid)
        before = det.value("data_start_row"), det.value("electrical_start_col")
        ai_layout.complete_with_ai(sample_grid, det)
        assert (det.value("data_start_row"),
                det.value("electrical_start_col")) == before

    def test_out_of_range_row_is_ignored(self, sample_grid, monkeypatch):
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "http://x/v1")
        monkeypatch.setattr(ai_layout, "_ask", lambda *a, **k: {"unit_row": 9999})
        det = LayoutDetection(fields={"unit_row": None})
        ai_layout.complete_with_ai(sample_grid, det)
        assert det.fields["unit_row"] is None

    def test_agreement_raises_confidence_without_replacing(self, sample_grid,
                                                          monkeypatch):
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "http://x/v1")
        monkeypatch.setattr(ai_layout, "_ask", lambda *a, **k: {"unit_row": 4})
        det = LayoutDetection(fields={
            "unit_row": Candidate(4, 0.5, "結構推斷", source="rule")})
        ai_layout.complete_with_ai(sample_grid, det)
        cand = det.fields["unit_row"]
        assert cand.value == 4
        assert cand.source == "rule"         # still the rule's answer
        assert cand.confidence >= 0.9        # but now corroborated
        assert "地端模型同意" in cand.evidence


class TestExcerpt:
    def test_reaches_the_label_column_of_wide_formats(self, sample_grid):
        """徐州's JJW dump keeps 'LOWER LIMIT' in column 14; a narrower excerpt
        made the model report the file had no limit rows at all."""
        assert ai_layout.EXCERPT_COLS >= 20

    def test_excerpt_is_row_numbered(self, sample_grid):
        text = ai_layout.grid_excerpt(sample_grid)
        assert text.startswith("r1 | TEST NUMBER")
        assert "r5 | WAFER | BIN" in text

    def test_excerpt_omits_the_data_body(self, sample_grid):
        """Only the header region is ever sent off the machine."""
        text = ai_layout.grid_excerpt(sample_grid, rows=5)
        assert "1.5" not in text


class TestVerification:
    def test_verify_is_off_by_default(self, sample_grid, monkeypatch):
        """Measured on all seven samples: zero true positives, three false
        positives. It stays available but must be asked for."""
        calls = []
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "http://x/v1")
        monkeypatch.setattr(ai_layout, "_ask",
                            lambda *a, **k: calls.append(k.get("feature")) or {})
        ai_layout.detect_layout_full(sample_grid, use_ai=True)
        assert "layout_verify" not in calls

    def test_mismatch_is_reported_not_applied(self, sample_grid, monkeypatch):
        monkeypatch.setattr(ai_layout.settings, "LLM_BASE_URL", "http://x/v1")
        monkeypatch.setattr(ai_layout, "_ask",
                            lambda *a, **k: {"upper_limit_row": 99})
        det = ai_layout.detect_layout(sample_grid)
        conflicts = ai_layout.verify_with_ai(sample_grid, det)
        assert det.value("upper_limit_row") == 3     # unchanged
        assert conflicts and conflicts[0]["field"] == "upper_limit_row"
        assert conflicts[0]["shouldBe"] == 99
