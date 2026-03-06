import pytest

from app import create_app
from app.extensions import db


class TestConfig:
    TESTING = True
    SECRET_KEY = "test"
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SCHEDULER_ENABLED = False
    ALLOW_SIMULATED_CALLS = True
    TWILIO_VALIDATE_SIGNATURE = False

    TWILIO_ACCOUNT_SID = ""
    TWILIO_AUTH_TOKEN = ""
    TWILIO_API_KEY = ""
    TWILIO_API_SECRET = ""
    TWILIO_APP_SID = ""
    TWILIO_CALLER_ID = "+14155550123"
    TWILIO_WEBHOOK_BASE_URL = "http://localhost:5000"


@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        from app import seed_routing_defaults, seed_users

        seed_users()
        seed_routing_defaults()
    yield app


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, username, password):
    return client.post("/auth/login", json={"username": username, "password": password})