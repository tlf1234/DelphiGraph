# AgentOracle 插件任务执行流程详解

## 概述

本文档详细说明 OpenClaw AgentOracle 插件从接收任务到完成任务的完整代码执行流程。

---

## 完整执行流程图

```
启动插件 (main)
    ↓
初始化配置 (PluginManager.initialize)
    ↓
验证 API Key (BackgroundDaemon._validate_api_key)
    ↓
启动后台守护进程 (BackgroundDaemon.start)
    ↓
进入轮询循环 (BackgroundDaemon.run)
    ↓
获取任务 (AgentOracleClient.fetch_task)
    ↓
处理任务 (BackgroundDaemon.process_task)
    ├─ 执行推理 (BackgroundDaemon.execute_inference)
    ├─ 收集遥测数据 (TelemetryCollector.collect_all)
    ├─ 验证字符串长度 (StringLengthValidator.validate_prediction_strings)
    ├─ 清理敏感信息 (Sanitizer.sanitize_prediction)
    └─ 提交结果 (AgentOracleClient.submit_result)
    ↓
等待下次轮询 (随机间隔 150-210 秒)
    ↓
循环继续...
```

---

## 详细代码流程

### 阶段 1: 插件启动

**文件**: `skill.py` - `main()` 函数

```python
def main() -> None:
    # 1. 创建插件管理器
    manager = PluginManager()
    
    # 2. 注册清理处理器（优雅关闭）
    atexit.register(cleanup)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 3. 初始化配置
    manager.initialize()
    
    # 4. 启动后台守护进程
    manager.start()
    
    # 5. 保持主线程运行
    while True:
        time.sleep(1)
```

**日志输出**:
```
[AgentOracle] 插件正在运行。按 Ctrl+C 停止。
```

---

### 阶段 2: 配置初始化

**文件**: `skill.py` - `PluginManager.initialize()`

```python
def initialize(self) -> None:
    try:
        # 1. 尝试加载现有配置文件
        self.config = self.load_config()
        
        # 2. 验证 API Key 格式
        api_key = self.config.get('api_key')
        if not api_key or not self.validate_api_key(api_key):
            # 如果无效，提示用户输入
            api_key = self.prompt_for_api_key()
            self.config['api_key'] = api_key
            self.save_config(self.config)
        
    except FileNotFoundError:
        # 3. 配置文件不存在，创建新配置
        api_key = self.prompt_for_api_key()
        self.config = {
            'api_key': api_key,
            'base_url': 'http://localhost:3000',
            'poll_interval': 180,
            'vector_db_path': '~/.openclaw/vector_db',
            'conversation_log_path': '~/.openclaw/conversations.log'
        }
        self.save_config(self.config)
```

**日志输出**:
```
[AgentOracle] 从 config.json 加载配置
[AgentOracle] 配置加载并验证成功
```

或（首次运行）:
```
[AgentOracle] 未找到配置文件，创建新配置
[AgentOracle] 请输入您的 API_KEY: _
[AgentOracle] API_KEY 验证成功
[AgentOracle] 配置创建成功
```

---

### 阶段 3: API Key 验证

**文件**: `skill.py` - `BackgroundDaemon._validate_api_key()`

```python
def _validate_api_key(self) -> None:
    # 1. 向服务器发送测试请求
    status_code, response_data = self.api_client._make_request("GET", "/get-tasks")
    
    # 2. 检查响应状态码
    if status_code == 200 or status_code == 204:
        # API Key 有效
        return
    elif status_code == 401:
        # 认证失败
        raise Exception("认证失败: 无效的 API Key")
    elif status_code == 403:
        # 账户受限（涅槃模式）
        self.logger.warning("账户受限（涅槃模式）")
        return
    else:
        # 其他错误
        raise Exception(f"API 验证失败: 状态码 {status_code}")
```

**日志输出**:
```
[AgentOracle] 正在验证 API key...
[AgentOracle] ✅ API key 验证成功
```

---

### 阶段 4: 启动后台守护进程

**文件**: `skill.py` - `BackgroundDaemon.start()`

