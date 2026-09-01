"""Have the on-premise model read a cross-lot comparison.

議題五 asks for AI help interpreting several lots side by side. What it is given
is the statistics the page already computed — per-lot quartiles, the control
chart's limits and which rules fired — never raw die measurements. That keeps
the prompt small enough to answer well, and keeps a vendor's per-die data off
the wire even inside the network.

The on-premise gateway is used rather than DeepSeek for the same reason layout
detection uses it: this content is a supplier's yield and electrical
performance, which does not leave the network.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional

from openai import OpenAI

from app.config import settings

_SYSTEM = {
    "zh-TW": (
        "你是 IQC 晶圓 CP 資料分析專家，使用繁體中文回覆。"
        "使用者選了數個批次做比較，你會拿到每批的良率、電性分布統計，以及 SPC 管制圖結果。"
        "請回答三件事："
        "1) 哪一批和其他批不同，往哪個方向偏移，幅度多大；"
        "2) 這個偏移是否已經構成風險（有沒有逼近或超出規格、管制圖是否示警）；"
        "3) 建議的下一步。"
        "重要：良率正常但分布偏移仍然值得注意，請明確指出這種情況。"
        "若各批之間沒有明顯差異，就直接說沒有差異，不要編造問題。"
        "回覆 200 字以內，可用 **粗體** 標重點。"
    ),
    "zh-CN": (
        "你是 IQC 晶圆 CP 数据分析专家，使用简体中文回复。"
        "用户选了数个批次做比较，你会拿到每批的良率、电性分布统计，以及 SPC 管制图结果。"
        "请回答三件事："
        "1) 哪一批和其他批不同，往哪个方向偏移，幅度多大；"
        "2) 这个偏移是否已经构成风险（有没有逼近或超出规格、管制图是否示警）；"
        "3) 建议的下一步。"
        "重要：良率正常但分布偏移仍然值得注意，请明确指出这种情况。"
        "若各批之间没有明显差异，就直接说没有差异，不要编造问题。"
        "回复 200 字以内，可用 **粗体** 标重点。"
    ),
    "en": (
        "You are an IQC wafer CP data analyst. Reply in English. "
        "The user has selected several lots to compare. You are given each lot's "
        "yield, the distribution statistics for one electrical parameter, and the "
        "SPC control chart result. Answer three things: "
        "1) which lot differs from the others, in which direction, and by how much; "
        "2) whether that shift is a risk yet (near or past a spec limit, control "
        "rules firing); 3) what to do next. "
        "Important: a lot can pass on yield and still have shifted — say so "
        "plainly when that is the case. If the lots do not differ meaningfully, "
        "say so rather than inventing a problem. "
        "Keep it under 160 words. **Bold** the key point."
    ),
}


# U+FFFD is what a decoder emits for a byte sequence it could not read, and the
# gateway hands a few back mid-sentence ("1.9 �偏移至"). Also strips control
# characters and unassigned code points, which render as boxes. Whitespace and
# newlines are kept.
_UNRENDERABLE = re.compile(r"[�﻿]")


def clean_model_text(text: str) -> str:
    """Drop characters the model emitted that cannot be displayed.

    Only removes them; nothing is guessed at or substituted, so a sentence with
    a dropped character still reads as the model wrote it minus the noise.
    """
    text = _UNRENDERABLE.sub("", text)
    keep_ws = set(chr(9)) | set(chr(10)) | set(chr(13))
    kept = [ch for ch in text if ch in keep_ws
            or unicodedata.category(ch) not in ("Cc", "Cf", "Cn", "Co", "Cs")]
    # Collapse the double spaces a removal can leave behind.
    return re.sub(r"[ 　]{2,}", " ", "".join(kept)).strip()


def _client() -> Optional[OpenAI]:
    if not settings.LLM_BASE_URL:
        return None
    return OpenAI(base_url=settings.LLM_BASE_URL,
                  api_key=settings.LLM_API_KEY or "not-needed")


def build_brief(payload: dict[str, Any], param_name: str) -> str:
    """Turn the cross-lot response into a compact statistical brief.

    Numbers only, no raw measurements: a model reasons better about twelve lines
    of statistics than about ten thousand readings, and the readings would not
    fit in the context anyway.
    """
    lines: list[str] = []

    trend = payload.get("trend") or []
    if trend:
        lines.append("批次良率：")
        for p in trend:
            lines.append(
                "  %s（%s / %s，%s）BIN1 %s%%，%d 片，判定 %s%s" % (
                    p.get("lot"), p.get("vendor"), p.get("product"),
                    (p.get("date") or "")[:10], p.get("bin1Yield"),
                    p.get("waferCount") or 0, p.get("judgement") or "未判定",
                    "" if p.get("dateIsTestDate") else "（無測試日期，以上傳時間排序）",
                ))

    boxes = payload.get("boxes") or []
    if boxes:
        lines.append("")
        lines.append("電性項目 %s 的分布（每批）：" % param_name)
        for b in boxes:
            spec = ""
            if b.get("lower") is not None or b.get("upper") is not None:
                spec = "，規格 %s ~ %s" % (b.get("lower"), b.get("upper"))
            lines.append(
                "  %s 中位數 %.6g，Q1 %.6g，Q3 %.6g，範圍 %.6g ~ %.6g，"
                "平均 %.6g，標準差 %.6g，樣本 %d，離群 %d%s" % (
                    b.get("lot"), b["median"], b["q1"], b["q3"], b["min"], b["max"],
                    b["mean"], b["stdev"], b["n"], b["outlierCount"], spec))

    spc = payload.get("spc")
    if spc:
        points = spc.get("dataPoints") or []
        fired: dict[str, int] = {}
        for p in points:
            if p.get("isOoc"):
                fired[p["oocReason"]] = fired.get(p["oocReason"], 0) + 1
        names = {"ucl": "超出 UCL", "lcl": "低於 LCL",
                 "run": "連 7 點同側", "trend": "連 6 點趨勢"}
        lines.append("")
        lines.append(
            "SPC 管制圖（每片 wafer 一點，共 %d 點）：均值 %.6g，UCL %.6g，LCL %.6g" % (
                len(points), spc["grandMean"], spc["ucl"], spc["lcl"]))
        if fired:
            lines.append("  違規：" + "、".join(
                "%s %d 點" % (names.get(k, k), v) for k, v in sorted(fired.items())))
        else:
            lines.append("  全部在管制內")

    return "\n".join(lines)


def summarise_cross_lot(payload: dict[str, Any], param_name: str,
                        lang: str = "zh-TW") -> tuple[str, str]:
    """(summary text, model name). Raises RuntimeError when no gateway is set."""
    client = _client()
    if client is None:
        raise RuntimeError("LLM_BASE_URL is not configured")

    brief = build_brief(payload, param_name)
    model = settings.LLM_DETECT_MODEL
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM.get(lang, _SYSTEM["zh-TW"])},
            {"role": "user", "content": brief},
        ],
        max_tokens=700,
        temperature=0.3,
        timeout=settings.LLM_TIMEOUT_SECONDS,
    )
    return clean_model_text(response.choices[0].message.content or ""), model
