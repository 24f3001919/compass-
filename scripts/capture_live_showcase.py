import asyncio
import os
import sys
from playwright.async_api import async_playwright

BASE_URL = "https://compass-farmlytics.vercel.app"
OUT_DIR = "brag-output/composition/assets/images"

async def capture_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1.0
        )
        page = await context.new_page()

        print("[1/11] Seeding Persona & Loading Timeline...")
        await page.goto(f"{BASE_URL}/timeline", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)
        
        # Check if Load Judge Persona button is visible and click it
        load_btn = page.locator("button:has-text('Load Judge Persona')").first
        if await load_btn.is_visible():
            print("Clicking 'Load Judge Persona'...")
            await load_btn.click()
            await page.wait_for_timeout(4000)
        
        # Capture Timeline
        await page.screenshot(path=f"{OUT_DIR}/scene_2_timeline.png")
        print("Captured scene_2_timeline.png")

        # Capture Dashboard / Overview
        print("[2/11] Capturing Dashboard...")
        await page.goto(f"{BASE_URL}/overview", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_1_dashboard.png")
        print("Captured scene_1_dashboard.png")

        # Capture Schedule / Calendar
        print("[3/11] Capturing Schedule & Calendar...")
        await page.goto(f"{BASE_URL}/schedule", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_11_schedule_calendar.png")
        print("Captured scene_11_schedule_calendar.png")

        # Career Radar
        print("[4/11] Capturing Career Radar...")
        await page.goto(f"{BASE_URL}/career?tab=radar", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_5_career_radar.png")
        print("Captured scene_5_career_radar.png")

        # Opportunity Details Modal
        print("[5/11] Opening Opportunity Details Modal...")
        details_btn = page.locator("button:has-text('View details')").first
        if await details_btn.is_visible():
            await details_btn.click()
            await page.wait_for_timeout(1500)
            await page.screenshot(path=f"{OUT_DIR}/scene_6_opportunity_detail.png")
            print("Captured scene_6_opportunity_detail.png")
            # Close modal
            close_btn = page.locator("button:has-text('✕'), button:has-text('Close')").first
            if await close_btn.is_visible():
                await close_btn.click()
                await page.wait_for_timeout(500)

        # Resume Studio & Candidate Profile
        print("[6/11] Setting up Candidate Profile in Resume Studio...")
        await page.goto(f"{BASE_URL}/career?tab=resumes", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)

        # Fill profile fields if empty
        name_input = page.locator("input[placeholder*='name' i], input[value=''], input").first
        # Look for the inputs
        inputs = page.locator("input[type='text']")
        count = await inputs.count()
        print(f"Found {count} text inputs in Resume Studio")
        
        # Let's populate the master profile
        await page.evaluate("""() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const textareas = Array.from(document.querySelectorAll('textarea'));
            
            // Name input
            const nameInput = inputs.find(i => i.placeholder?.toLowerCase().includes('name') || i.previousElementSibling?.textContent?.includes('Name') || i.parentElement?.textContent?.includes('Full Name'));
            if (nameInput) {
                nameInput.value = "Alex Chen";
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // Email input
            const emailInput = inputs.find(i => i.type === 'email' || i.placeholder?.toLowerCase().includes('email') || i.parentElement?.textContent?.includes('Contact Email'));
            if (emailInput) {
                emailInput.value = "alex.chen.dev@example.com";
                emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                emailInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Phone input
            const phoneInput = inputs.find(i => i.placeholder?.toLowerCase().includes('phone') || i.parentElement?.textContent?.includes('Phone'));
            if (phoneInput) {
                phoneInput.value = "+1 (555) 349-2810";
                phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Location input
            const locInput = inputs.find(i => i.placeholder?.toLowerCase().includes('location') || i.parentElement?.textContent?.includes('Location'));
            if (locInput) {
                locInput.value = "San Francisco, CA / Remote";
                locInput.dispatchEvent(new Event('input', { bubbles: true }));
                locInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Summary textarea
            const summaryArea = textareas.find(t => t.placeholder?.toLowerCase().includes('summary') || t.parentElement?.textContent?.includes('Summary'));
            if (summaryArea) {
                summaryArea.value = "Full-stack engineer specializing in React, TypeScript, Python FastAPI, and distributed systems. Built production microservices with 99.9% uptime and led hackathon projects integrating LLM agents and pgvector.";
                summaryArea.dispatchEvent(new Event('input', { bubbles: true }));
                summaryArea.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Skills textarea
            const skillsArea = textareas.find(t => t.placeholder?.toLowerCase().includes('skills') || t.parentElement?.textContent?.includes('Technical Skills'));
            if (skillsArea) {
                skillsArea.value = "React, TypeScript, Python, FastAPI, PostgreSQL, pgvector, Docker, Git, REST APIs, TailwindCSS";
                skillsArea.dispatchEvent(new Event('input', { bubbles: true }));
                skillsArea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }""")
        await page.wait_for_timeout(1000)
        
        # Click "Save Master Anchor" if present
        save_anchor = page.locator("button:has-text('Save Master Anchor')").first
        if await save_anchor.is_visible():
            await save_anchor.click()
            await page.wait_for_timeout(1500)

        # Click "Verify Factual Claims" or analyze
        verify_claims = page.locator("button:has-text('Verify Factual Claims')").first
        if await verify_claims.is_visible():
            await verify_claims.click()
            await page.wait_for_timeout(1500)

        await page.screenshot(path=f"{OUT_DIR}/scene_7_resume_studio.png")
        print("Captured scene_7_resume_studio.png")

        # Resume Analyzer Report
        print("[7/11] Capturing Resume Analyzer Audit...")
        # Check if audit card or resume editor is visible
        await page.screenshot(path=f"{OUT_DIR}/scene_8_resume_analyzer.png")
        print("Captured scene_8_resume_analyzer.png")

        # Tailored Resume / Resume Preview
        print("[8/11] Capturing Tailored ATS Resume Preview...")
        resume_editor_btn = page.locator("button:has-text('Resume Editor')").first
        if await resume_editor_btn.is_visible():
            await resume_editor_btn.click()
            await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT_DIR}/scene_9_resume_tailored.png")
        print("Captured scene_9_resume_tailored.png")

        # Application Center
        print("[9/11] Capturing Application Center...")
        await page.goto(f"{BASE_URL}/career?tab=applications", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT_DIR}/scene_10_application_center.png")
        print("Captured scene_10_application_center.png")

        # Compass Chat (Contextual Hackathon priorities)
        print("[10/11] Performing Contextual Chat with Judge Persona...")
        await page.goto(f"{BASE_URL}/compass", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)
        
        # Locate chat input
        chat_input = page.locator("input.chat-input-box, textarea.chat-input-box, input[placeholder*='message' i], input[placeholder*='Ask' i]").first
        if await chat_input.is_visible():
            print("Sending contextual query...")
            await chat_input.fill("Assess my project against the hackathon judging criteria and list my top 3 priorities.")
            await chat_input.press("Enter")
            # Wait for response to stream in
            print("Waiting for streaming response...")
            await page.wait_for_timeout(10000)
            await page.screenshot(path=f"{OUT_DIR}/scene_3_chat_persona.png")
            print("Captured scene_3_chat_persona.png")

            # Factual research with Tavily
            print("[11/11] Performing Grounded Tavily Web Research...")
            await chat_input.fill("What is the official submission deadline and prize pool for the Nebius AI Hackathon on Devpost?")
            await chat_input.press("Enter")
            print("Waiting for Tavily search and verification...")
            await page.wait_for_timeout(12000)
            await page.screenshot(path=f"{OUT_DIR}/scene_4_chat_tavily.png")
            print("Captured scene_4_chat_tavily.png")

        await browser.close()
        print("ALL CAPTURES COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(capture_all())
