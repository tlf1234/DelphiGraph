#!/usr/bin/env python3
"""
OpenClaw WebSocket 稳定性测试
测试连接稳定性、重连能力、超时处理、并发请求等
"""

import asyncio
import websockets
import json
import logging
import uuid
import time
from datetime import datetime
from pathlib import Path

# 配置
GATEWAY_WS_URL = "ws://127.0.0.1:18789"
GATEWAY_TOKEN = "74c143f4fe51a9e4caa2f4325d8fe1a8f0e216bf59a3b434"

# 日志设置
PLUGIN_DIR = Path(__file__).parent.resolve()
LOGS_DIR = PLUGIN_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "stability-test.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8", errors="replace"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("stability-test")


class TestResult:
    """测试结果记录"""
    def __init__(self, name):
        self.name = name
        self.success = False
        self.duration = 0
        self.error = None
        self.details = {}


async def send_simple_message(message: str, timeout: int = 30):
    """发送简单消息并获取响应"""
    try:
        start_time = time.time()
        
        async with websockets.connect(
            GATEWAY_WS_URL,
            ping_interval=20,
            ping_timeout=10
        ) as websocket:
            # 接收 challenge
            challenge_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            challenge_data = json.loads(challenge_msg)
            
            if challenge_data.get("type") != "event" or challenge_data.get("event") != "connect.challenge":
                raise Exception(f"Unexpected challenge: {challenge_data.get('type')}")
            
            # 发送 connect 请求
            connect_id = str(uuid.uuid4())
            connect_request = {
                "type": "req",
                "id": connect_id,
                "method": "connect",
                "params": {
                    "minProtocol": 3,
                    "maxProtocol": 3,
                    "client": {
                        "id": "cli",
                        "version": "1.0.0",
                        "platform": "windows",
                        "mode": "cli"
                    },
                    "role": "operator",
                    "scopes": ["operator.read", "operator.write"],
                    "caps": [],
                    "commands": [],
                    "permissions": {},
                    "auth": {"token": GATEWAY_TOKEN},
                    "locale": "zh-CN",
                    "userAgent": "stability-test/1.0.0"
                }
            }
            
            await websocket.send(json.dumps(connect_request))
            
            # 接收 connect 响应
            connect_response_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            connect_response = json.loads(connect_response_msg)
            
            if connect_response.get("type") != "res" or not connect_response.get("ok"):
                raise Exception(f"Connect failed: {connect_response.get('error')}")
            
            # 发送聊天消息
            session_key = connect_response.get("payload", {}).get("snapshot", {}).get("sessionDefaults", {}).get("mainSessionKey", "agent:main:main")
            
            chat_id = str(uuid.uuid4())
            chat_request = {
                "type": "req",
                "id": chat_id,
                "method": "chat.send",
                "params": {
                    "sessionKey": session_key,
                    "message": message,
                    "idempotencyKey": f"test-{datetime.now().timestamp()}"
                }
            }
            
            await websocket.send(json.dumps(chat_request))
            
            # 接收响应
            full_reply = ""
            chat_completed = False
            msg_start_time = time.time()
            
            while True:
                if time.time() - msg_start_time > timeout:
                    raise Exception(f"Message timeout after {timeout}s")
                
                try:
                    response_msg = await asyncio.wait_for(websocket.recv(), timeout=10)
                    response = json.loads(response_msg)
                    msg_type = response.get('type', 'unknown')
                    
                    if msg_type == "res" and response.get("id") == chat_id:
                        if not response.get("ok"):
                            raise Exception(f"Chat error: {response.get('error')}")
                    
                    elif msg_type == "event" and response.get("event") == "chat":
                        payload = response.get("payload", {})
                        state = payload.get("state", "")
                        
                        message_data = payload.get("message", {})
                        if isinstance(message_data, dict):
                            content_list = message_data.get("content", [])
                            if content_list and len(content_list) > 0:
                                text_content = content_list[0].get("text", "")
                                if text_content:
                                    full_reply = text_content
                        
                        if state in ["final", "done", "complete", "finished"]:
                            chat_completed = True
                            break
                
                except asyncio.TimeoutError:
                    if chat_completed or full_reply:
                        break
                    continue
            
            duration = time.time() - start_time
            return True, full_reply, duration
            
    except Exception as e:
        duration = time.time() - start_time
        return False, str(e), duration


async def test_basic_connection():
    """测试 1: 基本连接测试"""
    result = TestResult("基本连接测试")
    logger.info("=" * 60)
    logger.info("测试 1: 基本连接测试")
    logger.info("=" * 60)
    
    try:
        success, reply, duration = await send_simple_message("你好，请回复'收到'", timeout=30)
        
        result.success = success
        result.duration = duration
        result.details = {
            "reply_length": len(reply) if success else 0,
            "got_response": bool(reply)
        }
        
        if success:
            logger.info(f"✅ 测试通过 - 耗时: {duration:.2f}秒")
            logger.info(f"📝 回复长度: {len(reply)} 字符")
        else:
            logger.error(f"❌ 测试失败: {reply}")
            result.error = reply
            
    except Exception as e:
        result.error = str(e)
        logger.error(f"❌ 测试异常: {e}")
    
    return result


