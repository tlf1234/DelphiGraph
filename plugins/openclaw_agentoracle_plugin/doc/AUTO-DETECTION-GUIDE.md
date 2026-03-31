# 自动环境探测功能指南

## 概述

AgentOracle 插件现在支持**零配置**体验！插件会自动探测你电脑上正在运行的本地 LLM 服务，并智能选择最合适的模型。

用户只需要：
1. ✅ 输入 API Key
2. ✅ 启动本地 LLM 服务（Ollama / LM Studio / OpenClaw）
3. ✅ 完成！插件自动配置

## 支持的服务

### 1. Ollama
- **默认端口**: `http://127.0.0.1:11434`
- **探测端点**: `/api/tags`
- **API 格式**: Ollama 原生格式
- **推荐模型**: llama3, qwen2.5, mistral

### 2. LM Studio
- **默认端口**: `http://127.0.0.1:1234`
- **探测端点**: `/v1/models`
- **API 格式**: OpenAI 兼容
- **推荐模型**: 任何已加载的模型

### 3. OpenClaw
- **默认端口**: `http://127.0.0.1:18789`
- **探测端点**: `/v1/models`
- **API 格式**: OpenAI 兼容
- **推荐模型**: openclaw:main

## 工作原理

### 1. 自动探测流程

```
启动插件
    ↓
输入 API Key
    ↓
自动探测本地服务 (2秒超时)
    ↓
┌─────────────────────────────┐
│ 尝试连接 Ollama (11434)     │
│ 尝试连接 LM Studio (1234)   │
│ 尝试连接 OpenClaw (18789)   │
└─────────────────────────────┘
    ↓
获取可用模型列表
    ↓
智能选择最佳模型
    ↓
自动生成配置文件
    ↓
完成！开始工作
```

### 2. 智能模型选择算法

插件会按照以下优先级选择模型：

#### Tier 1（最高优先级）- 指令遵循能力最强
- ✅ `llama3` 系列
- ✅ `qwen2.5` 系列
- ✅ `qwen2` 系列
- ✅ `mistral` 系列
- ✅ `claude` 系列

#### Tier 2（次优先级）- 良好的指令遵循能力
- ✅ `llama2` 系列
- ✅ `gemma` 系列
- ✅ `mixtral` 系列

#### 降级策略
如果以上模型都没找到，默认选择列表中的第一个模型。

### 3. 探测示例

#### 成功探测 Ollama
```
🔍 开始自动探测本地 LLM 服务...

✅ 检测到 Ollama 服务
📦 发现 3 个可用模型
🎯 自动选择: llama3:8b

配置已自动生成:
  • API 地址: http://127.0.0.1:11434
  • 模型: llama3:8b
  • 服务类型: ollama
```

#### 未检测到服务
```
🔍 开始自动探测本地 LLM 服务...

============================================================
⚠️  未检测到本地大模型服务
============================================================
请确保以下服务之一正在运行：
  • Ollama (http://127.0.0.1:11434)
  • LM Studio (http://127.0.0.1:1234)
  • OpenClaw (http://127.0.0.1:18789)
============================================================
```

## 使用方法

### 方法 1：首次启动（推荐）

1. 启动本地 LLM 服务（例如 Ollama）
   ```bash
   ollama serve
   ```

2. 运行插件
   ```bash
   python skill.py
   ```

3. 输入 API Key
   ```
   [AgentOracle] Please enter your API_KEY: your-api-key-here
   ```

4. 插件自动探测并配置
   ```
   ✅ 检测到 Ollama 服务
   🎯 自动选择: llama3:8b
   配置创建成功
   ```

### 方法 2：测试探测功能

运行测试脚本查看探测结果：

```bash
cd openclaw_agentoracle_plugin
python test_env_detector.py
```

输出示例：
```
======================================================================
AgentOracle 环境自动探测测试
======================================================================

【测试 1】快速探测
----------------------------------------------------------------------

✅ 检测到 Ollama 服务
📦 发现 3 个可用模型
🎯 自动选择: llama3:8b

✅ 探测成功!
   服务提供商: Ollama
   API 地址: http://127.0.0.1:11434
   选择的模型: llama3:8b
   所有可用模型 (3 个):
      👉 1. llama3:8b
         2. qwen2:7b
         3. mistral:latest

======================================================================
```

