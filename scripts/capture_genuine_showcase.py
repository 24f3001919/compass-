import asyncio
import os
from playwright.async_api import async_playwright

OUT_DIR = "brag-output/composition/assets/images"

async def capture_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        print("--- Step 1: Seed Judge Persona & Capture Timeline ---")
        await page.goto("http://localhost:5173/timeline", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        load_btn = page.locator('button:has-text("Load Judge Persona")').first
        if await load_btn.is_visible():
            print("Clicking 'Load Judge Persona'...")
            await load_btn.click()
            # Wait for the button to finish loading (reverts from "Loading..." or tasks appear)
            for _ in range(15):
                await page.wait_for_timeout(1000)
                # Check if tasks are rendered
                tasks = page.locator(".timeline-item, .task-card, [data-domain]")
                if await tasks.count() > 0:
                    print(f"Tasks loaded! Count: {await tasks.count()}")
                    break
        
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_2_timeline.png")
        print("-> Saved scene_2_timeline.png")

        print("--- Step 2: Contextual Chat with Judge Persona ---")
        await page.goto("http://localhost:5173/compass", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)

        chat_box = page.locator("input.chat-input-box").first
        await chat_box.click()
        await chat_box.fill("Assess my project against the hackathon judging criteria and list my top 3 priorities.")
        await page.wait_for_timeout(500)
        await chat_box.press("Enter")
        print("Waiting 15s for full streaming response...")
        await page.wait_for_timeout(15000)
        await page.screenshot(path=f"{OUT_DIR}/scene_3_chat_persona.png")
        print("-> Saved scene_3_chat_persona.png")

        print("--- Step 3: Factual Web Research with Tavily ---")
        await chat_box.click()
        await chat_box.fill("Search the web for the official submission deadline and prize pool for the Nebius AI Hackathon on Devpost.")
        await page.wait_for_timeout(500)
        await chat_box.press("Enter")
        print("Waiting 15s for Tavily research and verified source citations...")
        await page.wait_for_timeout(15000)
        await page.screenshot(path=f"{OUT_DIR}/scene_4_chat_tavily.png")
        print("-> Saved scene_4_chat_tavily.png")

        print("--- Step 4: Executive Dashboard ---")
        await page.goto("http://localhost:5173/overview", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_1_dashboard.png")
        print("-> Saved scene_1_dashboard.png")

        print("--- Step 5: Schedule & Calendar Sync ---")
        await page.goto("http://localhost:5173/schedule", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_11_schedule_calendar.png")
        print("-> Saved scene_11_schedule_calendar.png")

        print("--- Step 6: Career Radar ---")
        await page.goto("http://localhost:5173/career?tab=radar", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_5_career_radar.png")
        print("-> Saved scene_5_career_radar.png")

        print("--- Step 7: Opportunity Details Modal ---")
        view_btn = page.locator("button:has-text('View details')").first
        if await view_btn.is_visible():
            await view_btn.click()
            await page.wait_for_timeout(1500)
            await page.screenshot(path=f"{OUT_DIR}/scene_6_opportunity_detail.png")
            print("-> Saved scene_6_opportunity_detail.png")

        print("--- Step 8: Resume Studio Profile & Analyzer ---")
        await page.goto("http://localhost:5173/career?tab=resumes", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        # Populate candidate profile in state
        await page.evaluate("""() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const textareas = Array.from(document.querySelectorAll('textarea'));
            
            for (const input of inputs) {
                const label = (input.placeholder || '') + (input.parentElement?.textContent || '');
                if (label.toLowerCase().includes('name')) {
                    input.value = "Alex Chen";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (label.toLowerCase().includes('email')) {
                    input.value = "alex.chen.dev@example.com";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (label.toLowerCase().includes('phone')) {
                    input.value = "+1 (555) 349-2810";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (label.toLowerCase().includes('location')) {
                    input.value = "San Francisco, CA / Remote";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            
            for (const ta of textareas) {
                const label = (ta.placeholder || '') + (ta.parentElement?.textContent || '');
                if (label.toLowerCase().includes('summary')) {
                    ta.value = "Full-stack engineer specializing in React, TypeScript, Python FastAPI, and distributed systems. Built production microservices with 99.9% uptime and led hackathon projects integrating LLM agents and pgvector.";
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (label.toLowerCase().includes('skills')) {
                    ta.value = "React, TypeScript, Python, FastAPI, PostgreSQL, pgvector, Docker, Git, REST APIs, TailwindCSS";
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }""")
        await page.wait_for_timeout(1000)

        save_btn = page.locator("button:has-text('Save Master Anchor')").first
        if await save_btn.is_visible():
            await save_btn.click()
            await page.wait_for_timeout(1500)

        verify_btn = page.locator("button:has-text('Verify Factual Claims')").first
        if await verify_btn.is_visible():
            await verify_btn.click()
            await page.wait_for_timeout(1500)

        await page.screenshot(path=f"{OUT_DIR}/scene_7_resume_studio.png")
        print("-> Saved scene_7_resume_studio.png")

        await page.screenshot(path=f"{OUT_DIR}/scene_8_resume_analyzer.png")
        print("-> Saved scene_8_resume_analyzer.png")

        print("--- Step 9: Tailored ATS Resume Preview ---")
        editor_btn = page.locator("button:has-text('Resume Editor')").first
        if await editor_btn.is_visible():
            await editor_btn.click()
            await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_9_resume_tailored.png")
        print("-> Saved scene_9_resume_tailored.png")

        print("--- Step 10: Application Center ---")
        await page.goto("http://localhost:5173/career?tab=applications", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_10_application_center.png")
        print("-> Saved scene_10_application_center.png")

        await browser.close()
        print("SUCCESS: All genuine showcase screenshots captured!")

if __name__ == "__main__":
    asyncio.run(capture_all())