```python
def start(self) -> None:
    # 1. 检查是否已经运行
    if self.running:
        return
    
    # 2. 验证 API Key
    self._validate_api_key()
    
    # 3. 设置运行标志
    self.running = True
    
    # 4. 创建后台线程
    self.thread = threading.Thread(target=self.run, daemon=True)
    
    # 5. 启动线程
    self.thread.start()
```

**日志输出**:
```
[AgentOracle] 后台守护进程已启动
[AgentOracle] 插件已启动
```

---

### 阶段 5: 轮询循环

**文件**: `skill.py` - `BackgroundDaemon.run()`

```python
def run(self) -> None:
    while self.running:
        try:
            # 1. 检查内存使用
            self.memory_monitor.check_memory_limit()
            
            # 2. 获取任务
            task = self.api_client.fetch_task()
            
            # 3. 如果有任务，处理它
            if task is not None:
                self.process_task(task)
                self.error_count = 0
            
        except Exception as e:
            self.logger.error(f"轮询循环错误: {e}")
            self.error_count += 1
        
        # 4. 计算下次轮询间隔（随机 150-210 秒）
        interval = self._calculate_next_interval()
        
        # 5. 等待
        self.stop_event.wait(interval)
```

**日志输出**:
```
[AgentOracle] 正在检查新任务...
```

---

### 阶段 6: 获取任务

**文件**: `api_client.py` - `AgentOracleClient.fetch_task()`

```python
def fetch_task(self) -> Optional[Dict[str, Any]]:
    # 1. 发送 GET 请求到 /get-tasks
    status_code, response_data = self._make_request("GET", "/get-tasks")
    
    # 2. 处理响应
    if status_code == 200:
        # 提取任务数组
        tasks = response_data.get('tasks', [])
        
        # 验证并返回第一个有效任务
        for task in tasks:
            if self.validate_task(task):
                return task
        
        return None
    
    elif status_code == 204:
        # 没有可用任务
        return None
    
    elif status_code == 401:
        # 认证失败
        raise AuthenticationError("无效的 API Key")
    
    else:
        # 其他错误
        raise NetworkError(f"意外的状态码 {status_code}")
```

**日志输出**:
```
[AgentOracle] 获取到任务: ec2228fc-8c3d-4e99-9ab6-473da0e11979
```

或:
```
[AgentOracle] 没有可用任务（任务数组为空）
```

---

### 阶段 7: 处理任务

**文件**: `skill.py` - `BackgroundDaemon.process_task()`

```python
def process_task(self, task: Dict[str, Any]) -> None:
    # 1. 提取任务信息
    task_id = task.get('id')
    title = task.get('title', 'N/A')
    question = task.get('question')
    keywords = task.get('required_niche_tags', [])
    reward_pool = task.get('reward_pool', 0)
    closes_at = task.get('closes_at', 'N/A')
    
    # 2. 记录任务详情
    self.logger.info("========================================")
    self.logger.info("📋 收到任务:")
    self.logger.info(f"  - 任务 ID: {task_id}")
    self.logger.info(f"  - 标题: {title}")
    self.logger.info(f"  - 问题: {question}")
    self.logger.info(f"  - 关键词: {keywords}")
    self.logger.info(f"  - 奖励池: ${reward_pool}")
    self.logger.info(f"  - 截止时间: {closes_at}")
    self.logger.info("========================================")
    
    # 3. 开始计时
    self.telemetry_collector.start_timing()
    
    # 4. 执行推理
    prediction_data = self.execute_inference(question, keywords)
    
    # 5. 停止计时
    self.telemetry_collector.stop_timing()
    
    # 6. 检查推理是否成功
    if prediction_data is None:
        self.logger.error("❌ 推理失败，跳过任务提交")
        return
    
    # 7. 记录推理结果
    self.logger.info("========================================")
    self.logger.info("✅ 推理完成:")
    self.logger.info(f"  - 预测: {prediction_data.get('prediction')[:100]}...")
    self.logger.info(f"  - 置信度: {prediction_data.get('confidence'):.2f}")
    self.logger.info(f"  - 推理过程: {prediction_data.get('reasoning')[:100]}...")
    self.logger.info("========================================")
    
    # 8. 验证字符串长度
    if not self.string_validator.validate_prediction_strings(prediction_data):
        self.logger.error("预测数据未通过字符串长度验证，跳过任务提交")
        return
    
    # 9. 收集遥测数据
    telemetry_data = self.telemetry_collector.collect_all()
    
    # 10. 清理敏感信息
    sanitized_prediction = self.sanitizer.sanitize_prediction(prediction_data)
    
    # 11. 构建提交载荷
    payload = {
        "task_id": task_id,
        "api_key": self.api_key,
        "prediction_data": sanitized_prediction,
        "telemetry_data": telemetry_data
    }
    
    self.logger.info("========================================")
    self.logger.info("📤 正在提交预测:")
    self.logger.info(f"  - 任务 ID: {task_id}")
    self.logger.info(f"  - 遥测指标: {len(telemetry_data)} 项")
    self.logger.info("========================================")
    
    # 12. 提交结果
    success = self.api_client.submit_result(payload)
    
    if success:
        self.logger.info("========================================")
        self.logger.info("✅ 提交成功!")
        self.logger.info("  - 元数据健康已验证")
        self.logger.info("========================================")
    else:
        self.logger.error("========================================")
        self.logger.error("❌ 提交失败")
        self.logger.error("========================================")
```

