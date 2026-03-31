# 本地 Agent 部署完整指南

## 概述

本指南将帮助你在本地部署一个可运行的 Agent，用于测试 AgentOracle 插件的完整流程。

我们支持三种主流的本地 Agent：
1. **Ollama** - 最简单，推荐新手使用
2. **LM Studio** - 图形界面友好，适合 Windows 用户
3. **OpenClaw** - 开源项目，功能强大（需要从源码编译）

---

## 方案 1: Ollama（推荐 ⭐）

### 优点
- ✅ 安装最简单（一键安装）
- ✅ 命令行操作方便
- ✅ 模型下载速度快
- ✅ 资源占用合理
- ✅ 跨平台支持好（Windows/Mac/Linux）

### 缺点
- ❌ 没有图形界面
- ❌ 需要使用命令行

---

### 步骤 1: 下载并安装 Ollama

#### Windows
1. 访问官网：https://ollama.com/download/windows
2. 下载 `OllamaSetup.exe`
3. 双击安装，按照提示完成安装
4. 安装完成后，Ollama 会自动启动并在后台运行

#### Mac
```bash
# 使用 Homebrew 安装
brew install ollama

# 或者下载安装包
# 访问：https://ollama.com/download/mac
```

#### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

---

### 步骤 2: 验证安装

打开命令行（Windows: PowerShell 或 CMD，Mac/Linux: Terminal）：

```bash
ollama --version
```

如果显示版本号，说明安装成功。

---

### 步骤 3: 下载模型

Ollama 支持多种模型，推荐使用以下模型之一：

#### 推荐模型（按性能和资源需求排序）

**1. Llama 3.2（推荐，平衡性能和速度）**
```bash
# 3B 参数版本（需要约 2GB 内存）
ollama pull llama3.2:3b

# 1B 参数版本（需要约 1GB 内存，最快）
ollama pull llama3.2:1b
```

**2. Llama 2（经典模型）**
```bash
# 7B 参数版本（需要约 4GB 内存）
ollama pull llama2:7b

# 13B 参数版本（需要约 8GB 内存，更强）
ollama pull llama2:13b
```

**3. Mistral（高性能）**
```bash
# 7B 参数版本（需要约 4GB 内存）
ollama pull mistral:7b
```

**4. Phi-3（微软出品，轻量级）**
```bash
# Mini 版本（需要约 2GB 内存）
ollama pull phi3:mini
```

下载时间取决于网络速度，通常需要 5-30 分钟。

---

### 步骤 4: 启动 Ollama 服务

#### Windows
Ollama 安装后会自动启动服务，默认监听 `http://127.0.0.1:11434`

检查服务是否运行：
```powershell
# 检查进程
Get-Process ollama

# 测试 API
curl http://127.0.0.1:11434/api/tags
```

如果服务没有运行，手动启动：
```powershell
ollama serve
```

#### Mac/Linux
```bash
# 启动服务（前台运行）
ollama serve

# 或者在后台运行
nohup ollama serve > ollama.log 2>&1 &
```

---

### 步骤 5: 测试模型

```bash
# 交互式测试（按 Ctrl+D 退出）
ollama run llama3.2:3b

# 单次测试
ollama run llama3.2:3b "What is the capital of France?"
```

如果模型能正常回答问题，说明部署成功！

---

### 步骤 6: 配置插件

编辑 `openclaw_agentoracle_plugin/config.json`：

```json
{
  "api_key": "your_agentoracle_api_key_here",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:11434",
  "agent_model": "llama3.2:3b",
  "agent_type": "ollama",
  "agent_executable": "ollama"
}
```

**重要参数说明**：
- `agent_api_url`: Ollama 默认地址（不要改）
- `agent_model`: 你下载的模型名称（必须与 `ollama pull` 的名称一致）
- `agent_type`: 设置为 `ollama`
- `agent_executable`: 设置为 `ollama`（用于冷启动）

---

### 步骤 7: 测试完整流程

```bash
cd openclaw_agentoracle_plugin

# 测试 Agent 连接
python -c "
import requests
response = requests.post('http://127.0.0.1:11434/api/generate', 
    json={'model': 'llama3.2:3b', 'prompt': 'Hello', 'stream': False})
print(response.json())
"

# 启动插件 GUI
python gui.py
```

---

## 方案 2: LM Studio（图形界面友好）

