from openai import OpenAI
from app.config import settings


class AIService:
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com",
        )

    _SYSTEM_PROMPT = {
        "zh-TW": (
            "你是IQC晶圓CP測試數據審核專家，請使用繁體中文回覆。"
            "請針對提供的晶圓數據進行專業分析，包含："
            "1) 良率評估（正常／偏低／異常）；"
            "2) 電性參數中是否有標準差過大或均值偏移的參數；"
            "3) 不良Die的風險評估；"
            "4) 具體建議（是否需要加強監控、重新測試或退貨）。"
            "回覆控制在250字以內，語氣專業簡潔，可使用**粗體**標示重點。"
        ),
        "zh-CN": (
            "你是IQC晶圆CP测试数据审核专家，请使用简体中文回复。"
            "请针对提供的晶圆数据进行专业分析，包含："
            "1) 良率评估（正常／偏低／异常）；"
            "2) 电性参数中是否有标准差过大或均值偏移的参数；"
            "3) 不良Die的风险评估；"
            "4) 具体建议（是否需要加强监控、重新测试或退货）。"
            "回复控制在250字以内，语气专业简洁，可使用**粗体**标示重点。"
        ),
        "en": (
            "You are an IQC wafer CP test data review expert. Reply in English only. "
            "Analyze the provided wafer data professionally, covering: "
            "1) Yield assessment (normal/low/abnormal); "
            "2) Electrical parameters with excessive std dev or mean shift; "
            "3) Risk assessment of failing dies; "
            "4) Specific recommendations (enhanced monitoring, retest, or return). "
            "Keep the response under 200 words. Use **bold** to highlight key points."
        ),
    }

    _USER_PROMPT_HEADER = {
        "zh-TW": ("批次", "晶圓", "審查數據", "總Die數", "Bin1通過", "Bin1良率", "不良數",
                  "Bin分布", "注意參數異常", "電性參數明細", "請進行專業分析並給出具體建議。"),
        "zh-CN": ("批次", "晶圆", "审查数据", "总Die数", "Bin1通过", "Bin1良率", "不良数",
                  "Bin分布", "注意参数异常", "电性参数明细", "请进行专业分析并给出具体建议。"),
        "en": ("Lot", "Wafer", "Review Data", "Total Dies", "Bin1 Pass", "Bin1 Yield", "Fail Count",
               "Bin Distribution", "Flagged anomalies", "Electrical Parameters", "Please analyze and provide recommendations."),
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
        system_prompt = self._SYSTEM_PROMPT.get(lang, self._SYSTEM_PROMPT["zh-TW"])
        labels = self._USER_PROMPT_HEADER.get(lang, self._USER_PROMPT_HEADER["zh-TW"])
        prompt = self._build_prompt(wafer_id, lot_id, stats, electrical_params, bin_distribution, labels)
        try:
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
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
        labels: tuple,
    ) -> str:
        lot_lbl, wafer_lbl, data_lbl, total_lbl, pass_lbl, yield_lbl, fail_lbl, \
            bin_lbl, anomaly_lbl, params_lbl, conclude_lbl = labels

        # Flag parameters with high stdev (>10% of avg)
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
        anomaly_note = f"\n{anomaly_lbl}: {', '.join(anomalies)}" if anomalies else ""

        return (
            f"{lot_lbl} {lot_id} / {wafer_lbl} {wafer_id} {data_lbl}:\n"
            f"{total_lbl}: {stats.get('totalDies', 0)}, "
            f"{pass_lbl}: {stats.get('bin1Pass', 0)}, "
            f"{yield_lbl}: {stats.get('bin1Yield', 0):.2f}%, "
            f"{fail_lbl}: {stats.get('failCount', 0)}\n"
            f"{bin_lbl}: {bins_text}{anomaly_note}\n\n"
            f"{params_lbl}:\n{params_text}\n\n"
            f"{conclude_lbl}"
        )


# Singleton
ai_service = AIService()