**日志输出**:
```
========================================
📋 收到任务:
  - 任务 ID: ec2228fc-8c3d-4e99-9ab6-473da0e11979
  - 标题: ChatGPT会破产吗？
  - 问题: ChatGPT会破产吗？
  - 关键词: ['healthcare', 'finance', 'tech']
  - 奖励池: $100
  - 截止时间: 2026-02-23T00:00:00+00:00
========================================
🤔 开始推理...
========================================
✅ 推理完成:
  - 预测: This is a placeholder prediction...
  - 置信度: 0.75
  - 推理过程: This reasoning will be generated...
========================================
========================================
📤 正在提交预测:
  - 任务 ID: ec2228fc-8c3d-4e99-9ab6-473da0e11979
  - 遥测指标: 3 项
========================================
========================================
✅ 提交成功!
  - 元数据健康已验证
========================================
```

---

### 阶段 8: 执行推理

**文件**: `skill.py` - `BackgroundDaemon.execute_inference()`

```python
def execute_inference(self, question: str, keywords: list) -> Optional[Dict[str, Any]]:
    # 1. 记录开始推理
    self.logger.info("正在分析任务...")
    
    # 2. 验证输入
    if not question or not isinstance(question, str):
        self.logger.error("任务中的问题字段无效")
        return None
    
    # 3. 创建 LLM 提示
    keywords_str = ", ".join(keywords) if keywords else "无"
    prompt = f"问题: {question}\n关键词: {keywords_str}\n\n请提供预测、置信度和推理过程。"
    
    self.logger.info(f"为 LLM 准备提示（问题长度: {len(question)}, 关键词: {len(keywords)}）")
    
    # 4. 调用 LLM（当前为模拟响应）
    # TODO: 替换为实际的 OpenClaw LLM 集成
    mock_response = {
        "prediction": "这是一个占位符预测，将被实际的 LLM 输出替换",
        "confidence": 0.75,
        "reasoning": "此推理将由本地 LLM 根据提供的问题和关键词生成"
    }
    
    # 5. 解析响应
    prediction = mock_response.get("prediction", "")
    confidence = mock_response.get("confidence", 0.5)
    reasoning = mock_response.get("reasoning", "")
    
    # 6. 验证置信度范围
    if confidence < 0.0 or confidence > 1.0:
        self.logger.error(f"置信度 {confidence} 超出范围 [0.0, 1.0]")
        return None
    
    self.logger.info(f"推理成功完成（置信度: {confidence}）")
    
    # 7. 返回结构化预测数据
    return {
        "prediction": prediction,
        "confidence": float(confidence),
        "reasoning": reasoning
    }
```

**日志输出**:
```
[AgentOracle] 正在分析任务...
[AgentOracle] 为 LLM 准备提示（问题长度: 12, 关键词: 3）
[AgentOracle] 推理成功完成（置信度: 0.75）
```

---

### 阶段 9: 收集遥测数据

**文件**: `telemetry.py` - `TelemetryCollector.collect_all()`

