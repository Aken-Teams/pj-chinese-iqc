from openai import OpenAI
from app.config import settings


class AIService:
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com",
        )

    def generate_review_summary(
        self,
        wafer_id: str,
        lot_id: str,
        stats: dict,
        electrical_params: list[dict],
        bin_distribution: list[dict],
    ) -> str:
        prompt = self._build_prompt(wafer_id, lot_id, stats, electrical_params, bin_distribution)
        try:
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是IQC晶圆CP数据审核专家。"
                            "请用简洁的中文摘要审查结果，包含关键发现和建议。"
                            "回复控制在150字以内。"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=500,
                temperature=0.3,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            return f"AI 摘要生成失败: {str(e)}"

    def _build_prompt(
        self,
        wafer_id: str,
        lot_id: str,
        stats: dict,
        electrical_params: list[dict],
        bin_distribution: list[dict],
    ) -> str:
        params_text = "\n".join(
            f"  {p['param']}: Avg={p['avg']}, Stdev={p['stdev']}, Min={p['min']}, Max={p['max']}"
            for p in electrical_params
        )
        bins_text = ", ".join(f"Bin{b['bin']}={b['count']}" for b in bin_distribution)

        return (
            f"批次 {lot_id} / 晶圆 {wafer_id} 审查数据:\n"
            f"总Die数: {stats.get('totalDies', 0)}, "
            f"Bin1通过: {stats.get('bin1Pass', 0)}, "
            f"Bin1良率: {stats.get('bin1Yield', 0):.2f}%, "
            f"不良数: {stats.get('failCount', 0)}\n\n"
            f"电性参数:\n{params_text}\n\n"
            f"Bin分布: {bins_text}\n\n"
            f"请分析此晶圆的整体质量状况，指出潜在风险，并给出建议。"
        )


# Singleton
ai_service = AIService()
