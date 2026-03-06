from tests.conftest import login


def test_explore_catalog_available_for_agent(client):
    login(client, "agent", "agent123")
    res = client.get("/api/explore/catalog")
    assert res.status_code == 200
    assert res.json["summary"]["total"] >= 1


def test_explore_catalog_filter_by_type(client):
    login(client, "admin", "admin123")
    res = client.get("/api/explore/catalog?type=webinar")
    assert res.status_code == 200
    assert all(x["type"] == "webinar" for x in res.json["items"])


def test_explore_recommendations_role_validation(client):
    login(client, "admin", "admin123")
    bad = client.get("/api/explore/recommendations?role=manager")
    assert bad.status_code == 400

    ok = client.get("/api/explore/recommendations?role=admin")
    assert ok.status_code == 200
    assert ok.json["role"] == "admin"
    assert len(ok.json["items"]) >= 1