### 优点
- ✅ 图形界面友好
- ✅ 模型管理方便
- ✅ 支持多种模型格式（GGUF）
- ✅ 性能优化好

### 缺点
- ❌ 安装包较大（约 1GB）
- ❌ 仅支持 Windows 和 Mac

---

### 步骤 1: 下载并安装 LM Studio

1. 访问官网：https://lmstudio.ai/
2. 点击 "Download for Windows" 或 "Download for Mac"
3. 下载完成后，双击安装包安装
4. 启动 LM Studio

---

### 步骤 2: 下载模型

1. 在 LM Studio 主界面，点击左侧的 "🔍 Search" 图标
2. 搜索推荐模型：
   - `llama-3.2-3b-instruct` (推荐)
   - `mistral-7b-instruct`
   - `phi-3-mini`
3. 点击模型右侧的 "Download" 按钮
4. 等待下载完成（通常需要 5-30 分钟）

---

### 步骤 3: 加载模型

1. 下载完成后，点击左侧的 "💬 Chat" 图标
2. 在顶部的模型选择器中，选择你刚下载的模型
3. 点击 "Load Model" 按钮
4. 等待模型加载完成（通常需要 10-30 秒）

---

### 步骤 4: 启动本地服务器

1. 点击左侧的 "🔌 Local Server" 图标
2. 点击 "Start Server" 按钮
3. 默认端口是 `1234`，地址是 `http://127.0.0.1:1234`
4. 确保 "CORS" 选项已启用

---

### 步骤 5: 测试服务器

在浏览器中访问：
```
http://127.0.0.1:1234/v1/models
```

如果看到模型列表，说明服务器启动成功。

---

### 步骤 6: 配置插件

编辑 `openclaw_agentoracle_plugin/config.json`：

```json
{
  "api_key": "your_agentoracle_api_key_here",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:1234/v1",
  "agent_model": "llama-3.2-3b-instruct",
  "agent_type": "lmstudio",
  "agent_executable": ""
}
```

**重要参数说明**：
- `agent_api_url`: LM Studio 默认地址（注意有 `/v1` 后缀）
- `agent_model`: 你加载的模型名称（在 LM Studio 中查看）
- `agent_type`: 设置为 `lmstudio`
- `agent_executable`: 留空（LM Studio 需要手动启动）

---

### 步骤 7: 测试完整流程

```bash
cd openclaw_agentoracle_plugin

# 测试 Agent 连接
python -c "
import requests
response = requests.post('http://127.0.0.1:1234/v1/chat/completions', 
    json={'model': 'llama-3.2-3b-instruct', 'messages': [{'role': 'user', 'content': 'Hello'}]})
print(response.json())
"

# 启动插件 GUI
python gui.py
```

---

## 方案 3: OpenClaw（开源项目）

### 优点
- ✅ 完全开源
- ✅ 功能强大
- ✅ 可定制性高

### 缺点
- ❌ 需要从源码编译
- ❌ 安装复杂
- ❌ 文档较少

---

### 步骤 1: 安装依赖

#### Windows
```powershell
# 安装 Visual Studio 2022（需要 C++ 工具）
# 下载：https://visualstudio.microsoft.com/downloads/

# 安装 CMake
choco install cmake

# 安装 Git
choco install git
```

#### Mac
```bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 安装 CMake
brew install cmake
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install build-essential cmake git

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install cmake git
```

---

### 步骤 2: 克隆 OpenClaw 仓库

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
```

**注意**：如果 OpenClaw 仓库不存在或已更名，请搜索最新的 OpenClaw 项目地址。

---

### 步骤 3: 编译 OpenClaw

```bash
# 创建构建目录
mkdir build
cd build

# 配置 CMake
cmake ..

# 编译（需要 10-30 分钟）
cmake --build . --config Release

# 安装
sudo cmake --install .
```

---

### 步骤 4: 下载模型

OpenClaw 使用 GGUF 格式的模型，可以从 Hugging Face 下载：

```bash
# 创建模型目录
mkdir -p ~/.openclaw/models

# 下载 Llama 3.2 3B 模型（示例）
cd ~/.openclaw/models
wget https://huggingface.co/TheBloke/Llama-3.2-3B-GGUF/resolve/main/llama-3.2-3b.Q4_K_M.gguf
```

---

### 步骤 5: 启动 OpenClaw 服务

```bash
# 启动服务（前台运行）
openclaw serve \
  --model ~/.openclaw/models/llama-3.2-3b.Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 11434

