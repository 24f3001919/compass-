import asyncio
import os
import sys
import httpx
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.dependencies import generate_guest_token

OUT_DIR = "brag-output/composition/assets/images"
os.makedirs(OUT_DIR, exist_ok=True)

async def setup_and_capture():
    # 1. Mint genuine cryptographic guest token
    user_id, tok = generate_guest_token()
    print(f"Minted guest user: {user_id}")

    headers = {
        "x-guest-token": tok,
        "x-guest-id": user_id,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=30.0) as client:
        # 2. Seed Judge Persona (21 multi-domain tasks & timeline)
        seed_resp = await client.post("/api/demo/seed-persona", headers=headers)
        print(f"Seed persona response: {seed_resp.status_code}")

        # 3. Upsert rich truthful Master Resume
        master_content = {
            "full_name": "Alex Chen",
            "email": "alex.chen.dev@example.com",
            "phone": "+1 (555) 349-2810",
            "location": "San Francisco, CA / Hybrid",
            "summary": "Full-stack engineer specializing in React, TypeScript, Python FastAPI, and distributed systems. Built production microservices with 99.9% uptime and led hackathon projects integrating LLM agents and pgvector.",
            "skills": [
                "Python", "FastAPI", "React", "TypeScript", "PostgreSQL", 
                "pgvector", "Docker", "Git", "REST APIs", "TailwindCSS"
            ],
            "experiences": [
                {
                    "title": "Software Engineering Intern",
                    "company": "CloudScale Labs",
                    "location": "San Francisco, CA",
                    "start_date": "May 2025",
                    "end_date": "Aug 2025",
                    "description": "Architected telemetry ingestion pipeline processing 10M events/day using FastAPI and PostgreSQL. Implemented sub-100ms vector search for system diagnostics using pgvector."
                }
            ],
            "projects": [
                {
                    "title": "Compass AI Copilot",
                    "description": "Unified AI workspace combining contextual chat, Nebius LLM routing, and automated internship discovery with verified factual anchoring."
                }
            ],
            "education": [
                {
                    "institution": "University of California, Berkeley",
                    "degree": "B.S. in Computer Science",
                    "start_year": "2023",
                    "end_year": "2027"
                }
            ]
        }
        master_resp = await client.put("/api/career/resumes/master", json=master_content, headers=headers)
        print(f"Master resume upsert: {master_resp.status_code}")
        master_data = master_resp.json()

        # 4. Tailor Resume to Keysight Technologies (ID 2013)
        tailor_payload = {
            "opportunity_id": 2013,
            "custom_title": "Keysight Technologies — Automation Engineer Tailored",
            "target_skills_emphasis": ["Python", "FastAPI", "PostgreSQL", "Docker", "REST APIs"]
        }
        tailor_resp = await client.post("/api/career/resumes/tailor", json=tailor_payload, headers=headers)
        print(f"Tailor resume response: {tailor_resp.status_code}")

        # 5. Prepare Applications for Keysight Technologies and Palantir
        app_resp1 = await client.post("/api/career/applications/2013", headers=headers, timeout=60.0)
        print(f"Prepare application 2013: {app_resp1.status_code}")
        app_resp2 = await client.post("/api/career/applications/2010", headers=headers, timeout=60.0)
        print(f"Prepare application 2010: {app_resp2.status_code}")

    # Now launch Playwright to capture genuine application states
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

        # Pre-seed localStorage before navigation
        await page.add_init_script(f"""
            window.localStorage.setItem('compass_guest_token', '{tok}');
            window.localStorage.setItem('compass_guest_id', '{user_id}');
        """)

        print("--- Step 1: Career Radar ---")
        await page.goto("http://localhost:5173/career", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_5_career_radar.png")
        print("-> Saved scene_5_career_radar.png")

        print("--- Step 2: Opportunity Details Modal ---")
        view_btn = page.locator("button:has-text('View details')").first
        if await view_btn.is_visible():
            await view_btn.click()
            await page.wait_for_timeout(1500)
            await page.screenshot(path=f"{OUT_DIR}/scene_6_opportunity_detail.png")
            print("-> Saved scene_6_opportunity_detail.png")
            # Close modal if open
            close_btn = page.locator("button:has-text('✕'), button:has-text('Close')").first
            if await close_btn.is_visible():
                await close_btn.click()
                await page.wait_for_timeout(800)

        print("--- Step 3: Switch to Resume Studio Tab ---")
        resumes_tab_btn = page.locator("#career-subtab-resumes").first
        await resumes_tab_btn.click()
        await page.wait_for_timeout(3000)

        # Ensure ResumeStudio has mounted
        await page.wait_for_selector("h2:has-text('Resume Studio')", timeout=15000)
        await page.screenshot(path=f"{OUT_DIR}/scene_7_resume_studio.png")
        print("-> Saved scene_7_resume_studio.png")

        print("--- Step 4: Resume Analyzer & Consistency Audit ---")
        # Click on the tailored variant in the versions list on the left
        tailored_variant = page.locator("button:has-text('Keysight Technologies')").first
        if await tailored_variant.is_visible():
            await tailored_variant.click()
            await page.wait_for_timeout(1500)

        # Click on Diff or view the Profile Consistency Audit
        diff_btn = page.locator("button:has-text('Master vs Tailored Diff')").first
        if await diff_btn.is_visible():
            await diff_btn.click()
            await page.wait_for_timeout(1500)

        await page.screenshot(path=f"{OUT_DIR}/scene_8_resume_analyzer.png")
        print("-> Saved scene_8_resume_analyzer.png")

        print("--- Step 5: Tailored ATS Resume Preview ---")
        editor_btn = page.locator("button:has-text('Resume Editor')").first
        if await editor_btn.is_visible():
            await editor_btn.click()
            await page.wait_for_timeout(1500)

        await page.screenshot(path=f"{OUT_DIR}/scene_9_resume_tailored.png")
        print("-> Saved scene_9_resume_tailored.png")

        print("--- Step 6: Application Center ---")
        app_tab_btn = page.locator("#career-subtab-applications").first
        await app_tab_btn.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_10_application_center.png")
        print("-> Saved scene_10_application_center.png")

        await browser.close()
        print("SUCCESS: Career workflow screenshots fully captured!")

if __name__ == "__main__":
    asyncio.run(setup_and_capture())