### 方法 3：在代码中使用

```python
from env_detector import auto_detect_environment

# 快速探测
result = auto_detect_environment()

if result.is_ready:
    print(f"服务: {result.provider}")
    print(f"API: {result.api_base_url}")
    print(f"模型: {result.selected_model}")
else:
    print("未检测到服务")
```

## 配置文件格式

自动探测成功后，会生成如下配置：

### Ollama 配置示例
```json
{
  "api_key": "your-api-key",
  "base_url": "http://localhost:3000",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:11434",
  "agent_model": "llama3:8b",
  "agent_token": null,
  "agent_type": "ollama",
  "agent_executable": null
}
```

### LM Studio 配置示例
```json
{
  "api_key": "your-api-key",
  "base_url": "http://localhost:3000",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:1234",
  "agent_model": "llama-3-8b-instruct",
  "agent_token": null,
  "agent_type": "lmstudio",
  "agent_executable": null
}
```

### OpenClaw 配置示例
```json
{
  "api_key": "your-api-key",
  "base_url": "http://localhost:3000",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:18789",
  "agent_model": "openclaw:main",
  "agent_token": null,
  "agent_type": "openclaw",
  "agent_executable": "openclaw"
}
```

## 手动配置（备选方案）

如果自动探测失败，插件会询问是否手动配置 OpenClaw：

```
⚠️ 未检测到本地大模型服务

========================================
OpenClaw 配置（可选）
如果您使用 OpenClaw Gateway 认证，请输入 Agent Token
如果不使用 OpenClaw 或无需认证，直接回车跳过
========================================

请输入 Agent Token（可选）: 
```

- 输入 Token → 配置 OpenClaw
- 直接回车 → 使用 Ollama 默认配置

## 技术细节

### 探测超时
- **默认超时**: 2 秒
- **可配置**: 通过 `EnvironmentDetector(timeout=3)` 自定义

### API 格式解析

#### Ollama 格式
```json
{
  "models": [
    {"name": "llama3:8b"},
    {"name": "qwen2:7b"}
  ]
}
```

#### OpenAI 兼容格式
```json
{
  "data": [
    {"id": "llama-3-8b-instruct"},
    {"id": "mistral-7b-instruct"}
  ]
}
```

### 错误处理

插件会优雅处理以下情况：
- ✅ 连接超时 (2秒)
- ✅ 服务未运行
- ✅ 无可用模型
- ✅ API 格式错误
- ✅ 网络异常

## 常见问题

### Q1: 为什么探测失败？
**A**: 确保本地 LLM 服务正在运行：
```bash
# Ollama
ollama serve

# LM Studio
# 在 LM Studio GUI 中启动服务器

# OpenClaw
openclaw serve
```

### Q2: 如何更改选择的模型？
**A**: 两种方式：
1. 删除 `config.json`，重新运行插件自动探测
2. 手动编辑 `config.json` 中的 `agent_model` 字段

### Q3: 支持自定义端口吗？
**A**: 当前版本探测固定端口。如果使用自定义端口，请手动编辑 `config.json`。

### Q4: 探测会影响启动速度吗？
**A**: 不会。探测超时仅 2 秒，且只在首次配置时运行。

### Q5: 可以同时运行多个服务吗？
**A**: 可以，但插件会按优先级选择第一个检测到的服务（Ollama → LM Studio → OpenClaw）。

## 优势总结

### 用户体验
- ✅ **零配置**: 只需输入 API Key
- ✅ **智能选择**: 自动选择最佳模型
- ✅ **快速启动**: 2 秒内完成探测
- ✅ **友好提示**: 清晰的中文提示信息

### 技术优势
- ✅ **健壮性**: 完善的错误处理
- ✅ **兼容性**: 支持多种 LLM 服务
- ✅ **可扩展**: 易于添加新服务支持
- ✅ **可测试**: 独立的测试脚本

## 下一步

1. 启动你的本地 LLM 服务
2. 运行 `python test_env_detector.py` 测试探测
3. 运行 `python skill.py` 开始使用插件

享受零配置的便捷体验！🚀
