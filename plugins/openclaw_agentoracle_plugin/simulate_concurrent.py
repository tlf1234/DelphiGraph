"""
AgentOracle 并发信号模拟脚本
==============================
用途：模拟多个 Agent 并发向平台提交信号，验证完整数据流（接收 → 存储 → 触发因果分析）。

依赖：与插件相同（requests, jsonschema）

用法：
  # 基本用法（使用环境变量）
  PLATFORM_URL=http://localhost:3000 AGENT_API_KEY=your_key python simulate_concurrent.py

  # 指定并发数和任务 ID
  python simulate_concurrent.py --url http://localhost:3000 --key YOUR_KEY --count 10 --task-id TASK_UUID

  # 使用多个 API Key（逗号分隔），每个 key 代表一个不同的 Agent
  python simulate_concurrent.py --url http://localhost:3000 --keys KEY1,KEY2,KEY3

注意：
  - 运行前需先将平台 /api/agent/signals 中的重复提交检查临时屏蔽
  - 脚本直接复用插件的 AgentOracleClient，走真实 HTTP 流程
"""

import argparse
import os
import sys
import time
import random
import uuid
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

# 让脚本可从任意目录运行
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from api_client import AgentOracleClient, AuthenticationError, NetworkError

# ── 模拟用户画像库（不同 Agent 代表不同人群）──────────────────────────────────
MOCK_PERSONAS = [
    {"gender": "female", "age_range": "25-34", "occupation": "教师", "region": "北京", "interests": ["教育", "心理"]},
    {"gender": "male",   "age_range": "35-44", "occupation": "工程师", "region": "上海", "interests": ["科技", "金融"]},
    {"gender": "female", "age_range": "18-24", "occupation": "学生", "region": "广州", "interests": ["娱乐", "时尚"]},
    {"gender": "male",   "age_range": "45-54", "occupation": "医生", "region": "成都", "interests": ["健康", "科学"]},
    {"gender": "other",  "age_range": "25-34", "occupation": "自由职业", "region": "杭州", "interests": ["创业", "旅行"]},
    {"gender": "female", "age_range": "35-44", "occupation": "律师", "region": "深圳", "interests": ["法律", "商业"]},
    {"gender": "male",   "age_range": "55-64", "occupation": "退休人员", "region": "重庆", "interests": ["养老", "股市"]},
    {"gender": "female", "age_range": "25-34", "occupation": "设计师", "region": "武汉", "interests": ["艺术", "科技"]},
]

# ── 模拟证据文本模板（不同观点角度）────────────────────────────────────────────
EVIDENCE_TEMPLATES = [
    "从我的日常经验来看，{angle}。相关数据显示这一趋势在近三年内持续强化，置信度较高。",
    "基于行业观察，{angle}。多方信息源印证了这一判断，但存在一定不确定性。",
    "根据现有公开资料，{angle}。这与该领域主流专家的预判基本一致。",
    "结合实际案例分析，{angle}。局部数据支持此结论，但需更多样本验证。",
    "从社会心理角度考量，{angle}。舆论风向和市场反馈共同指向这一方向。",
]

EVIDENCE_ANGLES = [
    "当前形势更倾向于肯定方向演进",
    "不确定性因素较多，结果难以定论",
    "短期内可能出现反转，需密切关注",
    "长期趋势明显，短期波动不改变大方向",
    "外部环境的变化将是关键影响因子",
    "技术和政策双重驱动下，正向结果概率更大",
    "市场预期已部分定价，实际结果可能超预期",
]


def build_mock_signal(task: dict, agent_index: int) -> dict:
    """为指定 Agent 构建一条模拟信号 payload（UAP v3.0 格式）"""
    persona = MOCK_PERSONAS[agent_index % len(MOCK_PERSONAS)]
    template = random.choice(EVIDENCE_TEMPLATES)
    angle = random.choice(EVIDENCE_ANGLES)
    evidence_text = template.format(angle=angle)

    task_id = task.get("task_id") or task.get("id")
    signal_id = f"sim_{task_id[:8]}_{int(time.time())}_{agent_index}"

    return {
        "task_id": task_id,
        "status": "submitted",
        "privacy_cleared": True,
        "protocol_version": "3.0",
        "plugin_version": "simulate/1.0",
        "model_name": "simulation",
        "user_persona": persona,
        "signals": [{
            "signal_id": signal_id,
            "evidence_type": random.choice(["hard_fact", "persona_inference"]),
            "evidence_text": evidence_text,
            "relevance_score": round(random.uniform(0.55, 0.95), 2),
            "relevance_reasoning": f"来自{persona['occupation']}视角的分析，基于{', '.join(persona['interests'])}领域经验",
            "source_type": "llm_analysis",
            "entity_tags": [],
            "source_urls": [],
            "data_exclusivity": "public",
        }],
    }