```python
def collect_all(self) -> Dict[str, Any]:
    self.logger.info("正在收集所有遥测数据")
    
    # 1. 收集向量数据库熵
    memory_entropy = self.collect_memory_entropy()
    
    # 2. 收集交互心跳
    interaction_heartbeat = self.collect_interaction_heartbeat()
    
    # 3. 获取推理延迟
    inference_latency_ms = self.get_inference_latency_ms()
    
    self.logger.info(f"遥测收集完成: {3} 个指标")
    
    return {
        "memory_entropy": memory_entropy,
        "interaction_heartbeat": interaction_heartbeat,
        "inference_latency_ms": inference_latency_ms
    }
```

**日志输出**:
```
[AgentOracle] 正在收集所有遥测数据
[AgentOracle] 未配置向量数据库路径，返回零遥测
[AgentOracle] 未配置对话日志路径，返回零遥测
[AgentOracle] 遥测收集完成: 3 个指标
```

---

### 阶段 10: 提交结果

**文件**: `api_client.py` - `AgentOracleClient.submit_result()`

```python
def submit_result(self, payload: Dict[str, Any]) -> bool:
    # 1. 发送 POST 请求到 /submit-prediction
    status_code, response_data = self._make_request("POST", "/submit-prediction", data=payload)
    
    # 2. 处理响应
    if status_code == 200:
        # 成功
        self.logger.info("提交成功，元数据健康已验证")
        return True
    
    elif status_code == 400:
        # 验证错误
        error_msg = response_data.get("message", "验证失败")
        self.logger.error(f"验证错误: {error_msg}")
        raise ValidationError(error_msg)
    
    else:
        # 其他错误
        error_msg = f"提交失败，状态码 {status_code}"
        self.logger.error(error_msg)
        return False
```

**日志输出**:
```
[AgentOracle] 提交成功，元数据健康已验证
```

---

## 关键组件说明

### 1. PluginManager
- 负责插件生命周期管理
- 加载和保存配置
- 启动和停止后台守护进程

### 2. BackgroundDaemon
- 后台轮询引擎
- 定期获取和处理任务
- 管理推理和提交流程

### 3. AgentOracleClient
- HTTP 客户端
- 处理与 AgentOracle 后端的通信
- 任务获取和结果提交

### 4. TelemetryCollector
- 收集行为遥测数据
- 测量推理延迟
- 收集向量数据库和对话日志统计

### 5. Sanitizer
- 清理预测数据中的敏感信息（PII）
- 移除电子邮件、电话号码等

### 6. StringLengthValidator
- 验证字符串长度限制
- 防止资源耗尽攻击

---

## 错误处理

### 网络错误
- 自动重试（最多 3 次）
- 指数退避策略
- 详细错误日志

### 认证错误
- 立即失败并报告
- 提示用户检查 API Key

### 验证错误
- 记录详细错误信息
- 跳过当前任务
- 继续处理下一个任务

### 内存限制
- 监控内存使用（500MB 限制）
- 超限时记录警告
- 防止内存泄漏

---

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `api_key` | 必需 | AgentOracle API 密钥 |
| `base_url` | 必需 | API 基础 URL |
| `poll_interval` | 180 秒 | 轮询间隔（实际为 150-210 秒随机） |
| `vector_db_path` | `~/.openclaw/vector_db` | 向量数据库路径 |
| `conversation_log_path` | `~/.openclaw/conversations.log` | 对话日志路径 |

---

## 性能优化

1. **连接池**: 使用 HTTP 连接池减少连接开销
2. **速率限制**: 10 请求/60 秒，防止 API 滥用
3. **随机抖动**: 轮询间隔随机化，避免请求风暴
4. **内存监控**: 500MB 限制，防止内存泄漏
5. **优雅关闭**: 信号处理器确保清理资源

---

## 安全特性

1. **HTTPS 强制**: 除 localhost 外强制使用 HTTPS
2. **API Key 保护**: 配置文件权限 0600
3. **PII 清理**: 自动移除敏感信息
4. **字符串验证**: 防止注入攻击和资源耗尽
5. **速率限制**: 防止 API 滥用

---

## 日志级别

- **INFO**: 正常操作流程
- **WARNING**: 非致命问题（如账户受限）
- **ERROR**: 错误情况（如推理失败、提交失败）

所有日志都包含时间戳和模块标识符 `[AgentOracle]`。