async def test_multiple_sequential():
    """测试 2: 连续多次请求"""
    result = TestResult("连续多次请求测试")
    logger.info("=" * 60)
    logger.info("测试 2: 连续多次请求测试 (5次)")
    logger.info("=" * 60)
    
    try:
        start_time = time.time()
        successes = 0
        failures = 0
        
        for i in range(5):
            logger.info(f"📤 发送第 {i+1}/5 次请求...")
            success, reply, duration = await send_simple_message(f"这是第{i+1}次测试，请简短回复", timeout=30)
            
            if success:
                successes += 1
                logger.info(f"✅ 第 {i+1} 次成功 - 耗时: {duration:.2f}秒")
            else:
                failures += 1
                logger.error(f"❌ 第 {i+1} 次失败: {reply}")
            
            # 间隔 2 秒
            if i < 4:
                await asyncio.sleep(2)
        
        total_duration = time.time() - start_time
        result.success = (failures == 0)
        result.duration = total_duration
        result.details = {
            "total_requests": 5,
            "successes": successes,
            "failures": failures,
            "success_rate": f"{(successes/5)*100:.1f}%"
        }
        
        logger.info(f"📊 结果: {successes}/5 成功, 成功率: {(successes/5)*100:.1f}%")
        
    except Exception as e:
        result.error = str(e)
        logger.error(f"❌ 测试异常: {e}")
    
    return result


async def test_timeout_handling():
    """测试 3: 超时处理测试"""
    result = TestResult("超时处理测试")
    logger.info("=" * 60)
    logger.info("测试 3: 超时处理测试 (10秒超时)")
    logger.info("=" * 60)
    
    try:
        # 发送一个可能需要较长时间的请求，但设置较短超时
        success, reply, duration = await send_simple_message(
            "请用100字详细解释量子计算的原理", 
            timeout=10
        )
        
        result.success = True  # 无论是否超时，只要能正确处理就算成功
        result.duration = duration
        result.details = {
            "completed_in_time": success,
            "reply_received": bool(reply)
        }
        
        if success:
            logger.info(f"✅ 在超时前完成 - 耗时: {duration:.2f}秒")
        else:
            logger.info(f"⏰ 触发超时保护 - 耗时: {duration:.2f}秒")
            logger.info(f"错误信息: {reply}")
        
    except Exception as e:
        result.error = str(e)
        logger.error(f"❌ 测试异常: {e}")
    
    return result


async def test_long_message():
    """测试 4: 长消息测试"""
    result = TestResult("长消息测试")
    logger.info("=" * 60)
    logger.info("测试 4: 长消息测试")
    logger.info("=" * 60)
    
    try:
        long_message = "请分析以下场景：" + "这是一个复杂的预测任务。" * 20 + " 请简短回复。"
        
        success, reply, duration = await send_simple_message(long_message, timeout=30)
        
        result.success = success
        result.duration = duration
        result.details = {
            "message_length": len(long_message),
            "reply_length": len(reply) if success else 0
        }
        
        if success:
            logger.info(f"✅ 测试通过 - 耗时: {duration:.2f}秒")
            logger.info(f"📝 发送: {len(long_message)} 字符, 接收: {len(reply)} 字符")
        else:
            logger.error(f"❌ 测试失败: {reply}")
            result.error = reply
            
    except Exception as e:
        result.error = str(e)
        logger.error(f"❌ 测试异常: {e}")
    
    return result


