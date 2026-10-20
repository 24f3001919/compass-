"""
Tests verifying database schema initialization for original_resume_documents table.

Requirements verified:
1. A clean database receives the table and index during initialization.
2. Existing databases initialize safely.
3. Resume upload and retrieval work immediately after startup.
4. Existing resume records remain intact across re-initializations.
5. Repeated initialization is idempotent and does not fail.
"""
import pytest
import os
import uuid
from backend.memory.db import get_pool, init_pool, _ensure_tables
import backend.memory.db as db_mod
from backend.memory.career import (
    save_original_resume_document,
    get_original_resume_document,
    list_original_resume_documents,
)


@pytest.fixture(autouse=True)
def ensure_real_postgres():
    """Skip if real PostgreSQL test database is not configured."""
    test_db = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not test_db:
        pytest.skip("TEST_DATABASE_URL not set; skipping database schema initialization test.")


@pytest.mark.asyncio
async def test_clean_database_receives_table_during_initialization():
    """1. Verify that a clean database receives original_resume_documents table and index during initialization."""
    pool = await get_pool()
    assert pool is not None

    async with pool.acquire() as conn:
        # Drop the table cleanly to simulate a fresh/clean environment
        await conn.execute("DROP TABLE IF EXISTS original_resume_documents CASCADE;")

    # Reset _tables_ensured flag to force re-execution of schema initialization
    db_mod._tables_ensured = False

    # Run the established schema initialization
    await _ensure_tables(pool)

    # Verify table and index exist in PostgreSQL catalog
    async with pool.acquire() as conn:
        table_exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'original_resume_documents'
            )
            """
        )
        assert table_exists is True, "original_resume_documents table must exist after initialization"

        index_exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND tablename = 'original_resume_documents' 
                AND indexname = 'idx_orig_resumes_user'
            )
            """
        )
        assert index_exists is True, "idx_orig_resumes_user index must exist after initialization"


@pytest.mark.asyncio
async def test_existing_database_initializes_safely_and_repeatedly():
    """2 & 5. Verify repeated/existing database initialization is idempotent and does not fail."""
    pool = await get_pool()
    assert pool is not None

    # Run initialization multiple times in succession
    for _ in range(3):
        db_mod._tables_ensured = False
        await _ensure_tables(pool)

    # Verify table is still present and valid
    async with pool.acquire() as conn:
        cols = await conn.fetch(
            """
            SELECT column_name, data_type FROM information_schema.columns 
            WHERE table_name = 'original_resume_documents'
            """
        )
        col_map = {r["column_name"]: r["data_type"] for r in cols}
        assert "id" in col_map
        assert "user_id" in col_map
        assert "filename" in col_map
        assert "file_type" in col_map
        assert "raw_text" in col_map
        assert "metadata" in col_map
        assert "uploaded_at" in col_map


@pytest.mark.asyncio
async def test_resume_save_and_retrieve_immediately_after_startup():
    """3. Verify resume upload and retrieval work immediately after startup without lazy creation."""
    user_id = f"test_user_{uuid.uuid4().hex[:8]}"

    # Save document
    saved = await save_original_resume_document(
        user_id=user_id,
        filename="resume_test.pdf",
        file_type="pdf",
        raw_text="Extracted text from test resume content.",
        metadata={"source": "unit_test", "byte_size": 2048},
    )
    doc_id = saved.id
    assert doc_id.startswith("doc_")
    assert saved.user_id == user_id
    assert saved.filename == "resume_test.pdf"

    # Direct retrieval
    fetched = await get_original_resume_document(doc_id=doc_id, user_id=user_id)
    assert fetched is not None
    assert fetched.id == doc_id
    assert fetched.raw_text == "Extracted text from test resume content."
    assert fetched.metadata.get("source") == "unit_test"

    # List retrieval
    docs = await list_original_resume_documents(user_id=user_id)
    assert len(docs) >= 1
    assert any(d.id == doc_id for d in docs)


@pytest.mark.asyncio
async def test_existing_records_remain_intact_across_reinitialization():
    """4. Verify existing records in original_resume_documents remain intact across re-initialization."""
    pool = await get_pool()
    assert pool is not None

    user_id = f"preserve_user_{uuid.uuid4().hex[:8]}"

    # Save record
    saved = await save_original_resume_document(
        user_id=user_id,
        filename="durable.docx",
        file_type="docx",
        raw_text="Durable text that must survive schema re-runs.",
        metadata={"intact": True},
    )
    doc_id = saved.id

    # Re-run schema initialization
    db_mod._tables_ensured = False
    await _ensure_tables(pool)

    # Verify record was preserved
    fetched = await get_original_resume_document(doc_id=doc_id, user_id=user_id)
    assert fetched is not None
    assert fetched.raw_text == "Durable text that must survive schema re-runs."
    assert fetched.metadata.get("intact") is True
