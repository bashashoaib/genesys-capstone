from datetime import datetime

from tests.conftest import login
from app.extensions import db
from app.models import AgentPresence, Queue, RoutingInteraction, User


def test_queue_crud_and_membership(client, app):
    login(client, "admin", "admin123")

    create = client.post("/api/routing/queues", json={"name": "Sales-US", "description": "Sales queue"})
    assert create.status_code == 201
    queue_id = create.json["id"]

    listing = client.get("/api/routing/queues")
    assert listing.status_code == 200
    assert any(x["id"] == queue_id for x in listing.json)

    with app.app_context():
        agent = User.query.filter_by(username="agent").first()

    add_member = client.post(f"/api/routing/queues/{queue_id}/members", json={"user_id": agent.id, "priority": 3, "is_active": True})
    assert add_member.status_code == 200

    members = client.get(f"/api/routing/queues/{queue_id}/members")
    assert members.status_code == 200
    assert any(m["user_id"] == agent.id for m in members.json)


def test_architect_flow_create_publish(client, app):
    login(client, "admin", "admin123")

    with app.app_context():
        queue = Queue.query.filter_by(name="Support-Default").first()

    create = client.post(
        "/api/architect/flows",
        json={
            "name": "Inbound Sales Flow",
            "flow_type": "inbound_call",
            "target_queue_id": queue.id,
            "inbound_number": "+14155550000",
            "welcome_prompt": "Thanks for calling sales.",
        },
    )
    assert create.status_code == 201
    flow_id = create.json["id"]

    publish = client.post(f"/api/architect/flows/{flow_id}/publish")
    assert publish.status_code == 200
    assert publish.json["is_published"] is True

    flows = client.get("/api/architect/flows")
    assert flows.status_code == 200
    assert any(f["id"] == flow_id for f in flows.json)


def test_routing_interactions_endpoint(client):
    login(client, "agent", "agent123")
    res = client.get("/api/routing/interactions?limit=10")
    assert res.status_code == 200
    assert isinstance(res.json, list)


def test_routing_agents_endpoint(client):
    login(client, "admin", "admin123")
    res = client.get("/api/routing/agents")
    assert res.status_code == 200
    assert any(u["username"] == "agent" for u in res.json)


def test_inbound_webhook_idempotent_by_callsid(client, app):
    with app.app_context():
        agent = User.query.filter_by(username="agent").first()
        presence = AgentPresence.query.filter_by(user_id=agent.id).first()
        presence.status = "available"
        presence.updated_at = datetime.utcnow()
        db.session.commit()

    payload = {"To": "+14155550000", "From": "+14155550199", "CallSid": "CA-DEDUPE-1"}
    first = client.post("/webhooks/twilio/voice/inbound", data=payload)
    second = client.post("/webhooks/twilio/voice/inbound", data=payload)
    assert first.status_code == 200
    assert second.status_code == 200

    with app.app_context():
        count = RoutingInteraction.query.filter_by(twilio_sid="CA-DEDUPE-1").count()
        assert count == 1