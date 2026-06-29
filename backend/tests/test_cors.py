from fastapi.testclient import TestClient

from app.main import app


def test_cors_allows_local_vite_dev_ports() -> None:
    with TestClient(app) as client:
        response = client.options(
            "/api/analysis",
            headers={
                "Origin": "http://127.0.0.1:5174",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"
