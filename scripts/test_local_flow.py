import asyncio
import os
import sys
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        print("1. Going to http://localhost:5173/timeline...")
        await page.goto("http://localhost:5173/timeline", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        load_btn = page.locator('button:has-text("Load Judge Persona")').first
        if await load_btn.is_visible():
            print("Clicking Load Judge Persona...")
            await load_btn.click()
            await page.wait_for_timeout(4000)

        await page.screenshot(path="brag-output/debug_local_timeline.png")
        print("Captured debug_local_timeline.png")

        print("2. Going to http://localhost:5173/compass...")
        await page.goto("http://localhost:5173/compass", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        chat_box = page.locator("input.chat-input-box").first
        await chat_box.click()
        await chat_box.fill("Assess my project against the hackathon judging criteria and list my top 3 priorities.")
        await page.wait_for_timeout(500)
        await chat_box.press("Enter")
        print("Sent prompt, waiting 12s for streaming AI response...")
        await page.wait_for_timeout(12000)

        await page.screenshot(path="brag-output/debug_local_chat.png")
        print("Captured debug_local_chat.png")

        print("3. Asking Tavily web research query...")
        await chat_box.click()
        await chat_box.fill("Search the web for the official submission deadline and prize pool for the Nebius AI Hackathon on Devpost.")
        await page.wait_for_timeout(500)
        await chat_box.press("Enter")
        print("Waiting 14s for Tavily research response...")
        await page.wait_for_timeout(14000)

        await page.screenshot(path="brag-output/debug_local_tavily.png")
        print("Captured debug_local_tavily.png")

        await browser.close()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
