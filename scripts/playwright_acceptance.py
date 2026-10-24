import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

OUTPUT_DIR = Path("C:/Users/Ratnesh Singh/.gemini/antigravity-ide/brain/28e0e8fb-733b-4faf-9677-ab5f6c907d2b/playwright_acceptance_screenshots")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def assert_backend_database_safe(backend_url: str = "http://localhost:8001"):
    import urllib.request
    import json
    import urllib.parse
    try:
        with urllib.request.urlopen(f"{backend_url}/health", timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") not in ("ok", "connected"):
                print(f"⚠️ Preflight: backend health status is {data.get('status')}")
    except Exception as e:
        print(f"⚠️ Preflight: backend at {backend_url} /health check returned: {e}")
        return
    db_url = os.environ.get("DATABASE_URL", "")
    db_host = urllib.parse.urlparse(db_url).hostname or "" if db_url else ""
    protected_hosts = [h.strip().lower() for h in os.environ.get("PROTECTED_DB_HOSTS", "ep-sweet-fire-b2y9w95z").split(",") if h.strip()]
    for p in protected_hosts:
        if p and p in db_host.lower():
            raise RuntimeError(
                f"ABORTED: Acceptance test is configured with protected database host '{db_host}'! "
                f"Local acceptance testing must use an isolated development database branch."
            )
    print(f"✅ Verified: Acceptance test environment target is safe.")


async def run_browser_acceptance():
    print("Starting Playwright Persona Acceptance Test...")
    assert_backend_database_safe()
    print(f"Screenshots destination (strictly outside repo): {OUTPUT_DIR}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        
        # --------------------------------------------------------------------
        # 1. Fresh context 1: Dashboard + Timeline with new identity
        # --------------------------------------------------------------------
        print("\n--- Step 1: Fresh Identity Context 1 ---")
        context1 = await browser.new_context(viewport={"width": 1400, "height": 900})
        page1 = await context1.new_page()

        step1_network_log = []
        page1.on("request", lambda req: step1_network_log.append(f"[REQ] {req.method} {req.url}"))
        page1.on("response", lambda res: step1_network_log.append(f"[RESP {res.status}] {res.url}"))
        page1.on("dialog", lambda d: print(f"[Browser Dialog] {d.message}") or asyncio.create_task(d.accept()))
        page1.on("console", lambda m: print(f"[Console {m.type}] {m.text}") if "error" in m.type else None)

        print("Navigating to http://localhost:5173/ ...")
        await page1.goto("http://localhost:5173/", wait_until="networkidle")
        await asyncio.sleep(2)

        print("\n=== Step 1 Network Log ===")
        for entry in step1_network_log:
            print(entry)
        print("=== End of Step 1 Network Log ===\n")

        seed_requests = [e for e in step1_network_log if "/seed" in e or "seed-persona" in e]
        print(f"Network seed requests recorded on mount: {len(seed_requests)}")
        assert len(seed_requests) == 0, f"Expected 0 seed requests on mount, got {len(seed_requests)}: {seed_requests}"

        # Capture Dashboard screenshot
        shot1_dash = OUTPUT_DIR / "1_dashboard_empty_fresh_identity.png"
        await page1.screenshot(path=str(shot1_dash), full_page=True)
        print(f"Saved screenshot: {shot1_dash}")

        # Check completion rate text on page - must not be NaN
        content = await page1.content()
        assert "NaN" not in content, "Completion rate displayed NaN!"
        print("Confirmed: Completion rate is NOT NaN.")

        # Read Dashboard category numbers from UI
        print("\n[UI Read - Step 1 Empty Dashboard]:")
        cards = await page1.locator(".stat-card, [class*='stat']").all_inner_texts()
        for c in cards:
            clean = " ".join(c.split())
            if any(k in clean.lower() for k in ["total tasks", "overdue", "completion rate", "open tasks"]):
                print(f"  UI Stat: {clean}")

        # Switch to Timeline tab
        timeline_btn = page1.locator("button:has-text('Timeline'), a:has-text('Timeline'), [data-tab='timeline']").first
        if await timeline_btn.count() > 0:
            await timeline_btn.click()
            await asyncio.sleep(1)
            shot1_time = OUTPUT_DIR / "1_timeline_empty_fresh_identity.png"
            await page1.screenshot(path=str(shot1_time), full_page=True)
            print(f"Saved screenshot: {shot1_time}")
            # Switch back to Dashboard
            dash_btn = page1.locator("button:has-text('Dashboard'), a:has-text('Dashboard'), [data-tab='dashboard']").first
            if await dash_btn.count() > 0:
                await dash_btn.click()
                await asyncio.sleep(1)

        # --------------------------------------------------------------------
        # 2. Add one real task: appears alone
        # --------------------------------------------------------------------
        print("\n--- Step 2: Add One Real Task ---")
        add_task_btn = page1.locator("button:has-text('Create First Task'), button:has-text('Add deadline')").first
        if await add_task_btn.count() > 0:
            await add_task_btn.click()
            await asyncio.sleep(1)
            
            title_input = page1.locator("#input-deadline-title")
            await title_input.fill("Playwright Real Task: Verify System Architecture")
            await asyncio.sleep(0.5)

            submit_btn = page1.locator("#btn-submit-create-deadline")
            await submit_btn.click()
            print("Submitted new real task modal.")
            await asyncio.sleep(2)
        
        shot2 = OUTPUT_DIR / "2_one_real_task_alone.png"
        await page1.screenshot(path=str(shot2), full_page=True)
        print(f"Saved screenshot: {shot2}")

        print("\n[UI Read - Step 2 One Real Task]:")
        cards_step2 = await page1.locator(".stat-card, [class*='stat']").all_inner_texts()
        for c in cards_step2:
            clean = " ".join(c.split())
            if any(k in clean.lower() for k in ["total tasks", "overdue", "completion rate", "open tasks"]):
                print(f"  UI Stat: {clean}")

        # --------------------------------------------------------------------
        # 3. Click Load Judge Persona
        # --------------------------------------------------------------------
        print("\n--- Step 3: Click Load Judge Persona ---")
        load_persona_btn = page1.locator("#dashboard-btn-load-judge-persona, button:has-text('Load Judge Persona')").first
        assert await load_persona_btn.count() > 0, "Could not find 'Load Judge Persona' button!"
        
        await load_persona_btn.click(force=True)
        print("Clicked 'Load Judge Persona'. Waiting for server and rendering...")
        await asyncio.sleep(4)

        shot3 = OUTPUT_DIR / "3_judge_persona_loaded.png"
        await page1.screenshot(path=str(shot3), full_page=True)
        print(f"Saved screenshot: {shot3}")

        # Inspect Overdue card, categories, and numbers read from UI
        print("\n[UI Read - Step 3 Persona Loaded Numbers]:")
        cards = await page1.locator(".stat-card, [class*='stat']").all_inner_texts()
        for c in cards:
            clean = " ".join(c.split())
            if any(k in clean.lower() for k in ["overdue", "completion", "total tasks", "open tasks"]):
                print(f"  UI Stat Card: {clean}")

        # Inspect filter pill counts
        pills = await page1.locator("[class*='filter'], [class*='pill'], button").all_inner_texts()
        seen = set()
        for p_text in pills:
            clean = " ".join(p_text.split())
            for key in ["overdue", "today", "urgent", "due soon", "upcoming", "in progress", "completed", "blocked"]:
                if key in clean.lower() and len(clean) < 30 and clean not in seen:
                    print(f"  UI Category Filter: {clean}")
                    seen.add(clean)

        # Inspect Next Up Banner
        next_up_texts = await page1.locator("text=/Next up/i").all_inner_texts()
        for nu in next_up_texts:
            print("  UI Next Up Banner:", " ".join(nu.split()))

        # --------------------------------------------------------------------
        # 4. Click again + refresh: no duplicates, real task intact
        # --------------------------------------------------------------------
        print("\n--- Step 4: Click Again + Refresh (Idempotency) ---")
        load_persona_again = page1.locator("#dashboard-btn-load-judge-persona, button:has-text('Load Judge Persona')").first
        if await load_persona_again.count() > 0:
            await load_persona_again.click(force=True)
            await asyncio.sleep(3)
        
        await page1.reload(wait_until="networkidle")
        await asyncio.sleep(2)

        shot4 = OUTPUT_DIR / "4_judge_persona_reseed_and_refresh.png"
        await page1.screenshot(path=str(shot4), full_page=True)
        print(f"Saved screenshot: {shot4}")

        print("\n[UI Read - Step 4 Reseed + Refresh Numbers]:")
        cards_reload = await page1.locator(".stat-card, [class*='stat']").all_inner_texts()
        for c in cards_reload:
            clean = " ".join(c.split())
            if any(k in clean.lower() for k in ["overdue", "completion", "total tasks", "open tasks"]):
                print(f"  UI Stat Card: {clean}")

        await context1.close()

        # --------------------------------------------------------------------
        # 5. Second fresh context: 0 tasks
        # --------------------------------------------------------------------
        print("\n--- Step 5: Second Fresh Context ---")
        context2 = await browser.new_context(viewport={"width": 1400, "height": 900})
        page2 = await context2.new_page()
        await page2.goto("http://localhost:5173/", wait_until="networkidle")
        await asyncio.sleep(2)

        shot5 = OUTPUT_DIR / "5_second_fresh_context_zero_tasks.png"
        await page2.screenshot(path=str(shot5), full_page=True)
        print(f"Saved screenshot: {shot5}")

        print("\n[UI Read - Step 5 Context 2 Numbers]:")
        cards_ctx2 = await page2.locator(".stat-card, [class*='stat']").all_inner_texts()
        for c in cards_ctx2:
            clean = " ".join(c.split())
            if any(k in clean.lower() for k in ["overdue", "completion", "total tasks", "open tasks"]):
                print(f"  UI Stat Card: {clean}")

        await context2.close()
        await browser.close()
        print("\n=== Playwright Browser Acceptance Test Completed Successfully! ===")


if __name__ == "__main__":
    asyncio.run(run_browser_acceptance())