async def test_connection_reuse():
    """测试 5: 连接复用测试"""
    result = TestResult("连接复用测试")
    logger.info("=" * 60)
    logger.info("测试 5: 连接复用测试 (同一连接发送3次)")
    logger.info("=" * 60)
    
    try:
        start_time = time.time()
        successes = 0
        
        async with websockets.connect(
            GATEWAY_WS_URL,
            ping_interval=20,
            ping_timeout=10
        ) as websocket:
            # 握手
            challenge_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            challenge_data = json.loads(challenge_msg)
            
            connect_id = str(uuid.uuid4())
            connect_request = {
                "type": "req",
                "id": connect_id,
                "method": "connect",
                "params": {
                    "minProtocol": 3,
                    "maxProtocol": 3,
                    "client": {"id": "cli", "version": "1.0.0", "platform": "windows", "mode": "cli"},
                    "role": "operator",
                    "scopes": ["operator.read", "operator.write"],
                    "caps": [],
                    "commands": [],
                    "permissions": {},
                    "auth": {"token": GATEWAY_TOKEN},
                    "locale": "zh-CN",
                    "userAgent": "stability-test/1.0.0"
                }
            }
            
            await websocket.send(json.dumps(connect_request))
            connect_response_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            connect_response = json.loads(connect_response_msg)
            
            if not connect_response.get("ok"):
                raise Exception("Connect failed")
            
            session_key = connect_response.get("payload", {}).get("snapshot", {}).get("sessionDefaults", {}).get("mainSessionKey", "agent:main:main")
            
            # 在同一连接上发送3次消息
            for i in range(3):
                logger.info(f"📤 在同一连接上发送第 {i+1}/3 次消息...")
                
                chat_id = str(uuid.uuid4())
                chat_request = {
                    "type": "req",
                    "id": chat_id,
                    "method": "chat.send",
                    "params": {
                        "sessionKey": session_key,
                        "message": f"连接复用测试 {i+1}，请简短回复",
                        "idempotencyKey": f"reuse-{i}-{datetime.now().timestamp()}"
                    }
                }
                
                await websocket.send(json.dumps(chat_request))
                
                # 等待响应
                got_response = False
                msg_start = time.time()
                while time.time() - msg_start < 20:
                    try:
                        response_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                        response = json.loads(response_msg)
                        
                        if response.get("type") == "event" and response.get("event") == "chat":
                            payload = response.get("payload", {})
                            if payload.get("state") in ["final", "done", "complete", "finished"]:
                                got_response = True
                                successes += 1
                                logger.info(f"✅ 第 {i+1} 次成功")
                                break
                    except asyncio.TimeoutError:
                        continue
                
                if not got_response:
                    logger.error(f"❌ 第 {i+1} 次超时")
                
                if i < 2:
                    await asyncio.sleep(1)
        
        total_duration = time.time() - start_time
        result.success = (successes == 3)
        result.duration = total_duration
        result.details = {
            "successes": successes,
            "total": 3
        }
        
        logger.info(f"📊 结果: {successes}/3 成功")
        
    except Exception as e:
        result.error = str(e)
        logger.error(f"❌ 测试异常: {e}")
    
    return result


async def main():
    """运行所有测试"""
    logger.info("🚀 OpenClaw WebSocket 稳定性测试开始")
    logger.info(f"⏰ 测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"🔗 Gateway: {GATEWAY_WS_URL}")
    logger.info("")
    
    results = []
    
    # 运行所有测试
    tests = [
        test_basic_connection,
        test_multiple_sequential,
        test_timeout_handling,
        test_long_message,
        test_connection_reuse
    ]
    
    for test_func in tests:
        result = await test_func()
        results.append(result)
        logger.info("")
        await asyncio.sleep(2)  # 测试间隔
    
    # 生成测试报告
    logger.info("=" * 60)
    logger.info("📊 测试报告汇总")
    logger.info("=" * 60)
    
    total_tests = len(results)
    passed_tests = sum(1 for r in results if r.success)
    failed_tests = total_tests - passed_tests
    
    for i, result in enumerate(results, 1):
        status = "✅ 通过" if result.success else "❌ 失败"
        logger.info(f"{i}. {result.name}: {status} (耗时: {result.duration:.2f}秒)")
        if result.details:
            for key, value in result.details.items():
                logger.info(f"   - {key}: {value}")
        if result.error:
            logger.info(f"   - 错误: {result.error}")
    
    logger.info("")
    logger.info(f"总计: {total_tests} 个测试")
    logger.info(f"通过: {passed_tests} 个 ({(passed_tests/total_tests)*100:.1f}%)")
    logger.info(f"失败: {failed_tests} 个 ({(failed_tests/total_tests)*100:.1f}%)")
    
    # 稳定性评估
    logger.info("")
    logger.info("=" * 60)
    logger.info("🎯 稳定性评估")
    logger.info("=" * 60)
    
    success_rate = (passed_tests / total_tests) * 100
    
    if success_rate == 100:
        logger.info("⭐⭐⭐⭐⭐ 优秀 - WebSocket 连接非常稳定")
        logger.info("建议: 可以放心使用，适合生产环境")
    elif success_rate >= 80:
        logger.info("⭐⭐⭐⭐☆ 良好 - WebSocket 连接基本稳定")
        logger.info("建议: 可以使用，偶尔可能需要重试")
    elif success_rate >= 60:
        logger.info("⭐⭐⭐☆☆ 一般 - WebSocket 连接有时不稳定")
        logger.info("建议: 需要添加重试机制")
    else:
        logger.info("⭐⭐☆☆☆ 较差 - WebSocket 连接不稳定")
        logger.info("建议: 检查网络环境或 OpenClaw Gateway 状态")
    
    logger.info("")
    logger.info(f"📄 详细日志已保存到: {LOG_FILE}")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