def run_single_agent(
    api_key: str,
    base_url: str,
    agent_index: int,
    task_id_override: Optional[str] = None,
) -> dict:
    """单个 Agent 的完整流程：获取任务 → 构建信号 → 提交"""
    result = {
        "agent_index": agent_index,
        "api_key_hint": f"...{api_key[-6:]}",
        "status": "unknown",
        "task_id": None,
        "submission_id": None,
        "elapsed_ms": 0,
        "error": None,
    }

    t0 = time.time()
    try:
        client = AgentOracleClient(api_key=api_key, base_url=base_url)

        # 获取任务
        if task_id_override:
            # 直接构建最小 task 对象（用于指定 task_id 的模式）
            task = {"task_id": task_id_override, "question": "[specified task]"}
        else:
            task = client.fetch_task()
            if not task:
                result["status"] = "no_task"
                result["elapsed_ms"] = int((time.time() - t0) * 1000)
                return result

        result["task_id"] = task.get("task_id") or task.get("id")

        # 构建并提交信号
        payload = build_mock_signal(task, agent_index)
        success = client.submit_result(payload)

        result["status"] = "success" if success else "failed"

    except AuthenticationError as e:
        result["status"] = "auth_error"
        result["error"] = str(e)
    except NetworkError as e:
        result["status"] = "network_error"
        result["error"] = str(e)
    except Exception as e:
        result["status"] = "exception"
        result["error"] = str(e)

    result["elapsed_ms"] = int((time.time() - t0) * 1000)
    return result


def print_summary(results: list, total_ms: float):
    """打印模拟结果汇总表"""
    success = [r for r in results if r["status"] == "success"]
    failed  = [r for r in results if r["status"] not in ("success", "no_task")]
    no_task = [r for r in results if r["status"] == "no_task"]

    print("\n" + "=" * 60)
    print("  AgentOracle 并发模拟结果汇总")
    print("=" * 60)
    print(f"  总请求数   : {len(results)}")
    print(f"  成功       : {len(success)}")
    print(f"  无任务     : {len(no_task)}")
    print(f"  失败/错误  : {len(failed)}")
    print(f"  总耗时     : {total_ms:.0f} ms")
    if success:
        avg_ms = sum(r["elapsed_ms"] for r in success) / len(success)
        print(f"  平均响应   : {avg_ms:.0f} ms / 请求")
    print("-" * 60)

    if failed:
        print("  失败详情：")
        for r in failed:
            print(f"    Agent#{r['agent_index']:02d} [{r['status']}] {r.get('error', '')}")
        print("-" * 60)

    task_ids = {r["task_id"] for r in success if r["task_id"]}
    if task_ids:
        print(f"  提交至任务 : {', '.join(task_ids)}")

    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="AgentOracle 并发信号模拟")
    parser.add_argument("--url",     default=os.environ.get("PLATFORM_URL", "http://localhost:3000"),
                        help="平台地址（默认 http://localhost:3000）")
    parser.add_argument("--key",     default=os.environ.get("AGENT_API_KEY", ""),
                        help="单个 Agent API Key")
    parser.add_argument("--keys",    default=os.environ.get("AGENT_API_KEYS", ""),
                        help="多个 API Key（逗号分隔），每个 key 代表一个 Agent")
    parser.add_argument("--count",   type=int, default=int(os.environ.get("CONCURRENT_COUNT", "5")),
                        help="并发 Agent 数量（单 key 模式下重复提交次数，默认 5）")
    parser.add_argument("--task-id", default=os.environ.get("TARGET_TASK_ID", ""),
                        help="指定目标任务 ID（不填则从 API 自动获取）")
    parser.add_argument("--delay",   type=float, default=0.0,
                        help="每个 Agent 启动前的随机最大延迟（秒），模拟真实分散到达")
    args = parser.parse_args()

    # 确定 API key 列表
    if args.keys:
        api_keys = [k.strip() for k in args.keys.split(",") if k.strip()]
    elif args.key:
        # 单 key 模式：重复 count 次（重复提交检查已屏蔽）
        api_keys = [args.key] * args.count
    else:
        print("❌ 错误：请通过 --key / --keys 或环境变量 AGENT_API_KEY 提供 API Key")
        sys.exit(1)

    task_id_override = args.task_id or None

    print(f"\n🚀 AgentOracle 并发模拟启动")
    print(f"   平台地址 : {args.url}")
    print(f"   Agent 数 : {len(api_keys)}")
    print(f"   目标任务 : {task_id_override or '自动获取'}")
    print(f"   启动延迟 : 0 ~ {args.delay:.1f}s\n")

    t_start = time.time()

    def run_with_delay(idx_key):
        idx, key = idx_key
        if args.delay > 0:
            time.sleep(random.uniform(0, args.delay))
        return run_single_agent(key, args.url, idx, task_id_override)

    with ThreadPoolExecutor(max_workers=len(api_keys)) as executor:
        futures = {executor.submit(run_with_delay, (i, k)): i for i, k in enumerate(api_keys)}
        results = []
        for future in as_completed(futures):
            r = future.result()
            status_icon = "✅" if r["status"] == "success" else ("⚠️ " if r["status"] == "no_task" else "❌")
            print(f"  {status_icon} Agent#{r['agent_index']:02d}  task={r['task_id'] or 'N/A'}  {r['elapsed_ms']}ms  [{r['status']}]")
            results.append(r)

    total_ms = (time.time() - t_start) * 1000
    print_summary(sorted(results, key=lambda r: r["agent_index"]), total_ms)


if __name__ == "__main__":
    main()
