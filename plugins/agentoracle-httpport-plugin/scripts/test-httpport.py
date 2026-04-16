#!/usr/bin/env python3
"""
AgentOracle HTTP Port Plugin — 验证脚本 (Python)

独立验证 OpenClaw HTTP Port 通道是否正常工作，无需安装 npm 依赖。

测试流程：
  1. 启动临时本地回调 HTTP 服务器（随机空闲端口）
  2. POST 测试消息到 /httpport/inbound，callbackUrl 指向本地服务器
  3. 等待 OpenClaw Agent 推理完成并回调
  4. 打印响应，报告成功/失败
  5. 关闭临时服务器退出

使用方法：
  python3 scripts/test-httpport.py [测试消息]

环境变量：
  OPENCLAW_BASE_URL   OpenClaw HTTP 地址 (默认: http://127.0.0.1:18789)
  HTTPPORT_TOKEN    httpport 频道 token (必填)
  TIMEOUT_SECONDS     等待 Agent 响应超时 (默认: 120)

示例：
  HTTPPORT_TOKEN=my-secret python3 scripts/test-httpport.py
  HTTPPORT_TOKEN=my-secret python3 scripts/test-httpport.py "预测2025年AI市场增长率"
"""

import json
import os
import socket
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer

# ─── 配置 ────────────────────────────────────────────────────────────────────

OPENCLAW_BASE_URL = os.environ.get("OPENCLAW_BASE_URL", "http://127.0.0.1:18789")
HTTPPORT_TOKEN  = os.environ.get("HTTPPORT_TOKEN", "")
TIMEOUT_SECONDS   = int(os.environ.get("TIMEOUT_SECONDS", "120"))
TEST_MESSAGE      = sys.argv[1] if len(sys.argv) > 1 else '这是一个端到端验证测试。请简单回复验证成功。'
CONVERSATION_ID   = f"test-httpport-{int(time.time() * 1000)}"

# ─── 工具函数 ─────────────────────────────────────────────────────────────────

SEP = "=" * 60

def log(msg=""):   print(msg)
def ok(msg):       print(f"✅  {msg}")
def fail(msg):     print(f"❌  {msg}", file=sys.stderr)
def sep():         print(SEP)

def get_free_port():
    """获取一个随机空闲端口"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

# ─── 临时回调服务器 ───────────────────────────────────────────────────────────

class CallbackHandler(BaseHTTPRequestHandler):
    """
    接收来自 openclaw-httpport 的回调 POST 请求
    将 payload 写入共享的 result_holder 并通知等待线程
    """

    result_holder = {"payload": None, "event": threading.Event()}

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else ""

        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {"raw": body}

        # 回应 200 OK
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"ok")

        # 通知主线程
        CallbackHandler.result_holder["payload"] = payload
        CallbackHandler.result_holder["event"].set()

    def log_message(self, fmt, *args):
        # 静默 HTTP 服务器日志，保持输出整洁
        pass


# ─── 主流程 ───────────────────────────────────────────────────────────────────

def main():
    sep()
    log("AgentOracle HTTP Port Plugin — Validation Script (Python)")
    sep()
    log(f"OpenClaw URL:     {OPENCLAW_BASE_URL}")
    log(f"Inbound Endpoint: {OPENCLAW_BASE_URL}/httpport/inbound")
    log(f"Token:            {HTTPPORT_TOKEN[:6] + '...' if HTTPPORT_TOKEN else '(not set)'}")
    log(f"Conversation ID:  {CONVERSATION_ID}")
    log(f"Timeout:          {TIMEOUT_SECONDS}s")
    log(f"Test Message:     {TEST_MESSAGE[:80]}{'...' if len(TEST_MESSAGE) > 80 else ''}")
    sep()
    log()

    # ── 预检 ─────────────────────────────────────────────────────────────────
    if not HTTPPORT_TOKEN:
        fail("HTTPPORT_TOKEN 环境变量未设置！")
        log()
        log("请设置与 OpenClaw httpport 频道 token 相同的值：")
        log("  HTTPPORT_TOKEN=your-token python3 scripts/test-httpport.py")
        sys.exit(1)

    # ── Step 1: 启动临时回调服务器 ────────────────────────────────────────────
    log("Step 1 — 启动临时回调服务器...")

    port = get_free_port()
    callback_path = "/test-callback"
    callback_url  = f"http://127.0.0.1:{port}{callback_path}"

    CallbackHandler.result_holder["event"].clear()
    CallbackHandler.result_holder["payload"] = None

    server = HTTPServer(("127.0.0.1", port), CallbackHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    ok(f"回调服务器已启动: {callback_url}")
    log()

    # ── Step 2: POST 到 /httpport/inbound ───────────────────────────────────
    log("Step 2 — 发送测试消息到 /httpport/inbound...")

    inbound_url = f"{OPENCLAW_BASE_URL}/httpport/inbound"
    request_body = json.dumps({
        "conversationId": CONVERSATION_ID,
        "text":           TEST_MESSAGE,
        "callbackUrl":    callback_url,
    }).encode("utf-8")

    req = urllib.request.Request(
        inbound_url,
        data=request_body,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {HTTPPORT_TOKEN}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        server.shutdown()
        fail(f"/httpport/inbound 请求失败 (HTTP {e.code}): {e.reason}")
        log()
        log("可能原因：")
        log("  - openclaw-httpport 插件未安装或未启用")
        log("  - token 与 channels.httpport.token 不一致")
        log("  - OpenClaw Gateway 未运行")
        sys.exit(1)
    except (urllib.error.URLError, OSError) as e:
        server.shutdown()
        fail(f"无法连接到 OpenClaw: {e}")
        log()
        log(f"  请确认 OpenClaw Gateway 正在运行并监听 {OPENCLAW_BASE_URL}")
        sys.exit(1)

    ok(f"inbound 已接受 (HTTP {status})，等待 Agent 推理并回调...")
    log()

    # ── Step 3: 等待回调 ──────────────────────────────────────────────────────
    log(f"Step 3 — 等待回调（超时: {TIMEOUT_SECONDS}s）...")

    received = CallbackHandler.result_holder["event"].wait(timeout=TIMEOUT_SECONDS)

    server.shutdown()

    if not received:
        log()
        fail(f"超时（{TIMEOUT_SECONDS}s）— 未收到回调")
        log()
        log("可能原因：")
        log("  - callbackDefault 未正确配置（应包含本机可达地址）")
        log("  - Agent 推理耗时超过超时时间（增大 TIMEOUT_SECONDS）")
        log("  - openclaw-httpport 配置了 allowCallbackHosts 白名单，")
        log("    请检查是否包含 127.0.0.1")
        sys.exit(1)

    payload = CallbackHandler.result_holder["payload"]

    # ── Step 4: 打印结果 ──────────────────────────────────────────────────────
    log()
    sep()
    ok("验证成功！回调已收到。")
    sep()

    log()
    log("📨 回调 Payload:")
    log(json.dumps(payload, indent=2, ensure_ascii=False))
    log()

    if payload and payload.get("text"):
        sep()
        log("🤖 Agent 响应:")
        sep()
        log(payload["text"])
        sep()

    log()
    log("所有验证步骤通过：")
    ok("HTTP Port 频道连通 (/httpport/inbound 接受请求)")
    ok("OpenClaw Agent 成功推理")
    ok("回调服务器成功接收响应")
    log()
    log("插件已准备好处理 AgentOracle 预测任务。")
    log()
    sys.exit(0)


if __name__ == "__main__":
    main()
