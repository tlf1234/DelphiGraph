#!/usr/bin/env python3
# OpenClaw Daily Elf Task Runner - WebSocket Client (Protocol v3)
# 生产级实现：自动重连、指数退避、完善的错误处理

import asyncio
import websockets
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

# 配置
GATEWAY_WS_URL = "ws://127.0.0.1:18789"
GATEWAY_TOKEN = "74c143f4fe51a9e4caa2f4325d8fe1a8f0e216bf59a3b434"
TIMEOUT = 300  # 5分钟超时，支持大文本传输
MAX_RETRIES = 3  # 最大重试次数
RETRY_DELAY_BASE = 2  # 重试延迟基数（秒）
CONNECT_TIMEOUT = 10  # 连接超时（秒）
MESSAGE_TIMEOUT = 20  # 单个消息超时（秒）

# 日志设置
PLUGIN_DIR = Path(__file__).parent.resolve()
LOGS_DIR = PLUGIN_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "elf-runner.log"
LOG_FILE.touch(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8", errors="replace"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("elf-runner")


async def send_message_to_openclaw(message: str) -> Optional[str]:
    """通过 WebSocket 发送消息到 OpenClaw Gateway (Protocol v3)
    
    包含自动重连和指数退避机制
    """
    for attempt in range(MAX_RETRIES):
        try:
            if attempt > 0:
                # 指数退避
                delay = RETRY_DELAY_BASE ** attempt
                logger.info(f"🔄 第 {attempt + 1}/{MAX_RETRIES} 次重试，等待 {delay} 秒...")
                await asyncio.sleep(delay)
            
            logger.info(f"🔌 连接到 {GATEWAY_WS_URL}...")
            
            async with websockets.connect(
                GATEWAY_WS_URL,
                ping_interval=30,  # 每30秒发送心跳
                ping_timeout=20,   # 20秒无响应则超时
                close_timeout=10   # 关闭超时
            ) as websocket:
                logger.info("✅ 已连接到 OpenClaw Gateway")
                
                # 步骤 1: 接收 connect.challenge
                logger.info("⏳ 等待 connect.challenge...")
                challenge_msg = await asyncio.wait_for(
                    websocket.recv(), 
                    timeout=CONNECT_TIMEOUT
                )
                challenge_data = json.loads(challenge_msg)
                logger.info(f"📨 收到 challenge")
                
                if challenge_data.get("type") != "event" or challenge_data.get("event") != "connect.challenge":
                    raise Exception(f"意外的消息类型: {challenge_data.get('type')}")
                
                nonce = challenge_data.get("payload", {}).get("nonce")
                if not nonce:
                    raise Exception("Challenge 中没有 nonce")
                
                # 步骤 2: 发送 connect 请求
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
                        "auth": {
                            "token": GATEWAY_TOKEN
                        },
                        "locale": "zh-CN",
                        "userAgent": "daily-elf-runner/1.0.0"
                    }
                }
                
                logger.info("📤 发送 connect 请求...")
                await websocket.send(json.dumps(connect_request))
                
                # 步骤 3: 接收 connect 响应
                logger.info("⏳ 等待 connect 响应...")
                connect_response_msg = await asyncio.wait_for(
                    websocket.recv(), 
                    timeout=CONNECT_TIMEOUT
                )
                connect_response = json.loads(connect_response_msg)
                
                if connect_response.get("type") != "res" or not connect_response.get("ok"):
                    error = connect_response.get("error", "未知错误")
                    raise Exception(f"连接失败: {error}")
                
                logger.info("✅ 连接成功！")
                
                # 步骤 4: 发送聊天消息
                session_key = connect_response.get("payload", {}).get("snapshot", {}).get("sessionDefaults", {}).get("mainSessionKey", "agent:main:main")
                
                chat_id = str(uuid.uuid4())
                chat_request = {
                    "type": "req",
                    "id": chat_id,
                    "method": "chat.send",
                    "params": {
                        "sessionKey": session_key,
                        "message": message,
                        "idempotencyKey": f"elf-{datetime.now().timestamp()}"
                    }
                }
                
                logger.info(f"📤 发送聊天消息...")
                await websocket.send(json.dumps(chat_request))
                
                # 步骤 5: 接收响应
                logger.info("⏳ 等待 AI 响应...")
                full_reply = ""
                start_time = asyncio.get_event_loop().time()
                chat_completed = False
                last_update_time = start_time
                
                while True:
                    elapsed = asyncio.get_event_loop().time() - start_time
                    if elapsed > TIMEOUT:
                        logger.error(f"⏰ 总超时 ({TIMEOUT}秒)")
                        raise Exception(f"任务超时 ({TIMEOUT}秒)")
                    
                    try:
                        response_msg = await asyncio.wait_for(
                            websocket.recv(), 
                            timeout=MESSAGE_TIMEOUT
                        )
                        response = json.loads(response_msg)
                        msg_type = response.get('type', 'unknown')
                        
                        if msg_type == "res":
                            # 响应消息
                            if response.get("id") == chat_id:
                                if response.get("ok"):
                                    logger.info("✅ 聊天请求已接受")
                                else:
                                    error = response.get("error", "未知错误")
                                    raise Exception(f"聊天错误: {error}")
                        
                        elif msg_type == "event":
                            # 事件消息
                            event = response.get("event", "unknown")
                            
                            if event == "chat":
                                payload = response.get("payload", {})
                                state = payload.get("state", "")
                                
                                # 提取消息内容
                                message_data = payload.get("message", {})
                                if isinstance(message_data, dict):
                                    content_list = message_data.get("content", [])
                                    if content_list and len(content_list) > 0:
                                        text_content = content_list[0].get("text", "")
                                        if text_content:
                                            full_reply = text_content
                                            last_update_time = asyncio.get_event_loop().time()
                                            
                                            # 显示进度
                                            reply_len = len(full_reply)
                                            if reply_len > 0:
                                                logger.info(f"✨ 收到更新 (已接收 {reply_len} 字符, state={state})")
                                
                                # 检查是否完成
                                if state in ["final", "done", "complete", "finished"]:
                                    logger.info(f"✅ 聊天完成 (state: {state})")
                                    chat_completed = True
                                    break
                    
                    except asyncio.TimeoutError:
                        # 检查是否长时间没有更新
                        time_since_update = asyncio.get_event_loop().time() - last_update_time
                        if time_since_update > MESSAGE_TIMEOUT * 2:
                            if chat_completed or full_reply:
                                logger.info("✅ 长时间无更新，假定完成")
                                break
                            else:
                                logger.warning(f"⏰ {MESSAGE_TIMEOUT}秒内无消息...")
                                continue
                        else:
                            continue
                
                if full_reply:
                    logger.info(f"✅ 成功获取回复 ({len(full_reply)} 字符)")
                    return full_reply
                else:
                    logger.warning("⚠️  未收到回复内容")
                    if attempt < MAX_RETRIES - 1:
                        continue  # 重试
                    return None
                    
        except asyncio.TimeoutError as e:
            logger.error(f"⏰ 连接超时: {e}")
            if attempt < MAX_RETRIES - 1:
                continue  # 重试
            return None
            
        except websockets.exceptions.WebSocketException as e:
            logger.error(f"🔌 WebSocket 错误: {e}")
            if attempt < MAX_RETRIES - 1:
                continue  # 重试
            return None
            
        except Exception as e:
            logger.error(f"💥 意外错误: {e}")
            if attempt < MAX_RETRIES - 1:
                continue  # 重试
            import traceback
            traceback.print_exc()
            return None
    
    logger.error(f"❌ 达到最大重试次数 ({MAX_RETRIES})，任务失败")
    return None


