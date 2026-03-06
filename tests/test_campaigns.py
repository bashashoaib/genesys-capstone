from io import BytesIO

from tests.conftest import login


def test_campaign_state_transitions(client):
    login(client, "admin", "admin123")

    create = client.post("/api/campaigns", json={"name": "Q1"})
    assert create.status_code == 201
    campaign_id = create.json["id"]

    upload = client.post(
        f"/api/campaigns/{campaign_id}/contacts/upload",
        data={"file": (BytesIO(b"name,phone\nAlice,+14155552671"), "contacts.csv")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 200
    assert upload.json["inserted"] == 1

    start = client.post(f"/api/campaigns/{campaign_id}/start")
    assert start.status_code == 200
    assert start.json["status"] == "running"

    pause = client.post(f"/api/campaigns/{campaign_id}/pause")
    assert pause.status_code == 200
    assert pause.json["status"] == "paused"

    stop = client.post(f"/api/campaigns/{campaign_id}/stop")
    assert stop.status_code == 200
    assert stop.json["status"] == "stopped"