# 或者在后台运行
nohup openclaw serve \
  --model ~/.openclaw/models/llama-3.2-3b.Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 11434 > openclaw.log 2>&1 &
```

---

### 步骤 6: 配置插件

编辑 `openclaw_agentoracle_plugin/config.json`：

```json
{
  "api_key": "your_agentoracle_api_key_here",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:11434",
  "agent_model": "llama-3.2-3b",
  "agent_type": "openclaw",
  "agent_executable": "openclaw"
}
```

---

### 步骤 7: 测试完整流程

```bash
cd openclaw_agentoracle_plugin

# 测试 Agent 连接
python -c "
import requests
response = requests.post('http://127.0.0.1:11434/api/generate', 
    json={'model': 'llama-3.2-3b', 'prompt': 'Hello', 'stream': False})
print(response.json())
"

# 启动插件 GUI
python gui.py
```

---

## 快速对比表

| 特性 | Ollama | LM Studio | OpenClaw |
|------|--------|-----------|----------|
| 安装难度 | ⭐ 简单 | ⭐⭐ 中等 | ⭐⭐⭐ 困难 |
| 图形界面 | ❌ 无 | ✅ 有 | ❌ 无 |
| 跨平台 | ✅ 全平台 | ⚠️ Win/Mac | ✅ 全平台 |
| 模型下载 | ⭐⭐⭐ 快 | ⭐⭐ 中等 | ⭐ 慢 |
| 资源占用 | ⭐⭐ 中等 | ⭐⭐⭐ 高 | ⭐ 低 |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 推荐配置

### 最小配置（测试用）
- **Agent**: Ollama
- **模型**: llama3.2:1b
- **内存**: 4GB
- **磁盘**: 2GB

### 推荐配置（日常使用）
- **Agent**: Ollama 或 LM Studio
- **模型**: llama3.2:3b 或 mistral:7b
- **内存**: 8GB
- **磁盘**: 5GB

### 高性能配置（专业使用）
- **Agent**: Ollama 或 LM Studio
- **模型**: llama2:13b 或 mistral:7b
- **内存**: 16GB+
- **磁盘**: 10GB+

---

## 常见问题

### Q1: Ollama 服务启动失败？
**A**: 检查端口是否被占用：
```bash
# Windows
netstat -ano | findstr :11434

# Mac/Linux
lsof -i :11434
```

如果端口被占用，杀死占用进程或更改端口。

---

### Q2: 模型下载速度慢？
**A**: 使用国内镜像或代理：
```bash
# 设置代理（示例）
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

# 然后下载模型
ollama pull llama3.2:3b
```

---

### Q3: 内存不足？
**A**: 使用更小的模型：
- `llama3.2:1b` (约 1GB 内存)
- `phi3:mini` (约 2GB 内存)

或者关闭其他应用程序释放内存。

---

### Q4: Agent 响应慢？
**A**: 
1. 使用更小的模型
2. 使用 GPU 加速（如果有 NVIDIA 显卡）
3. 减少 `max_tokens` 参数

---

### Q5: 插件无法连接 Agent？
**A**: 
1. 检查 Agent 服务是否运行
2. 检查 `agent_api_url` 配置是否正确
3. 检查防火墙是否阻止连接
4. 使用 `curl` 测试 API：
```bash
curl http://127.0.0.1:11434/api/tags
```

---

## 下一步

部署完成后，按照以下步骤测试完整流程：

1. **启动 Agent 服务**（Ollama/LM Studio/OpenClaw）
2. **配置插件**（编辑 `config.json`）
3. **启动插件 GUI**：
   ```bash
   cd openclaw_agentoracle_plugin
   python gui.py
   ```
4. **点击"启动"按钮**
5. **观察日志**，确认插件能正常：
   - 连接 Agent
   - 获取任务
   - 生成预测
   - 提交结果
6. **查看提交记录**，验证数据脱敏

---

## 总结

推荐使用 **Ollama + llama3.2:3b** 组合，这是最简单、最快速的部署方案。

如果你是 Windows 用户且喜欢图形界面，可以选择 **LM Studio**。

如果你需要完全开源和可定制的方案，可以选择 **OpenClaw**（但需要更多时间和技术能力）。

祝你部署顺利！🚀
