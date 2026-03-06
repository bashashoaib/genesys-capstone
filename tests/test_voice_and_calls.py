from datetime import datetime
from io import BytesIO

from tests.conftest import login
from app.extensions import db
from app.models import AgentPresence, CallLog, CampaignContact, RoutingInteraction, User


def test_inbound_webhook_routes_to_available_agent(client, app):
    with app.app_context():
        agent = User.query.filter_by(username="agent").first()
        presence = AgentPresence.query.filter_by(user_id=agent.id).first()
        presence.status = "available"
        presence.updated_at = datetime.utcnow()
        db.session.commit()

    res = client.post("/webhooks/twilio/voice/inbound", data={"To": "+14155550000", "From": "+14155550199", "CallSid": "CA-IN-1"})
    assert res.status_code == 200
    assert b"<Client>agent-" in res.data

    with app.app_context():
        interaction = RoutingInteraction.query.filter_by(twilio_sid="CA-IN-1").first()
        assert interaction is not None
        assert interaction.assigned_user_id is not None


def test_inbound_webhook_offline_message(client, app):
    with app.app_context():
        for presence in AgentPresence.query.all():
            presence.status = "offline"
        db.session.commit()

    res = client.post("/webhooks/twilio/voice/inbound", data={"To": "+14155550000", "From": "+14155550199", "CallSid": "CA-IN-2"})
    assert res.status_code == 200
    assert b"No routed agent" in res.data


def test_manual_outbound_creates_call_log(client, app):
    login(client, "agent", "agent123")

    res = client.post("/api/calls/manual", json={"to_number": "+14155552671"})
    assert res.status_code == 200

    with app.app_context():
        logs = CallLog.query.all()
        assert len(logs) == 1
        assert logs[0].direction == "manual"
        assert logs[0].status in {"ringing", "queued"}


def test_call_status_webhook_updates_campaign_contact(client, app):
    login(client, "admin", "admin123")

    create = client.post("/api/campaigns", json={"name": "webhook-test"})
    campaign_id = create.json["id"]
    client.post(
        f"/api/campaigns/{campaign_id}/contacts/upload",
        data={"file": (BytesIO(b"name,phone\nA,+14155552671"), "contacts.csv")},
        content_type="multipart/form-data",
    )

    with app.app_context():
        contact = CampaignContact.query.filter_by(campaign_id=campaign_id).first()
        contact.call_sid = "CA123"
        db.session.commit()

    res = client.post("/webhooks/twilio/call-status", data={"CallSid": "CA123", "CallStatus": "completed"})
    assert res.status_code == 204

    with app.app_context():
        contact = CampaignContact.query.filter_by(call_sid="CA123").first()
        assert contact.status == "answered"