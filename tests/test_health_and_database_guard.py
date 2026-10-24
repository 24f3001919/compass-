"""
Tests for health endpoint privacy and database target startup guard.
Verifies:
1. /health never contains a DB host, URL, or credential.
2. Startup guard refuses to start when DATABASE_URL matches PROTECTED_DB_HOSTS
   and RENDER is not set, regardless of ENVIRONMENT (dev, test, prod, unset).
3. Startup guard allows execution when RENDER environment variable is present.
4. Real pooled (ep-sweet-fire-b2y9w95z-pooler...) and unpooled (ep-sweet-fire-b2y9w95z...)
   Neon hostnames match against endpoint ID substring PROTECTED_DB_HOSTS=ep-sweet-fire-b2y9w95z.
5. DATABASE_URL_UNPOOLED, TEST_DATABASE_URL, and any *_DATABASE_URL* env var are inspected.
6. TEST_DATABASE_URL must NEVER match a protected host even when RENDER is set!
7. get_masked_database_hosts() properly masks all configured database hostnames.
"""

import os
import pytest
from httpx import AsyncClient
from backend.config import Settings


@pytest.mark.asyncio
async def test_health_check_never_leaks_database_host_or_credentials(client: AsyncClient):
    """Ensure GET /health does not expose database host, URLs, or credentials."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()

    # Explicitly check forbidden keys
    forbidden_keys = {"database_host", "db_host", "database_url", "url", "password", "username", "credential"}
    assert not (forbidden_keys & set(data.keys())), f"Forbidden keys leaked in /health: {forbidden_keys & set(data.keys())}"

    # Verify no string value contains postgresql://, a host, or masked creds
    for key, value in data.items():
        if isinstance(value, str):
            assert "postgresql://" not in value.lower()
            assert "@" not in value
            assert "ep-" not in value.lower()
            assert "neon.tech" not in value.lower()

    # Allowed keys
    assert set(data.keys()) == {"status", "version", "database", "db_connected", "commit", "config_ok"}


def test_guard_refuses_when_no_render_across_environments(monkeypatch):
    """Startup guard must refuse when DATABASE_URL matches PROTECTED_DB_HOSTS and RENDER is absent,
    across development, test, unset ENVIRONMENT, and production (outside Render)."""
    monkeypatch.delenv("RENDER", raising=False)

    protected_host = "ep-sweet-fire-b2y9w95z"
    db_url = f"postgresql://compass:secret@{protected_host}.us-east-2.aws.neon.tech/compass"

    # Test across environments
    for env_val in ["development", "test", "", "production", "staging"]:
        if env_val:
            monkeypatch.setenv("ENVIRONMENT", env_val)
        else:
            monkeypatch.delenv("ENVIRONMENT", raising=False)

        settings = Settings(
            DATABASE_URL=db_url,
            PROTECTED_DB_HOSTS=protected_host,
        )

        with pytest.raises(RuntimeError) as exc_info:
            settings.validate_database_target()

        assert "STARTUP REFUSED" in str(exc_info.value)
        assert protected_host in str(exc_info.value)


def test_guard_allows_when_render_env_present(monkeypatch):
    """When running on Render (RENDER env var set), protected DB host is allowed."""
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("ENVIRONMENT", "production")

    protected_host = "ep-sweet-fire-b2y9w95z"
    db_url = f"postgresql://compass:secret@{protected_host}.us-east-2.aws.neon.tech/compass"

    settings = Settings(
        DATABASE_URL=db_url,
        PROTECTED_DB_HOSTS=protected_host,
    )

    # Should not raise
    settings.validate_database_target()


def test_guard_allows_non_protected_hosts(monkeypatch):
    """When DATABASE_URL points to a non-protected host, guard passes even without RENDER."""
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("PROD_DATABASE_URL", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")

    protected_host = "ep-sweet-fire-b2y9w95z"
    dev_db_url = "postgresql://compass:secret@ep-broad-recipe-12345.us-east-2.aws.neon.tech/compass"

    settings = Settings(
        DATABASE_URL=dev_db_url,
        PROTECTED_DB_HOSTS=protected_host,
    )

    # Should not raise
    settings.validate_database_target()


def test_guard_real_pooled_and_unpooled_neon_hostnames(monkeypatch):
    """Real Neon production endpoints:
    1. Unpooled: ep-sweet-fire-b2y9w95z.c-6.eu-central-1.aws.neon.tech
    2. Pooled:   ep-sweet-fire-b2y9w95z-pooler.c-6.eu-central-1.aws.neon.tech
    Both must match PROTECTED_DB_HOSTS=ep-sweet-fire-b2y9w95z (substring/endpoint-id match).
    RENDER unset -> raises RuntimeError (refused).
    RENDER set -> passes cleanly (allowed).
    """
    protected_endpoint_id = "ep-sweet-fire-b2y9w95z"
    unpooled_host = "ep-sweet-fire-b2y9w95z.c-6.eu-central-1.aws.neon.tech"
    pooled_host = "ep-sweet-fire-b2y9w95z-pooler.c-6.eu-central-1.aws.neon.tech"

    for host in [unpooled_host, pooled_host]:
        db_url = f"postgresql://neondb_owner:npg_secret@{host}/neondb?sslmode=require"

        # 1. RENDER unset -> refuse
        monkeypatch.delenv("RENDER", raising=False)
        monkeypatch.delenv("PROD_DATABASE_URL", raising=False)
        settings_unauth = Settings(
            DATABASE_URL=db_url,
            PROTECTED_DB_HOSTS=protected_endpoint_id,
        )
        with pytest.raises(RuntimeError) as exc_info:
            settings_unauth.validate_database_target()
        assert "STARTUP REFUSED" in str(exc_info.value)
        assert host in str(exc_info.value)
        assert protected_endpoint_id in str(exc_info.value)

        # 2. RENDER set -> allow
        monkeypatch.setenv("RENDER", "true")
        settings_auth = Settings(
            DATABASE_URL=db_url,
            PROTECTED_DB_HOSTS=protected_endpoint_id,
        )
        settings_auth.validate_database_target()  # Must not raise


def test_guard_inspects_all_database_url_variants(monkeypatch):
    """Checks DATABASE_URL_UNPOOLED, TEST_DATABASE_URL, and arbitrary *_DATABASE_URL* env vars."""
    protected_endpoint = "ep-sweet-fire-b2y9w95z"
    protected_host = "ep-sweet-fire-b2y9w95z.c-6.eu-central-1.aws.neon.tech"
    safe_host = "ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech"

    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("PROD_DATABASE_URL", raising=False)

    # 1. DATABASE_URL_UNPOOLED matching protected host
    settings_unpooled = Settings(
        DATABASE_URL=f"postgresql://user:pass@{safe_host}/db",
        DATABASE_URL_UNPOOLED=f"postgresql://user:pass@{protected_host}/db",
        PROTECTED_DB_HOSTS=protected_endpoint,
    )
    with pytest.raises(RuntimeError) as exc:
        settings_unpooled.validate_database_target()
    assert "DATABASE_URL_UNPOOLED" in str(exc.value)

    # 2. Arbitrary env var BACKUP_DATABASE_URL
    monkeypatch.setenv("BACKUP_DATABASE_URL", f"postgresql://user:pass@{protected_host}/db")
    settings_env = Settings(
        DATABASE_URL=f"postgresql://user:pass@{safe_host}/db",
        PROTECTED_DB_HOSTS=protected_endpoint,
    )
    with pytest.raises(RuntimeError) as exc:
        settings_env.validate_database_target()
    assert "BACKUP_DATABASE_URL" in str(exc.value)
    monkeypatch.delenv("BACKUP_DATABASE_URL", raising=False)


def test_test_database_url_strictly_forbidden_even_on_render(monkeypatch):
    """TEST_DATABASE_URL must NEVER match protected host, even when RENDER is set!"""
    protected_endpoint = "ep-sweet-fire-b2y9w95z"
    protected_host = "ep-sweet-fire-b2y9w95z-pooler.c-6.eu-central-1.aws.neon.tech"
    safe_host = "ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech"

    # Even with RENDER=true
    monkeypatch.setenv("RENDER", "true")

    settings_test = Settings(
        DATABASE_URL=f"postgresql://user:pass@{safe_host}/db",
        TEST_DATABASE_URL=f"postgresql://user:pass@{protected_host}/db",
        PROTECTED_DB_HOSTS=protected_endpoint,
    )
    with pytest.raises(RuntimeError) as exc:
        settings_test.validate_database_target()
    assert "TEST_DATABASE_URL targets protected database host" in str(exc.value)
    assert "must NEVER point to protected hosts" in str(exc.value)


def test_get_masked_database_hosts(monkeypatch):
    """get_masked_database_hosts() properly masks hostnames across all configured database URLs."""
    settings = Settings(
        DATABASE_URL="postgresql://user:pass@ep-sweet-fire-b2y9w95z.c-6.eu-central-1.aws.neon.tech/db",
        DATABASE_URL_UNPOOLED="postgresql://user:pass@ep-broad-recipe-12345.c-6.eu-central-1.aws.neon.tech/db",
    )
    masked = settings.get_masked_database_hosts()
    assert "DATABASE_URL" in masked
    assert "DATABASE_URL_UNPOOLED" in masked
    assert "ep-s...tech" == masked["DATABASE_URL"]
    assert "ep-b...tech" == masked["DATABASE_URL_UNPOOLED"]


def test_conftest_guard_aborts_when_test_db_matches_protected():
    """tests/conftest.py validate_test_db_guard aborts when TEST_DATABASE_URL matches PROTECTED_DB_HOSTS."""
    from tests.conftest import validate_test_db_guard

    test_url = "postgresql://user:pass@ep-sweet-fire-b2y9w95z.c-6.eu-central-1.aws.neon.tech/testdb"
    prod_url = "postgresql://user:pass@ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech/compass"

    with pytest.raises(BaseException) as exc:
        validate_test_db_guard(test_url, prod_url)
    assert "targets protected production host" in str(getattr(exc.value, "msg", str(exc.value)))


def test_conftest_guard_aborts_when_prod_db_matches_protected():
    """tests/conftest.py validate_test_db_guard aborts when pre-override DATABASE_URL matches PROTECTED_DB_HOSTS."""
    from tests.conftest import validate_test_db_guard

    test_url = "postgresql://user:pass@ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech/testdb"
    prod_url = "postgresql://user:pass@ep-sweet-fire-b2y9w95z-pooler.c-6.eu-central-1.aws.neon.tech/compass"

    with pytest.raises(BaseException) as exc:
        validate_test_db_guard(test_url, prod_url)
    assert "targets protected production host" in str(getattr(exc.value, "msg", str(exc.value)))


def test_conftest_guard_aborts_when_test_db_equals_prod_db():
    """tests/conftest.py validate_test_db_guard aborts when TEST_DATABASE_URL equals DATABASE_URL."""
    from tests.conftest import validate_test_db_guard

    same_url = "postgresql://user:pass@ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech/compass"

    with pytest.raises(BaseException) as exc:
        validate_test_db_guard(same_url, same_url)
    assert "targets the identical host and database" in str(getattr(exc.value, "msg", str(exc.value)))


def test_conftest_guard_aborts_when_test_db_empty():
    """tests/conftest.py validate_test_db_guard aborts when TEST_DATABASE_URL is empty."""
    from tests.conftest import validate_test_db_guard

    with pytest.raises(BaseException) as exc:
        validate_test_db_guard("", "postgresql://user:pass@ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech/compass")
    assert "TEST_DATABASE_URL environment variable is not set" in str(getattr(exc.value, "msg", str(exc.value)))


def test_conftest_guard_passes_when_distinct_safe_hosts():
    """tests/conftest.py validate_test_db_guard passes when test and prod are distinct non-protected hosts."""
    from tests.conftest import validate_test_db_guard

    test_url = "postgresql://user:pass@ep-broad-recipe-123.c-6.eu-central-1.aws.neon.tech/testdb"
    prod_url = "postgresql://user:pass@ep-other-dev-456.c-6.eu-central-1.aws.neon.tech/compass"

    # Should complete cleanly without raising pytest.Exit
    validate_test_db_guard(test_url, prod_url)

