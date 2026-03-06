import os


class Config:
    SECRET_KEY = os.getenv("FLASK_SECRET", "dev-secret")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///mini_genesys.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    APP_ENV = os.getenv("APP_ENV", "development")
    ALLOW_SIMULATED_CALLS = os.getenv("ALLOW_SIMULATED_CALLS", "true").lower() == "true"

    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_API_KEY = os.getenv("TWILIO_API_KEY", "")
    TWILIO_API_SECRET = os.getenv("TWILIO_API_SECRET", "")
    TWILIO_APP_SID = os.getenv("TWILIO_APP_SID", "")
    TWILIO_CALLER_ID = os.getenv("TWILIO_CALLER_ID", "")
    TWILIO_WEBHOOK_BASE_URL = os.getenv("TWILIO_WEBHOOK_BASE_URL", "")
    TWILIO_VALIDATE_SIGNATURE = os.getenv("TWILIO_VALIDATE_SIGNATURE", "false").lower() == "true"

    SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "true").lower() == "true"
    CAMPAIGN_DIAL_INTERVAL_SECONDS = int(os.getenv("CAMPAIGN_DIAL_INTERVAL_SECONDS", "5"))
    CAMPAIGN_MAX_ATTEMPTS = int(os.getenv("CAMPAIGN_MAX_ATTEMPTS", "2"))