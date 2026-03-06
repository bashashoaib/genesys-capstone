from tests.conftest import login


def test_login_logout_and_me(client):
    res = login(client, "admin", "admin123")
    assert res.status_code == 200

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json["authenticated"] is True
    assert me.json["role"] == "admin"

    out = client.post("/auth/logout")
    assert out.status_code == 200

    me2 = client.get("/auth/me")
    assert me2.json["authenticated"] is False


def test_role_guard_blocks_agent_for_campaign_create(client):
    login(client, "agent", "agent123")
    res = client.post("/api/campaigns", json={"name": "x"})
    assert res.status_code == 403