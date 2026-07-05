from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"

    ONEC_BASE_URL: str
    ONEC_USERNAME: str
    ONEC_PASSWORD: str
    ONEC_ORG_GUID: str

    DIADOC_API_CLIENT_ID: str
    DIADOC_LOGIN: str
    DIADOC_PASSWORD: str
    DIADOC_FROM_BOX_ID: str

    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SMTP_FROM: str

    PDF_STORAGE_PATH: str = "./pdfs"
    UPLOAD_DIR: str = "uploads"

    TELEGRAM_BOT_TOKEN: str = ""   # Set via .env — get from @BotFather
    TELEGRAM_CHAT_ID:   str = ""   # Default chat to notify (optional)

    API_EXTERNAL_URL: str = "http://159.194.225.55:8018"  # Public URL for links in TG messages

    SECRET_KEY: str = "change-me-in-production-32-chars-min"  # Override in .env

    model_config = {"env_file": ".env"}


settings = Settings()
