"""
Test that backend.main and every API router imports cleanly without syntax errors or runtime import failures.
"""
import importlib
import pytest


def test_import_backend_main():
    """Verify backend.main can be imported cleanly."""
    mod = importlib.import_module("backend.main")
    assert hasattr(mod, "app")
    assert mod.app is not None


@pytest.mark.parametrize(
    "router_module",
    [
        "backend.routers.admin",
        "backend.routers.tasks",
        "backend.routers.chat",
        "backend.routers.agent",
        "backend.routers.calendar",
        "backend.routers.auth",
        "backend.routers.migration",
        "backend.routers.profile",
        "backend.routers.persona",
        "backend.routers.parked",
        "backend.routers.specialist",
        "backend.routers.radar",
        "backend.routers.career",
    ],
)
def test_import_each_router(router_module: str):
    """Verify each router module imports cleanly and exports a FastAPI APIRouter."""
    mod = importlib.import_module(router_module)
    assert hasattr(mod, "router")
    assert mod.router is not None