def create_analysis_task(task_description: str):
    """创建分析任务消息
    
    让 OpenClaw Agent 自己使用它的所有工具和能力来获取信息
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    message = f"""【智能分析任务】{now}

你是一位资深的信号分析专家。请充分利用你的所有工具和能力来完成以下分析任务。

## 任务描述
{task_description}

## 信息收集要求（请使用你的所有工具）

### 1. 本地信息获取
- 自行查找创建的所有建立的记忆相关文件或者内容
- 使用**记忆检索工具**查找所有相关的历史记忆和交互记录
- 检索与任务相关的本地知识库、文档、笔记
- 查找历史对话中的相关讨论和结论

### 2. 用户画像分析
- 分析用户的历史行为模式和偏好
- 总结用户的专业领域和兴趣方向
- 识别用户的决策风格和关注重点

### 3. 互联网信息检索
- 使用**网络搜索工具**查找最新的行业动态和趋势
- 搜索相关的新闻、报告、研究成果
- 获取市场数据、统计信息、专家观点

### 4. 历史数据分析
- 检索相关的历史数据和时间序列信息
- 分析过去的趋势和模式
- 识别周期性规律和异常事件

### 5. 综合信息整合
- 整合所有来源的信息（本地记忆 + 用户画像 + 公网信息 + 历史数据）
- 交叉验证不同来源的信息
- 识别信息的可靠性和时效性

