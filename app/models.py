from __future__ import annotations

from datetime import datetime

from flask_login import UserMixin

from app.extensions import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="agent")
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    presence = db.relationship("AgentPresence", back_populates="user", uselist=False, cascade="all, delete-orphan")


class AgentPresence(db.Model):
    __tablename__ = "agent_presence"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    status = db.Column(db.String(20), nullable=False, default="offline")
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship("User", back_populates="presence")


class CallLog(db.Model):
    __tablename__ = "call_logs"

    id = db.Column(db.Integer, primary_key=True)
    direction = db.Column(db.String(20), nullable=False)
    from_number = db.Column(db.String(30), nullable=False)
    to_number = db.Column(db.String(30), nullable=False)
    twilio_sid = db.Column(db.String(64), unique=True, nullable=True)
    status = db.Column(db.String(32), nullable=False, default="queued")
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    campaign_contact_id = db.Column(db.Integer, db.ForeignKey("campaign_contacts.id"), nullable=True)


class Campaign(db.Model):
    __tablename__ = "campaigns"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="draft")
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    started_at = db.Column(db.DateTime, nullable=True)
    stopped_at = db.Column(db.DateTime, nullable=True)

    contacts = db.relationship("CampaignContact", back_populates="campaign", cascade="all, delete-orphan")


class CampaignContact(db.Model):
    __tablename__ = "campaign_contacts"

    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey("campaigns.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")
    attempt_count = db.Column(db.Integer, nullable=False, default=0)
    last_error = db.Column(db.Text, nullable=True)
    call_sid = db.Column(db.String(64), nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    campaign = db.relationship("Campaign", back_populates="contacts")
    call_logs = db.relationship("CallLog", backref="campaign_contact")


def utcnow() -> datetime:
    return datetime.utcnow()