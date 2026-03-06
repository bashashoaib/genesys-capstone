from tests.conftest import login


def test_cloud_overview_endpoint(client):
    login(client, "agent", "agent123")
    res = client.get("/api/cloud-replica/overview")
    assert res.status_code == 200
    assert res.json["modules_total"] >= 10


def test_cloud_modules_filter(client):
    login(client, "admin", "admin123")
    res = client.get("/api/cloud-replica/modules?category=AI")
    assert res.status_code == 200
    assert all(item["category"] == "AI" for item in res.json["items"])


def test_cloud_module_detail_and_dummy_action(client):
    login(client, "admin", "admin123")
    detail = client.get("/api/cloud-replica/module/admin")
    assert detail.status_code == 200
    assert detail.json["module"]["id"] == "admin"

    action = client.post("/api/cloud-replica/action", json={"action": "anything"})
    assert action.status_code == 200
    assert action.json["ok"] is True