## 分析要求

1. **数据收集**: 使用你的所有工具全面收集相关信息
2. **趋势分析**: 基于收集的信息识别关键趋势和模式
3. **风险评估**: 评估潜在风险、不确定性和机会
4. **预测结论**: 给出明确的预测结论和置信度（基于信息质量和数量）
5. **行动建议**: 提供可执行的、个性化的行动建议

## 输出格式

请按以下结构输出你的分析：

### 📋 信息来源总结
- 本地记忆：[列出使用的记忆和知识]
- 用户画像：[总结相关的用户特征]
- 公网信息：[列出搜索到的关键信息来源]
- 历史数据：[说明使用的历史数据]

### 📊 数据分析
[基于收集的信息进行深度分析]

### 📈 趋势判断
[识别的关键趋势和模式]

### ⚠️ 风险因素
[潜在风险和不确定性]

### 🎯 预测结论
[明确的预测结论，包含置信度百分比和依据]

### 💡 行动建议
[可执行的、个性化的行动建议]

---

## 结构化预测 JSON（必须）

在分析完成后，你**必须**在回复末尾输出一个 JSON 代码块，格式如下：

```json
{{
  "probability": 0.75,
  "rationale": "简要总结你的预测理由（1-3句话）",
  "evidence_type": "hard_fact",
  "evidence_text": "支持预测的关键证据摘要",
  "relevance_score": 0.8,
  "source_urls": ["https://example.com/source1"],
  "entity_tags": [{{"text": "关键实体", "type": "topic", "role": "subject"}}]
}}
```

字段说明：
- **probability**: 0.0-1.0 之间的概率值，表示预测为"是/正面"的可能性
- **rationale**: 预测理由的简要总结
- **evidence_type**: "hard_fact"（硬事实）、"soft_signal"（软信号）或 "personal_opinion"（个人观点）
- **evidence_text**: 关键证据的简要描述（可选）
- **relevance_score**: 0.0-1.0 之间的相关性评分
- **source_urls**: 信息来源 URL 列表（可选）
- **entity_tags**: 关键实体标签数组（可选）

**重要提示**: 
1. 请充分使用你的所有工具和能力，不要局限于已有知识。主动搜索、检索、分析，提供最全面和准确的预测。
2. **必须**在回复末尾输出上述 JSON 代码块，这是提交预测到平台所必需的。

请开始你的专业分析。"""
    
    return message


async def main():
    # 示例预测任务
    task_description = """
预测任务：AI 代理市场在未来 3 个月的发展趋势

背景信息：
- 当前 AgentOracle 平台已部署，具备预测任务功能
- OpenClaw 本地 AI 助手已集成 WebSocket 通信
- 市场上 AI Agent 工具快速增长

请分析：
1. AI 代理市场的增长潜力
2. 用户采用率的可能变化
3. 技术瓶颈和突破点
4. 竞争格局的演变
5. 投资价值评估
"""
    
    # 创建预测任务消息
    message = create_analysis_task(task_description)
    
    logger.info(f"🚀 Sending analysis task...")
    result = await send_message_to_openclaw(message)
    
    if result:
        logger.info(f"✨ Analysis completed successfully")
        logger.info(f"📝 Analysis Result:\n{result}")
        
        # 保存预测结果到本地
        reports_dir = PLUGIN_DIR / "reports"
        reports_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        result_file = reports_dir / f"analysis_{timestamp}.md"
        
        with open(result_file, "w", encoding="utf-8") as f:
            f.write(f"# 预测分析报告\n\n")
            f.write(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"## 任务描述\n{task_description}\n\n")
            f.write(f"## 分析结果\n{result}\n")
        
        logger.info(f"💾 Analysis saved to: {result_file}")
    else:
        logger.error("❌ Analysis task failed")


if __name__ == "__main__":
    asyncio.run(main())
