from openai import OpenAI
from app.config import settings


class AIService:
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com",
        )

    _LANG_INSTRUCTION = {
        "zh-TW": "請使用繁體中文回覆。",
        "zh-CN": "请使用简体中文回复。",
        "en": "Please reply in English.",
    }

    def generate_review_summary(
        self,
        wafer_id: str,
        lot_id: str,
        stats: dict,
        electrical_params: list[dict],
        bin_distribution: list[dict],
        lang: str = "zh-TW",
    ) -> str:
        lang_instruction = self._LANG_INSTRUCTION.get(lang, self._LANG_INSTRUCTION["zh-TW"])
        prompt = self._build_prompt(wafer_id, lot_id, stats, electrical_params, bin_distribution)
        try:
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"你是IQC晶圓CP測試數據審核專家。{lang_instruction}"
                            "請針對提供的晶圓數據進行專業分析，包含："
                            "1) 良率評估（正常/偏低/異常）；"
                            "2) 電性參數中是否有標準差過大或均值偏移的參數；"
                            "3) 不良Die的風險評估；"
                            "4) 具體建議（是否需要加強監控、重新測試或退貨）。"
                            "回覆控制在200字以內，語氣專業簡潔。"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=600,
                temperature=0.3,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            return f"AI summary generation failed: {str(e)}"

    def _build_prompt(
        self,
        wafer_id: str,
        lot_id: str,
        stats: dict,
        electrical_params: list[dict],
        bin_distribution: list[dict],
    ) -> str:
        # Flag parameters with high stdev (>10% of avg) or extreme range
        anomalies = []
        for p in electrical_params:
            try:
                avg = float(p['avg'])
                stdev = float(p['stdev'])
                if avg != 0 and stdev / abs(avg) > 0.1:
                    anomalies.append(f"{p['param']}(stdev/avg={stdev/abs(avg)*100:.1f}%)")
            except (ValueError, ZeroDivisionError):
                pass

        params_text = "\n".join(
            f"  {p['param']}: Avg={p['avg']}, Stdev={p['stdev']}, Min={p['min']}, Max={p['max']}"
            for p in electrical_params
        )
        bins_text = ", ".join(f"Bin{b['bin']}={b['count']}" for b in bin_distribution)
        anomaly_note = f"\n注意參數異常: {', '.join(anomalies)}" if anomalies else ""

        return (
            f"批次 {lot_id} / 晶圓 {wafer_id} 審查數據:\n"
            f"總Die數: {stats.get('totalDies', 0)}, "
            f"Bin1通過: {stats.get('bin1Pass', 0)}, "
            f"Bin1良率: {stats.get('bin1Yield', 0):.2f}%, "
            f"不良數: {stats.get('failCount', 0)}\n"
            f"Bin分布: {bins_text}{anomaly_note}\n\n"
            f"電性參數明細:\n{params_text}\n\n"
            f"請進行專業分析並給出具體建議。"
        )


# Singleton
ai_service = AIService()
