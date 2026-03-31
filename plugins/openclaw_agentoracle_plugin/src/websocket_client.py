"""
WebSocket Client for OpenClaw Gateway (Protocol v3)

This module handles WebSocket communication with OpenClaw Gateway using Protocol v3.
It provides a production-ready implementation with automatic reconnection, exponential
backoff, and comprehensive error handling.

Based on openclaw_daily_elf implementation.
"""

import asyncio
import websockets
import json
import uuid
from typing import Optional
from datetime import datetime

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class OpenClawWebSocketClient:
    """WebSocket client for OpenClaw Gateway Protocol v3"""
    
    def __init__(self, 
                 gateway_url: str = "ws://127.0.0.1:18789",
                 gateway_token: Optional[str] = None,
                 timeout: int = 300,
                 max_retries: int = 3,
                 connect_timeout: int = 10,
                 message_timeout: int = 20):
        """Initialize WebSocket client.
        
        Args:
            gateway_url: WebSocket URL for OpenClaw Gateway (default: ws://127.0.0.1:18789)
            gateway_token: Authentication token for Gateway (optional)
            timeout: Total timeout for message exchange in seconds (default: 300)
            max_retries: Maximum number of retry attempts (default: 3)
            connect_timeout: Connection timeout in seconds (default: 10)
            message_timeout: Single message timeout in seconds (default: 20)
        """
        self.gateway_url = gateway_url
        self.gateway_token = gateway_token
        self.timeout = timeout
        self.max_retries = max_retries
        self.connect_timeout = connect_timeout
        self.message_timeout = message_timeout
        self.logger = setup_logger()
        
        # Retry delay base (exponential backoff)
        self.retry_delay_base = 2
    
    async def send_message(self, message: str) -> Optional[str]:
        """Send message to OpenClaw Gateway and receive response.
        
        Implements Protocol v3 handshake:
        1. Receive connect.challenge
        2. Send connect request with authentication
        3. Receive connect response
        4. Send chat.send message
        5. Receive chat events until completion
        
        Includes automatic reconnection with exponential backoff.
        
        Args:
            message: Message text to send to the agent
            
        Returns:
            Agent's response text, or None if communication failed
        """
        for attempt in range(self.max_retries):
            try:
                if attempt > 0:
                    # Exponential backoff
                    delay = self.retry_delay_base ** attempt
                    self.logger.info(f"[AgentOracle] 🔄 第 {attempt + 1}/{self.max_retries} 次重试，等待 {delay} 秒...")
                    await asyncio.sleep(delay)
                
                self.logger.info(f"[AgentOracle] 🔌 连接到 {self.gateway_url}...")
                
                async with websockets.connect(
                    self.gateway_url,
                    ping_interval=30,  # 每30秒发送心跳
                    ping_timeout=20,   # 20秒无响应则超时
                    close_timeout=10   # 关闭超时
                ) as websocket:
                    self.logger.info("[AgentOracle] ✅ 已连接到 OpenClaw Gateway")
                    
                    # Step 1: Receive connect.challenge
                    self.logger.info("[AgentOracle] ⏳ 等待 connect.challenge...")
                    challenge_msg = await asyncio.wait_for(
                        websocket.recv(), 
                        timeout=self.connect_timeout
                    )
                    challenge_data = json.loads(challenge_msg)
                    self.logger.info(f"[AgentOracle] 📨 收到 challenge")
                    
                    if challenge_data.get("type") != "event" or challenge_data.get("event") != "connect.challenge":
                        raise Exception(f"意外的消息类型: {challenge_data.get('type')}")
                    
                    nonce = challenge_data.get("payload", {}).get("nonce")
                    if not nonce:
                        raise Exception("Challenge 中没有 nonce")
                    
                    # Step 2: Send connect request
                    connect_id = str(uuid.uuid4())
                    connect_request = {
                        "type": "req",
                        "id": connect_id,
                        "method": "connect",
                        "params": {
                            "minProtocol": 3,
                            "maxProtocol": 3,
                            "client": {
                                "id": "cli",  # Must be 'cli' as required by OpenClaw Gateway
                                "version": "1.0.0",
                                "platform": "windows",
                                "mode": "cli"  # Must be 'cli' as required by OpenClaw Gateway
                            },
                            "role": "operator",
                            "scopes": ["operator.read", "operator.write"],
                            "caps": [],
                            "commands": [],
                            "permissions": {},
                            "locale": "zh-CN",
                            "userAgent": "openclaw-agentoracle-plugin/1.0.0"
                        }
                    }
                    
                    # Add authentication if token is provided
                    if self.gateway_token:
                        connect_request["params"]["auth"] = {
                            "token": self.gateway_token
                        }
                    
                    self.logger.info("[AgentOracle] 📤 发送 connect 请求...")
                    await websocket.send(json.dumps(connect_request))
                    
                    # Step 3: Receive connect response
                    self.logger.info("[AgentOracle] ⏳ 等待 connect 响应...")
                    connect_response_msg = await asyncio.wait_for(
                        websocket.recv(), 
                        timeout=self.connect_timeout
                    )
                    connect_response = json.loads(connect_response_msg)
                    
                    if connect_response.get("type") != "res" or not connect_response.get("ok"):
                        error = connect_response.get("error", "未知错误")
                        raise Exception(f"连接失败: {error}")
                    
                    self.logger.info("[AgentOracle] ✅ 连接成功！")
                    
                    # Step 4: Use main session (same as daily_elf)
                    # Extract mainSessionKey from connect response, fallback to agent:main:main
                    session_key = connect_response.get("payload", {}).get("snapshot", {}).get("sessionDefaults", {}).get("mainSessionKey", "agent:main:main")
                    
                    # Log session key for debugging
                    self.logger.info(f"[AgentOracle] 📋 使用 Session Key: {session_key}")
                    
                    chat_id = str(uuid.uuid4())
                    chat_request = {
                        "type": "req",
                        "id": chat_id,
                        "method": "chat.send",
                        "params": {
                            "sessionKey": session_key,
                            "message": message,
                            "idempotencyKey": f"agentoracle-{datetime.now().timestamp()}"
                        }
                    }
                    
                    self.logger.info(f"[AgentOracle] 📤 发送聊天消息（长度: {len(message)} 字符）...")
                    await websocket.send(json.dumps(chat_request))
                    
                    # Step 5: Receive response
                    self.logger.info("[AgentOracle] ⏳ 等待 AI 响应...")
                    full_reply = ""
                    start_time = asyncio.get_event_loop().time()
                    chat_completed = False
                    last_update_time = start_time
                    
                    while True:
                        elapsed = asyncio.get_event_loop().time() - start_time
                        if elapsed > self.timeout:
                            self.logger.error(f"[AgentOracle] ⏰ 总超时 ({self.timeout}秒)")
                            raise Exception(f"任务超时 ({self.timeout}秒)")
                        
                        try:
                            response_msg = await asyncio.wait_for(
                                websocket.recv(), 
                                timeout=self.message_timeout
                            )
                            response = json.loads(response_msg)
                            msg_type = response.get('type', 'unknown')
                            
                            if msg_type == "res":
                                # Response message
                                if response.get("id") == chat_id:
                                    if response.get("ok"):
                                        self.logger.info("[AgentOracle] ✅ 聊天请求已接受")
                                    else:
                                        error = response.get("error", "未知错误")
                                        raise Exception(f"聊天错误: {error}")
                            
                            elif msg_type == "event":
                                # Event message
                                event = response.get("event", "unknown")
                                
                                if event == "chat":
                                    payload = response.get("payload", {})
                                    state = payload.get("state", "")
                                    
                                    # Extract message content
                                    message_data = payload.get("message", {})
                                    if isinstance(message_data, dict):
                                        content_list = message_data.get("content", [])
                                        if content_list and len(content_list) > 0:
                                            text_content = content_list[0].get("text", "")
                                            if text_content:
                                                full_reply = text_content
                                                last_update_time = asyncio.get_event_loop().time()
                                                
                                                # Show progress
                                                reply_len = len(full_reply)
                                                if reply_len > 0:
                                                    self.logger.info(f"[AgentOracle] ✨ 收到更新 (已接收 {reply_len} 字符, state={state})")
                                    
                                    # Check if completed
                                    if state in ["final", "done", "complete", "finished"]:
                                        self.logger.info(f"[AgentOracle] ✅ 聊天完成 (state: {state})")
                                        chat_completed = True
                                        break
                        
                        except asyncio.TimeoutError:
                            # Check if no updates for a long time
                            time_since_update = asyncio.get_event_loop().time() - last_update_time
                            if time_since_update > self.message_timeout * 2:
                                if chat_completed or full_reply:
                                    self.logger.info("[AgentOracle] ✅ 长时间无更新，假定完成")
                                    break
                                else:
                                    self.logger.warning(f"[AgentOracle] ⏰ {self.message_timeout}秒内无消息...")
                                    continue
                            else:
                                continue
                    
                    if full_reply:
                        self.logger.info(f"[AgentOracle] ✅ 成功获取回复 ({len(full_reply)} 字符)")
                        return full_reply
                    else:
                        self.logger.warning("[AgentOracle] ⚠️  未收到回复内容")
                        if attempt < self.max_retries - 1:
                            continue  # Retry
                        return None
                        
            except asyncio.TimeoutError as e:
                self.logger.error(f"[AgentOracle] ⏰ 连接超时: {e}")
                if attempt < self.max_retries - 1:
                    continue  # Retry
                return None
                
            except websockets.exceptions.WebSocketException as e:
                self.logger.error(f"[AgentOracle] 🔌 WebSocket 错误: {e}")
                if attempt < self.max_retries - 1:
                    continue  # Retry
                return None
                
            except Exception as e:
                self.logger.error(f"[AgentOracle] 💥 意外错误: {e}")
                if attempt < self.max_retries - 1:
                    continue  # Retry
                import traceback
                traceback.print_exc()
                return None
        
        self.logger.error(f"[AgentOracle] ❌ 达到最大重试次数 ({self.max_retries})，任务失败")
        return None
    
    def send_message_sync(self, message: str) -> Optional[str]:
        """Synchronous wrapper for send_message.
        
        This method allows calling the async send_message from synchronous code.
        
        Args:
            message: Message text to send
            
        Returns:
            Agent's response text, or None if communication failed
        """
        try:
            # Create new event loop for this call
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(self.send_message(message))
            finally:
                loop.close()
        except Exception as e:
            self.logger.error(f"[AgentOracle] 同步调用失败: {e}", exc_info=True)
            return None
    
    async def test_connection(self) -> bool:
        """Test connection to OpenClaw Gateway.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.logger.info(f"[AgentOracle] 测试 WebSocket 连接: {self.gateway_url}")
            
            async with websockets.connect(
                self.gateway_url,
                ping_interval=30,
                ping_timeout=20,
                close_timeout=10
            ) as websocket:
                # Wait for challenge
                challenge_msg = await asyncio.wait_for(
                    websocket.recv(),
                    timeout=self.connect_timeout
                )
                challenge_data = json.loads(challenge_msg)
                
                if challenge_data.get("type") == "event" and challenge_data.get("event") == "connect.challenge":
                    self.logger.info("[AgentOracle] ✅ WebSocket 连接测试成功")
                    return True
                else:
                    self.logger.warning("[AgentOracle] ⚠️ 收到意外的消息类型")
                    return False
                    
        except Exception as e:
            self.logger.error(f"[AgentOracle] ❌ WebSocket 连接测试失败: {e}")
            return False
    
    def test_connection_sync(self) -> bool:
        """Synchronous wrapper for test_connection.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(self.test_connection())
            finally:
                loop.close()
        except Exception as e:
            self.logger.error(f"[AgentOracle] 连接测试失败: {e}", exc_info=True)
            return False
