"""On-premise LLM assistance for CP layout detection (the L2 / L3 stages).

The division of labour here is measured, not assumed. Benchmarking nine local
models on the two files the rule engine gets wrong showed a clean split:

    field                 rules (L1)   LLM
    data_start_row           100%       --
    electrical_start_col      67%        0%     <- both top models got it wrong
    header_row                50%      100%
    upper_limit_row           50%      100%
    lower_limit_row           50%      100%

So the LLM is asked only about the *semantic* fields — which row is a spec
limit rather than a test index or a statistic — and is never allowed to
override the structural ones it demonstrably cannot do. L3 then re-checks the
merged answer with a different model family for an independent opinion.

Everything degrades gracefully: if the gateway is unreachable or misbehaves,
the L1 result is returned untouched with a warning attached.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from loguru import logger

from app.config import settings
from .grid import Grid
from .layout_detect import Candidate, LayoutDetection, detect_layout

# Fields the LLM may fill in or correct. Deliberately excludes
# data_start_row and electrical_start_col — see the module docstring.
AI_FIELDS = (
    "header_row",
    "id_header_row",
    "upper_limit_row",
    "lower_limit_row",
    "unit_row",
)

# Below this, a rule-derived field is treated as unproven and handed to the LLM.
LOW_CONFIDENCE = 0.8

EXCERPT_ROWS = 40
# Wide enough to reach the label column of every known format: 徐州's JJW dump
# keeps "LOWER LIMIT" in column 14 with its values from column 15, so a narrow
# excerpt made the model report that the file had no limit rows at all.
EXCERPT_COLS = 24
_CELL_WIDTH = 16

_DETECT_SYSTEM = (
    "You analyse semiconductor CP (chip probing) test files and identify the "
    "layout of the sheet. Reply with ONE JSON object and nothing else.\n"
    "Fields (all 1-indexed row numbers; use null when genuinely absent):\n"
    "  header_row       : the row holding the ELECTRICAL PARAMETER NAMES\n"
    "  id_header_row    : a SEPARATE row naming id columns (wafer/bin/x/y), or "
    "null when the same row names both\n"
    "  upper_limit_row  : the row holding the SPEC UPPER limit\n"
    "  lower_limit_row  : the row holding the SPEC LOWER limit\n"
    "  unit_row         : the row holding measurement units, or null\n"
    "CRITICAL: rows such as TEST NUMBER / Test# / Measure Item are test indices, "
    "and Average / AVE / STDEV / STDEF / MinData / MaxData describe the measured "
    "data. None of those are spec limits, even though they look like them. "
    "Spec limit rows are labelled like Max / Min / Max Limit / Min Limit / "
    "LimitU / LimitL / SPEC MAX / SPEC MIN / UPPER LIMIT / LOWER LIMIT / 上限 / 下限."
)

# L3 deliberately re-asks the detection question rather than asking the model to
# audit an answer. Measured on all seven sample files, an audit prompt returned
# 33 "disagreements" of which roughly twenty literally read "Correct." and the
# rest were wrong — models are agreeable when reviewing and much steadier when
# answering. Two independent answers compared in code is the sturdier signal.
_VERIFY_SYSTEM = _DETECT_SYSTEM


def is_configured() -> bool:
    return bool(settings.LLM_BASE_URL)


def _client():
    if not is_configured():
        return None
    from openai import OpenAI
    return OpenAI(api_key=settings.LLM_API_KEY or "not-needed",
                  base_url=settings.LLM_BASE_URL,
                  timeout=settings.LLM_TIMEOUT_SECONDS)


def grid_excerpt(grid: Grid, rows: int = EXCERPT_ROWS,
                 cols: int = EXCERPT_COLS) -> str:
    """Render the top-left block as numbered rows.

    Only the header region is sent — never the thousands of data rows — which
    keeps a request at roughly 1.5-3k tokens.
    """
    out = []
    for r in range(1, min(rows, grid.n_rows) + 1):
        cells = []
        for c in range(1, cols + 1):
            v = grid.cell(r, c)
            cells.append("" if v is None else str(v).strip()[:_CELL_WIDTH])
        while cells and cells[-1] == "":
            cells.pop()
        out.append("r%d | %s" % (r, " | ".join(cells)))
    return "\n".join(out)


def _extract_json(text: str) -> Optional[dict]:
    """Pull a JSON object out of a reply.

    gpt-oss models leak their harmony channel markers into the content, so the
    control blocks are stripped before looking for the object.
    """
    if not text:
        return None
    cleaned = re.sub(r"<\|channel\|>.*?<\|message\|>", "", text, flags=re.S)
    cleaned = re.sub(r"<\|[a-z_]+\|>", "", cleaned)
    cleaned = re.sub(r"```(?:json)?", "", cleaned)
    match = re.search(r"\{.*\}", cleaned, re.S)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _as_row(value: Any) -> Optional[int]:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n >= 1 else None


# Incremented by every gateway call so a caller can report how much AI ran.
# A clean file needs none, which looked like the AI had been skipped.
CALL_COUNTER = {"n": 0}


def _ask(model: str, system: str, user: str, *, feature: str,
         user_id: int | None = None) -> Optional[dict]:
    client = _client()
    if client is None:
        return None
    CALL_COUNTER["n"] += 1
    try:
        response = client.chat.completions.create(
            model=model, temperature=0,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
        )
    except Exception as exc:  # noqa: BLE001 — the gateway must never break upload
        logger.warning("layout LLM call failed (%s): %s", model, exc)
        return None

    # Metered like every other AI feature so the admin console sees the cost.
    try:
        from app.services.ai_service import record_token_usage
        record_token_usage(feature=feature, model=model,
                           usage=getattr(response, "usage", None),
                           user_id=user_id)
    except Exception:  # noqa: BLE001 — metering must never break detection
        pass

    try:
        content = response.choices[0].message.content or ""
    except (AttributeError, IndexError):
        return None
    return _extract_json(content)


# --- L2: fill in what the rules could not settle ------------------------
def complete_with_ai(grid: Grid, detection: LayoutDetection,
                     user_id: int | None = None) -> LayoutDetection:
    """Ask the detect model about semantic fields the rules left uncertain."""
    weak = [f for f in AI_FIELDS
            if (c := detection.fields.get(f)) is None or c.confidence < LOW_CONFIDENCE]
    if not weak:
        return detection
    if not is_configured():
        detection.warnings.append("未設定地端模型，僅使用規則辨識結果")
        return detection

    answer = _ask(
        settings.LLM_DETECT_MODEL, _DETECT_SYSTEM,
        "CP test file layout. First %d rows:\n\n%s\n\nReturn the JSON object."
        % (EXCERPT_ROWS, grid_excerpt(grid)),
        feature="layout_detect", user_id=user_id)
    if answer is None:
        detection.warnings.append("地端模型無回應，僅使用規則辨識結果")
        return detection

    for name in weak:
        row = _as_row(answer.get(name))
        if row is None or row > grid.n_rows:
            continue
        existing = detection.fields.get(name)
        if existing and existing.value == row:
            # Rules and model agree — that agreement is itself evidence.
            existing.confidence = min(0.99, max(existing.confidence, 0.9))
            existing.evidence += "；地端模型同意"
            continue
        detection.fields[name] = Candidate(
            row, 0.8, "地端模型判定第 %d 列（規則無法確定）" % row, source="ai")
        if name in detection.missing:
            detection.missing.remove(name)
    return detection


# --- L3: independent second opinion -------------------------------------
def verify_with_ai(grid: Grid, detection: LayoutDetection,
                   user_id: int | None = None) -> list[dict]:
    """Ask a second model family the same question, then compare in code.

    Only the semantic fields are compared. The structural ones are excluded on
    purpose: the benchmark showed both model families get
    `electrical_start_col` wrong while the rules get it right, so a model
    objecting there is noise, not signal.

    Nothing is changed automatically — a mismatch means the file is ambiguous
    and a human should settle it, not that the second model is right.
    """
    if not is_configured():
        return []
    answer = _ask(
        settings.LLM_VERIFY_MODEL, _VERIFY_SYSTEM,
        "CP test file layout. First %d rows:\n\n%s\n\nReturn the JSON object."
        % (EXCERPT_ROWS, grid_excerpt(grid)),
        feature="layout_verify", user_id=user_id)
    if not answer:
        return []

    out = []
    for name in ("header_row", "upper_limit_row", "lower_limit_row"):
        theirs = _as_row(answer.get(name))
        ours = detection.value(name)
        if theirs is None or ours is None:
            continue
        if theirs == ours:
            cand = detection.fields.get(name)
            if cand:
                # Independent agreement is real evidence; record it.
                cand.confidence = min(0.99, max(cand.confidence, 0.92))
                cand.evidence += "；驗證模型獨立判定相同"
            continue
        out.append({
            "field": name,
            "proposed": ours,
            "shouldBe": theirs,
            "why": "驗證模型（%s）獨立判定為第 %d 列"
                   % (settings.LLM_VERIFY_MODEL.split("/")[-1], theirs),
        })
    return out


# --- orchestration ------------------------------------------------------
def detect_layout_full(grid: Grid, use_ai: bool = True,
                       verify: bool = False,
                       user_id: int | None = None) -> tuple[LayoutDetection, list[dict]]:
    """Run L1, then L2 for the semantic fields the rules left uncertain.

    `verify` (the L3 cross-check) defaults to OFF, on evidence. Across all seven
    sample files L1+L2 agreed with the hand-verified truth on every field, while
    the verifier produced three mismatches — all of them wrong, and all on files
    the pipeline had already got right. Turning it on today would paint correct
    fields red for no measured benefit.

    The code stays because the measurement has an obvious gap: there is no
    sample where L1+L2 actually fails, so the verifier's true-positive rate is
    unmeasured rather than known to be zero. Revisit it when a file that defeats
    the pipeline turns up.

    Returns (detection, disagreements).
    """
    CALL_COUNTER["n"] = 0
    detection = detect_layout(grid)
    if not use_ai or not detection.fields.get("data_start_row"):
        return detection, []

    detection = complete_with_ai(grid, detection, user_id=user_id)
    conflicts = verify_with_ai(grid, detection, user_id=user_id) if verify else []
    for conflict in conflicts:
        cand = detection.fields.get(conflict["field"])
        if cand:
            # A flagged field must stop looking settled in the UI.
            cand.confidence = min(cand.confidence, 0.5)
        detection.warnings.append(
            "驗證模型對「%s」有異議：建議 %s（%s）"
            % (conflict["field"], conflict["shouldBe"], conflict["why"]))
    return detection, conflicts
