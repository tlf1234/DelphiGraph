#!/usr/bin/env python3
"""
UAP Agent Simulation Script
============================
Creates 100+ simulated agent signal submission data points and uploads them to
the database via the actual Next.js API endpoints, in batches of 10
every 5 seconds.

Usage:
    python simulate_uap_agents.py --task-id <UUID> [--frontend-url http://localhost:3000]
    python simulate_uap_agents.py --list-tasks           # List active tasks
    python simulate_uap_agents.py --cleanup              # Delete sim agents/submissions

Requirements:
    pip install httpx python-dotenv

Environment:
    NEXT_PUBLIC_APP_URL  - Frontend base URL (default: http://localhost:3000)
    SUPABASE_URL         - Supabase project URL
    SUPABASE_SERVICE_KEY - Service role key for direct DB access (cleanup only)
"""

import asyncio
import argparse
import sys
import time
from datetime import datetime

try:
    import httpx
except ImportError:
    print("[ERROR] httpx not installed. Run: pip install httpx")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional

import os

# ── Config ──────────────────────────────────────────────────────────────────

FRONTEND_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

TOTAL_BATCHES = 10          # 10 batches × 10 per batch = 100 submissions
BATCH_SIZE = 10
BATCH_INTERVAL_SECS = 5     # seconds between batches
ANALYSIS_TRIGGER_BATCH = 1  # trigger analysis after this batch index


# ── Logging ─────────────────────────────────────────────────────────────────

def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    icons = {"INFO": "ℹ️ ", "OK": "✅", "ERR": "❌", "WARN": "⚠️ ", "SIM": "🧪"}
    icon = icons.get(level, "  ")
    print(f"[{ts}] {icon} {msg}")


# ── API Helpers ──────────────────────────────────────────────────────────────

async def prepare_agents(client: httpx.AsyncClient) -> list[dict]:
    """Call /api/test/prepare to create/retrieve sim agents."""
    log("Preparing sim agent profiles...", "SIM")
    try:
        r = await client.post(f"{FRONTEND_URL}/api/test/prepare", timeout=60.0)
        r.raise_for_status()
        data = r.json()
        agents = data.get("agents", [])
        msg = "reused existing" if data.get("reused") else "newly created"
        log(f"{len(agents)} sim agents ready ({msg})", "OK")
        return agents
    except httpx.HTTPStatusError as e:
        log(f"prepare failed: {e.response.status_code} {e.response.text[:200]}", "ERR")
        return []
    except Exception as e:
        log(f"prepare error: {e}", "ERR")
        return []


async def upload_batch(
    client: httpx.AsyncClient,
    task_id: str,
    batch_index: int,
    agents: list[dict],
) -> dict | None:
    """Upload a batch of 10 signal submissions."""
    try:
        r = await client.post(
            f"{FRONTEND_URL}/api/test/upload-batch",
            json={"task_id": task_id, "batch_index": batch_index, "agents": agents},
            timeout=30.0,
        )
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        log(f"batch {batch_index+1} upload error: {e.response.status_code} {e.response.text[:200]}", "ERR")
        return None
    except Exception as e:
        log(f"batch {batch_index+1} upload error: {e}", "ERR")
        return None


async def trigger_analysis(client: httpx.AsyncClient, task_id: str) -> bool:
    """Trigger causal analysis - tries real engine, falls back to mock."""
    log("Triggering causal analysis engine...", "SIM")

    # Try real causal engine first
    try:
        r = await client.post(
            f"{FRONTEND_URL}/api/causal-analysis/{task_id}",
            json={"force_final": False},
            timeout=30.0,
        )
        if r.status_code == 200:
            log("Causal engine accepted task, processing in background...", "OK")
            return True
        elif r.status_code in (503, 404):
            log("Causal engine not available, switching to mock analysis...", "WARN")
        else:
            log(f"Causal engine returned {r.status_code}, switching to mock...", "WARN")
    except Exception as e:
        log(f"Causal engine unreachable ({e}), switching to mock...", "WARN")

    # Fall back to mock analysis
    try:
        r = await client.post(
            f"{FRONTEND_URL}/api/test/mock-analysis",
            json={"task_id": task_id},
            timeout=30.0,
        )
        r.raise_for_status()
        data = r.json()
        log(f"Mock analysis complete v{data.get('version', '?')}, "
            f"direction={data.get('direction', '?')}, "
            f"confidence={data.get('confidence', 0):.0%}", "OK")
        return True
    except Exception as e:
        log(f"Mock analysis failed: {e}", "ERR")
        return False


async def poll_analysis(client: httpx.AsyncClient, task_id: str, max_wait_secs: int = 60) -> bool:
    """Poll for analysis result after batches are uploaded."""
    log(f"Polling for analysis result (max {max_wait_secs}s)...", "SIM")
    deadline = time.time() + max_wait_secs
    known_version = 0

    while time.time() < deadline:
        await asyncio.sleep(3)
        try:
            r = await client.get(
                f"{FRONTEND_URL}/api/causal-analysis/{task_id}",
                timeout=15.0,
            )
            if r.status_code == 200:
                data = r.json()
                version = data.get("version", 0)
                if version > known_version:
                    known_version = version
                    direction = data.get("conclusion", {}).get("direction", "?")
                    confidence = data.get("conclusion", {}).get("confidence", 0)
                    status = data.get("status", "?")
                    log(f"Analysis v{version}: status={status}, direction={direction}, confidence={confidence:.0%}", "OK")
                    if status == "completed":
                        return True
        except Exception:
            pass  # keep polling

    log("Polling timed out", "WARN")
    return False


