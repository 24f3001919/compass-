import asyncio
import os
import sys
import httpx
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.dependencies import generate_guest_token

OUT_DIR = "brag-output/composition/assets/images"

async def capture_app_center():
    user_id, tok = generate_guest_token()
    print(f"Minted guest user: {user_id}")

    headers = {
        "x-guest-token": tok,
        "x-guest-id": user_id,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        # Seed persona so user has full profile & context
        await client.post("/api/demo/seed-persona", headers=headers)
        
        # Prepare two applications: Keysight (2013) and Palantir (2010)
        res1 = await client.post("/api/career/applications/2013", headers=headers)
        print(f"Prepared 2013: {res1.status_code}")
        res2 = await client.post("/api/career/applications/2010", headers=headers)
        print(f"Prepared 2010: {res2.status_code}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1.0,
        )

        await context.add_cookies([
            {"name": "compass_guest_token", "value": tok, "domain": "localhost", "path": "/"},
            {"name": "compass_guest_id", "value": user_id, "domain": "localhost", "path": "/"}
        ])

        page = await context.new_page()
        await page.add_init_script(f"""
            window.localStorage.setItem('compass_guest_token', '{tok}');
            window.localStorage.setItem('compass_guest_id', '{user_id}');
        """)

        await page.goto("http://localhost:5173/career", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1500)

        app_tab = page.locator("#career-subtab-applications").first
        await app_tab.click()

        print("Waiting for Application Center table to load...")
        try:
            await page.wait_for_selector("text=Loading Application Center...", state="detached", timeout=30000)
        except Exception as e:
            print(f"Wait detached error: {e}")

        try:
            await page.wait_for_selector("table, tbody tr, .app-card", timeout=15000)
        except Exception as e:
            print(f"Wait table error: {e}")

        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_10_application_center.png")
        print("-> Successfully saved scene_10_application_center.png!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_app_center())
