import asyncio
import os
from playwright.async_api import async_playwright

OUT_DIR = "brag-output/composition/assets/images"

async def capture_career():
    os.makedirs(OUT_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        print("1. Going to http://localhost:5173/career...")
        await page.goto("http://localhost:5173/career", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        print("2. Switching to Resume Studio tab via #career-subtab-resumes...")
        await page.click("#career-subtab-resumes")
        
        # Wait for lazy chunk to load
        print("Waiting for Resume Studio lazy component to mount...")
        await page.wait_for_selector("button:has-text('Save Master Anchor')", timeout=20000)
        await page.wait_for_timeout(2000)

        # Populate candidate profile in state
        print("3. Populating candidate profile...")
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
            await page.wait_for_timeout(2000)

        await page.screenshot(path=f"{OUT_DIR}/scene_7_resume_studio.png")
        print("-> Saved scene_7_resume_studio.png")

        verify_btn = page.locator("button:has-text('Verify Factual Claims')").first
        if await verify_btn.is_visible():
            await verify_btn.click()
            await page.wait_for_timeout(2000)

        await page.screenshot(path=f"{OUT_DIR}/scene_8_resume_analyzer.png")
        print("-> Saved scene_8_resume_analyzer.png")

        # Resume Editor / Preview
        print("4. Opening Resume Editor / Tailored ATS Preview...")
        editor_btn = page.locator("button:has-text('Resume Editor')").first
        if await editor_btn.is_visible():
            await editor_btn.click()
            await page.wait_for_timeout(2500)
            await page.screenshot(path=f"{OUT_DIR}/scene_9_resume_tailored.png")
            print("-> Saved scene_9_resume_tailored.png")

        # Application Center
        print("5. Switching to Application Center tab...")
        await page.click("#career-subtab-applications")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=f"{OUT_DIR}/scene_10_application_center.png")
        print("-> Saved scene_10_application_center.png")

        await browser.close()
        print("Career Studio capture complete!")

if __name__ == "__main__":
    asyncio.run(capture_career())