async def list_active_tasks(client: httpx.AsyncClient) -> None:
    """List active tasks using Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in environment", "ERR")
        return

    try:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/prediction_tasks",
            params={"status": "eq.active", "select": "id,title,question,status,closes_at", "limit": "20"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            timeout=15.0,
        )
        r.raise_for_status()
        tasks = r.json()
        if not tasks:
            log("No active tasks found", "WARN")
            return
        print(f"\n{'ID':<38} {'CLOSES':<12} TITLE")
        print("-" * 90)
        for m in tasks:
            closes = m.get("closes_at", "")[:10]
            title = (m.get("title") or m.get("question", ""))[:50]
            print(f"{m['id']}  {closes}  {title}")
        print()
    except Exception as e:
        log(f"Failed to list tasks: {e}", "ERR")


async def cleanup_sim_data(client: httpx.AsyncClient) -> None:
    """Delete sim agent profiles + their signal submissions from Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in environment", "ERR")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    log("Looking up sim agent profiles...", "SIM")
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        params={"username": "like.SimAgent_%", "select": "id,username"},
        headers=headers,
        timeout=15.0,
    )
    profiles = r.json() if r.status_code == 200 else []
    if not profiles:
        log("No sim agent profiles found", "INFO")
        return

    profile_ids = [p["id"] for p in profiles]
    log(f"Found {len(profiles)} sim agent profiles, deleting signal_submissions...", "INFO")

    # Delete signal submissions
    for pid in profile_ids:
        await client.delete(
            f"{SUPABASE_URL}/rest/v1/signal_submissions",
            params={"user_id": f"eq.{pid}"},
            headers=headers,
            timeout=15.0,
        )

    # Delete auth users (which cascades to profiles)
    log("Deleting sim auth users (cascades to profiles)...", "INFO")
    for pid in profile_ids:
        try:
            await client.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{pid}",
                headers=headers,
                timeout=15.0,
            )
        except Exception:
            pass

    log(f"Cleanup complete: removed {len(profiles)} sim agents", "OK")


# ── Main Simulation ──────────────────────────────────────────────────────────

async def run_simulation(task_id: str) -> None:
    log(f"=== UAP Agent Simulation ===", "SIM")
    log(f"Target task: {task_id}", "INFO")
    log(f"Plan: {TOTAL_BATCHES} batches × {BATCH_SIZE} agents = {TOTAL_BATCHES * BATCH_SIZE} submissions", "INFO")
    log(f"Batch interval: {BATCH_INTERVAL_SECS}s | Analysis trigger: after batch {ANALYSIS_TRIGGER_BATCH + 1}", "INFO")
    print()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # Step 1: Prepare agents
        agents = await prepare_agents(client)
        if not agents:
            log("Aborting: no agents available", "ERR")
            return

        # Step 2: Upload batches
        total_uploaded = 0
        for batch_idx in range(TOTAL_BATCHES):
            start = batch_idx * BATCH_SIZE + 1
            end = start + BATCH_SIZE - 1
            log(f"Uploading batch {batch_idx + 1}/{TOTAL_BATCHES} (submissions {start}-{end})...", "SIM")

            result = await upload_batch(client, task_id, batch_idx, agents)
            if result:
                total_uploaded = result.get("total_submissions", total_uploaded + BATCH_SIZE)
                log(f"  Batch {batch_idx + 1} inserted {result.get('inserted', 0)} | "
                    f"total in DB: {total_uploaded}", "OK")
            else:
                log(f"  Batch {batch_idx + 1} failed, continuing...", "WARN")

            # Trigger analysis after ANALYSIS_TRIGGER_BATCH
            if batch_idx == ANALYSIS_TRIGGER_BATCH:
                print()
                await trigger_analysis(client, task_id)
                print()

            # Wait before next batch (skip wait after last batch)
            if batch_idx < TOTAL_BATCHES - 1:
                log(f"  Waiting {BATCH_INTERVAL_SECS}s before next batch...", "INFO")
                await asyncio.sleep(BATCH_INTERVAL_SECS)

        print()
        log(f"All batches uploaded! Total submissions: {total_uploaded}", "OK")

        # Step 3: Poll for final result
        print()
        success = await poll_analysis(client, task_id, max_wait_secs=90)
        if success:
            log("Simulation complete! Open the task page to see the causal graph.", "OK")
        else:
            log("Analysis not yet complete. Check the frontend for live updates.", "WARN")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="UAP Agent Simulation - uploads 100 agent signal submissions in batches of 10 every 5s"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--task-id", metavar="UUID", help="Task ID to simulate against")
    group.add_argument("--list-tasks", action="store_true", help="List active tasks and exit")
    group.add_argument("--cleanup", action="store_true", help="Delete all sim agent data and exit")

    global FRONTEND_URL
    parser.add_argument("--frontend-url", default=FRONTEND_URL,
                        help=f"Frontend base URL (default: {FRONTEND_URL})")
    args = parser.parse_args()

    FRONTEND_URL = args.frontend_url.rstrip("/")

    if args.list_tasks:
        asyncio.run(_list_and_exit())
    elif args.cleanup:
        asyncio.run(_cleanup_and_exit())
    else:
        asyncio.run(run_simulation(args.task_id))


async def _list_and_exit():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        await list_active_tasks(client)


async def _cleanup_and_exit():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        await cleanup_sim_data(client)


if __name__ == "__main__":
    main()
