import asyncio
import time
import httpx
import json

BASE_URL = "http://localhost:8000"
AUTH_HEADER = {"Authorization": "Bearer dev-token", "Content-Type": "application/json"}

async def measure_chat_stream(prompt: str, label: str):
    print(f"\n--- Measuring /api/chat/stream: [{label}] ---")
    print(f"Prompt: \"{prompt}\"")
    
    t0 = time.perf_counter()
    first_byte_time = None
    first_token_time = None
    tokens_received = []
    done_time = None
    skill_used = None
    
    async with httpx.AsyncClient(timeout=45.0) as client:
        async with client.stream(
            "POST",
            f"{BASE_URL}/api/chat/stream",
            headers=AUTH_HEADER,
            json={"message": prompt}
        ) as response:
            t_connect = time.perf_counter() - t0
            first_byte_time = t_connect
            
            async for chunk in response.aiter_lines():
                t_now = time.perf_counter() - t0
                if not chunk:
                    continue
                if chunk.startswith("data:"):
                    raw_json = chunk[5:].strip()
                    try:
                        data = json.loads(raw_json)
                        if data.get("type") == "token":
                            if first_token_time is None:
                                first_token_time = t_now
                            tokens_received.append(data.get("value", ""))
                        elif data.get("type") == "done":
                            done_time = t_now
                            skill_used = data.get("skill_used")
                    except Exception as e:
                        print("Parse err:", e, chunk)
                        
    full_text = "".join(tokens_received)
    total_time = done_time or (time.perf_counter() - t0)
    
    print(f"Time to Connect/First Byte: {first_byte_time*1000:.1f}ms")
    if first_token_time:
        print(f"Time to First Streamed Token (TTFT): {first_token_time*1000:.1f}ms")
    else:
        print("Time to First Streamed Token (TTFT): N/A (no tokens)")
    print(f"Total Response Time: {total_time*1000:.1f}ms ({total_time:.2f}s)")
    print(f"Tokens emitted: {len(tokens_received)} chunks, {len(full_text.split())} words")
    print(f"Skill used: {skill_used}")
    print(f"Snippet: {full_text[:120]}...\n")
    return {
        "label": label,
        "first_byte_ms": round(first_byte_time * 1000, 1),
        "ttft_ms": round((first_token_time or 0) * 1000, 1),
        "total_ms": round(total_time * 1000, 1),
        "skill_used": skill_used,
        "text": full_text
    }

async def measure_chat_sync(prompt: str, label: str):
    print(f"\n--- Measuring /api/chat (Synchronous): [{label}] ---")
    print(f"Prompt: \"{prompt}\"")
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=45.0) as client:
        res = await client.post(
            f"{BASE_URL}/api/chat",
            headers=AUTH_HEADER,
            json={"message": prompt}
        )
        total_time = time.perf_counter() - t0
        data = res.json()
        print(f"Total Sync Response Time: {total_time*1000:.1f}ms ({total_time:.2f}s)")
        print(f"Snippet: {str(data.get('response', ''))[:120]}...\n")
        return {
            "label": label,
            "total_ms": round(total_time * 1000, 1),
            "response": data.get("response", "")
        }

async def main():
    # 1. Simple conversational message
    await measure_chat_stream("hey, what can you help with", "Conversational — Stream")
    await measure_chat_sync("hey, what can you help with", "Conversational — Sync")
    
    # 2. Skill/Tool call message
    await measure_chat_stream("show my coursework tasks", "Skill/Tool — Stream")
    await measure_chat_sync("show my coursework tasks", "Skill/Tool — Sync")

if __name__ == "__main__":
    asyncio.run(main())
