from __future__ import annotations

from flask import Flask
from werkzeug.security import generate_password_hash

from config import Config
from app.auth import bp as auth_bp
from app.calls import bp as calls_bp
from app.campaigns import bp as campaigns_bp
from app.cloud_mock import bp as cloud_mock_bp
from app.explore import bp as explore_bp
from app.extensions import db, login_manager, migrate
from app.main import bp as main_bp
from app.models import AgentPresence, User
from app.services.campaign_worker import init_scheduler
from app.voice import bp as voice_bp


@login_manager.user_loader
def load_user(user_id: str):
    return User.query.get(int(user_id))


def create_app(config_obj=Config):
    app = Flask(__name__)
    app.config.from_object(config_obj)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(voice_bp)
    app.register_blueprint(calls_bp)
    app.register_blueprint(campaigns_bp)
    app.register_blueprint(cloud_mock_bp)
    app.register_blueprint(explore_bp)

    with app.app_context():
        db.create_all()
        seed_users()

    init_scheduler(app)

    return app


def seed_users():
    admin = User.query.filter_by(username="admin").first()
    if not admin:
        admin = User(
            username="admin",
            password_hash=generate_password_hash("admin123"),
            role="admin",
            is_active=True,
        )
        db.session.add(admin)
        db.session.flush()
        db.session.add(AgentPresence(user_id=admin.id, status="offline"))

    agent = User.query.filter_by(username="agent").first()
    if not agent:
        agent = User(
            username="agent",
            password_hash=generate_password_hash("agent123"),
            role="agent",
            is_active=True,
        )
        db.session.add(agent)
        db.session.flush()
        db.session.add(AgentPresence(user_id=agent.id, status="offline"))

    db.session.commit()