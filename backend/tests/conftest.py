import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.routes import api


@pytest.fixture
def static_dir(tmp_path):
    d = tmp_path / "static"
    (d / "_app" / "immutable").mkdir(parents=True)
    (d / "index.html").write_text("<html>SPA</html>")
    (d / "_app" / "immutable" / "a.js").write_text("console.log(1)")
    (d / "manifest.webmanifest").write_text("{}")
    return d


@pytest.fixture
def client(static_dir):
    api._rate.clear()
    app = create_app(Settings(static_dir=static_dir))
    with TestClient(app) as c:
        yield c


@pytest.fixture
def user(client):
    r = client.post("/api/auth/guest")
    d = r.json()
    return {"h": {"Authorization": f"Bearer {d['token']}"}, **d}
