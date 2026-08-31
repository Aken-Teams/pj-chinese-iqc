from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # MySQL
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_DB: str = "db_pj_chinese_iqc"
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""

    # AI
    DEEPSEEK_API_KEY: str = ""

    # On-premise LLM gateway (OpenAI-compatible). Used for CP file layout
    # detection, which sends real spec limits and header text — data we keep
    # inside the network rather than posting to a public API.
    #
    # Model choice is measured, not assumed: both models were benchmarked on the
    # two files the rule engine gets wrong. Qwen3-Coder scored 7/8 in ~2.1s;
    # gemma-3-27b scored 6/8 in ~6.1s and is a different family, so it makes a
    # genuinely independent verifier. See docs/layout-detection.md.
    LLM_BASE_URL: str = ""
    LLM_API_KEY: str = ""
    LLM_DETECT_MODEL: str = "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit"
    LLM_VERIFY_MODEL: str = "mlx-community/gemma-3-27b-it-qat-4bit"
    LLM_TIMEOUT_SECONDS: float = 90.0

    # AI token pricing (per 1,000,000 tokens) for the admin usage console's
    # cost estimate. Defaults follow DeepSeek deepseek-chat list pricing (USD);
    # override in .env if rates change.
    AI_PRICE_INPUT_PER_1M: float = 0.27
    AI_PRICE_OUTPUT_PER_1M: float = 1.10
    AI_PRICE_CURRENCY: str = "USD"

    # AD / LDAP (PANJIT group SSO gateway)
    AD_URL: str = ""
    AD_API: str = ""
    # Gateway TLS cert is missing a Subject Key Identifier, which modern OpenSSL
    # rejects; verification is off by default for this internal gateway.
    AD_VERIFY_SSL: bool = False

    # Password for the bootstrap admin account, used only when that account is
    # created on an empty database. Left blank, a random one is generated and
    # logged once — never hardcoded, since this file is in the repository.
    ADMIN_PASSWORD: str = ""

    # App
    SECRET_KEY: str = "iqc-system-secret-key-change-in-production"
    UPLOAD_DIR: str = str(Path(__file__).resolve().parent.parent / "uploads")

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}"
            "?charset=utf8mb4"
        )

    model_config = {
        "env_file": str(Path(__file__).resolve().parent.parent.parent / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
