import json
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


    _ANOMALY_SYSTEM_PROMPT = {
        "zh-TW": (
            "你是IQC晶圓CP測試數據異常偵測專家，請使用繁體中文回覆。"
            "分析提供的電性參數統計數據，找出潛在異常。"
            "回傳純JSON陣列（不加任何包裝），每個異常物件包含以下欄位："
            "anomaly_type（繁體中文異常類型，如「高變異性」「均值偏移」「失控點」「良率異常」）、"
            "severity（'warning' 或 'critical'）、"
            "param_name（參數名稱字串）、"
            "confidence（0.0~1.0 浮點數）、"
            "description（繁體中文詳細描述）、"
            "suggestion（繁體中文改善建議）。"
            "若無異常，回傳空陣列 []。"
        ),
        "zh-CN": (
            "你是IQC晶圆CP测试数据异常检测专家，请使用简体中文回复。"
            "分析提供的电性参数统计数据，找出潜在异常。"
            "返回纯JSON数组（不加任何包装），每个异常对象包含以下字段："
            "anomaly_type（简体中文异常类型，如「高变异性」「均值偏移」「失控点」「良率异常」）、"
            "severity（'warning' 或 'critical'）、"
            "param_name（参数名称字符串）、"
            "confidence（0.0~1.0 浮点数）、"
            "description（简体中文详细描述）、"
            "suggestion（简体中文改善建议）。"
            "若无异常，返回空数组 []。"
        ),
        "en": (
            "You are an IQC wafer CP test data anomaly detection expert. Reply in English only. "
            "Analyze the provided electrical parameter statistics and identify potential anomalies. "
            "Return a pure JSON array (no wrapper), each anomaly object with fields: "
            "anomaly_type (e.g. 'High Variability', 'Mean Shift', 'Out of Control', 'Yield Issue'), "
            "severity ('warning' or 'critical'), "
            "param_name (string), "
            "confidence (float 0.0-1.0), "
            "description (detailed English description), "
            "suggestion (English recommendation). "
            "Return empty array [] if no anomalies found."
        ),
    }

    def detect_anomalies(
        self,
        lot_id: str,
        params_stats: dict,
        wafer_count: int,
        lang: str = "zh-TW",
    ) -> list[dict]:
        system_prompt = self._ANOMALY_SYSTEM_PROMPT.get(lang, self._ANOMALY_SYSTEM_PROMPT["zh-TW"])

        lines = []
        for name, p in params_stats.items():
            avg = p.get("avg", 0)
            stdev = p.get("stdev", 0)
            ratio = f"{abs(stdev / avg) * 100:.1f}%" if avg != 0 else "N/A"
            lines.append(
                f"  {name}: Avg={avg:.4f}, Stdev={stdev:.4f}, "
                f"Variation={ratio}, Min={p.get('min', 0):.4f}, Max={p.get('max', 0):.4f}"
            )

        prompt = (
            f"Lot {lot_id}, {wafer_count} wafers.\n"
            f"Parameter statistics:\n" + "\n".join(lines) + "\n\n"
            "Detect anomalies and return JSON array."
        )

        try:
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=1200,
                temperature=0.2,
            )
            content = response.choices[0].message.content or "[]"
            data = json.loads(content)
            if isinstance(data, list):
                return data
            # Handle {"anomalies": [...]} or {"items": [...]} wrapping
            for key in ("anomalies", "items", "results", "data"):
                if key in data and isinstance(data[key], list):
                    return data[key]
            return []
        except Exception:
            return []


# Singleton
ai_service = AIService()
