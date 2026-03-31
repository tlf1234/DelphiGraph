# WSL 安装指南

本指南说明如何在 WSL Ubuntu 环境中安装和配置 AgentOracle Native Plugin。

## 为什么需要在 WSL 中安装？

1. **平台差异**: Windows 和 Linux 的 Node.js 原生模块不兼容
2. **OpenClaw 运行环境**: OpenClaw Gateway 运行在 WSL 中，需要 Linux 版本的依赖
3. **TypeScript 编译**: 源码需要编译成 JavaScript 才能被 OpenClaw 加载

## 前置要求

### 1. 确认 WSL 环境

```bash
# 在 Windows PowerShell 中查看 WSL 发行版
wsl --list --verbose

# 确保使用的是 Ubuntu-24.04（或其他 Ubuntu 版本）
# 不要使用 docker-desktop
```

### 2. 安装 Node.js 和 npm

在 WSL Ubuntu 中执行:

```bash
# 更新包列表
sudo apt update

# 安装 Node.js 和 npm
sudo apt install nodejs npm -y

# 验证安装
node --version  # 应该显示 v16.x 或更高
npm --version   # 应该显示版本号
```

### 3. 安装 OpenClaw

```bash
# 如果还没有安装 OpenClaw
# 请参考 OpenClaw 官方文档进行安装
```

## 安装步骤

### 方法 1: 使用自动安装脚本（推荐）

#### 步骤 1: 进入 WSL

在 Windows 中打开 PowerShell 或 Windows Terminal:

```powershell
# 进入 Ubuntu-24.04
wsl -d Ubuntu-24.04
```

#### 步骤 2: 复制安装脚本到 WSL

有两种方式:

**方式 A: 从 Windows 项目目录运行**

```bash
# 在 WSL 中，导航到 Windows 项目目录
cd /mnt/d/agent-oracle/agentoracle-native-plugin  # 根据你的实际路径调整

# 运行安装脚本
bash install-in-wsl.sh
```

**方式 B: 先复制脚本到 WSL**

```bash
# 在 WSL 中创建临时目录
mkdir -p ~/temp

# 从 Windows 复制脚本
cp /mnt/d/agent-oracle/agentoracle-native-plugin/install-in-wsl.sh ~/temp/

# 运行脚本
cd ~/temp
bash install-in-wsl.sh
```

#### 步骤 3: 等待安装完成

脚本会自动执行以下操作:
1. ✅ 创建目标目录 `~/.openclaw/plugins/agentoracle-native`
2. ✅ 复制源代码和配置文件
3. ✅ 检查 Node.js 环境
4. ✅ 清理旧文件
5. ✅ 安装 npm 依赖（Linux 版本）
6. ✅ 编译 TypeScript
7. ✅ 验证编译结果
8. ✅ 重启 OpenClaw Gateway
9. ✅ 验证插件状态

### 方法 2: 手动安装

如果自动脚本失败，可以手动执行:

```bash
# 1. 创建目标目录
mkdir -p ~/.openclaw/plugins/agentoracle-native

# 2. 复制文件（从 Windows 项目目录）
cd /mnt/d/agent-oracle/agentoracle-native-plugin  # 根据实际路径调整
rsync -av --exclude='node_modules' --exclude='dist' \
    ./ ~/.openclaw/plugins/agentoracle-native/

# 3. 进入目标目录
cd ~/.openclaw/plugins/agentoracle-native

# 4. 安装依赖
npm install

# 5. 编译 TypeScript
npm run build

# 6. 重启 OpenClaw
openclaw gateway restart

# 7. 验证插件
openclaw plugins info agentoracle-native
```

## 配置插件

### 1. 配置 API Key

```bash
# 替换 YOUR_API_KEY 为你的实际 API Key
openclaw config set agentoracle-native.api_key YOUR_API_KEY
```

### 2. 配置 Gateway Token

```bash
# 替换 YOUR_GATEWAY_TOKEN 为你的实际 Gateway Token
openclaw config set agentoracle-native.gateway_token YOUR_GATEWAY_TOKEN
```

### 3. 验证配置

```bash
# 查看插件配置
openclaw config get agentoracle-native

# 查看插件状态
openclaw plugins info agentoracle-native
```

## 验证安装

### 1. 检查插件状态

```bash
openclaw plugins info agentoracle-native
```

期望输出:
```
AgentOracle Native
id: agentoracle-native
Status: loaded  # 或 running
Source: ~/.openclaw/plugins/agentoracle-native/dist/index.js
```

### 2. 查看日志

```bash
# 实时查看插件日志
tail -f ~/.openclaw/logs/gateway.log | grep agentoracle

# 或查看完整日志
tail -f ~/.openclaw/logs/gateway.log
```

### 3. 测试功能

```bash
# 测试 WebSocket 连接
cd ~/.openclaw/plugins/agentoracle-native
npm run test:websocket
```

## 更新插件

当你在 Windows 中修改了代码后，需要重新同步到 WSL:

```bash
# 在 WSL 中重新运行安装脚本
cd /mnt/d/agent-oracle/agentoracle-native-plugin  # 根据实际路径调整
bash install-in-wsl.sh
```

或者手动更新:

```bash
# 1. 复制更新的文件
cd /mnt/d/agent-oracle/agentoracle-native-plugin
rsync -av --exclude='node_modules' --exclude='dist' \
    ./ ~/.openclaw/plugins/agentoracle-native/

# 2. 重新编译
cd ~/.openclaw/plugins/agentoracle-native
npm run build

# 3. 重启 Gateway
openclaw gateway restart
```

## 常见问题

### Q1: 插件状态显示 "plugin not found"

这通常是因为 OpenClaw 配置中有旧的插件条目。手动修复步骤:

```bash
# 1. 查看当前配置
openclaw config get plugins

# 2. 删除旧的插件条目
openclaw config unset plugins.entries.agentoracle-native
openclaw config unset plugins.entries

# 3. 删除旧的 extensions 目录（如果存在）
chmod -R 755 ~/.openclaw/extensions/agentoracle-native 2>/dev/null || true
rm -rf ~/.openclaw/extensions/agentoracle-native

# 4. 重启 Gateway
openclaw gateway restart

# 5. 验证插件列表
openclaw plugins list
```

### Q2: 为什么不能直接使用 Windows 的 node_modules？

A: Node.js 的某些原生模块是平台相关的，Windows 编译的模块无法在 Linux 中运行。必须在 WSL 中重新安装依赖。

### Q3: 每次修改代码都要重新安装吗？

A: 是的，因为:
1. 需要从 Windows 复制更新的文件到 WSL
2. 需要重新编译 TypeScript
3. 需要重启 OpenClaw Gateway 加载新代码

但是你可以使用 `install-in-wsl.sh` 脚本自动化这个过程。

### Q4: 插件状态显示 "error"

A: 检查以下几点:
1. 是否正确配置了 `api_key` 和 `gateway_token`
2. 查看日志: `tail -f ~/.openclaw/logs/gateway.log | grep agentoracle`
3. 验证编译结果: `ls -la ~/.openclaw/plugins/agentoracle-native/dist/`
4. 检查 package.json 中的 `openclaw.extensions` 字段是否指向 `./dist/index.js`

### Q5: OpenClaw 可能不会自动发现 plugins 目录

A: OpenClaw 可能需要手动注册插件。如果 `openclaw plugins list` 没有显示插件，尝试:

```bash
# 查看 OpenClaw 配置
cat ~/.openclaw/config.json

# 如果配置中没有 plugins 相关配置，可能需要手动添加
# 或者查看 OpenClaw 文档了解插件注册机制
```

### Q6: 找不到 openclaw 命令

A: 确保 OpenClaw 已正确安装并添加到 PATH:
```bash
# 检查 OpenClaw 安装
which openclaw

# 如果没有找到，可能需要重新安装或添加到 PATH
```

### Q7: npm install 很慢

A: 可以使用国内镜像加速:
```bash
# 使用淘宝镜像
npm config set registry https://registry.npmmirror.com

# 然后重新安装
npm install
```

## 手动诊断步骤

如果安装脚本运行后插件仍未找到，按以下步骤诊断:

```bash
# 1. 检查编译文件是否存在
ls -la ~/.openclaw/plugins/agentoracle-native/dist/

# 2. 检查 OpenClaw 配置
openclaw config get plugins
cat ~/.openclaw/config.json

# 3. 检查是否有旧的 extensions 目录
ls -la ~/.openclaw/extensions/

# 4. 查看 OpenClaw 插件列表
openclaw plugins list

# 5. 查看 Gateway 日志
tail -50 ~/.openclaw/logs/gateway.log

# 6. 手动清理配置
openclaw config unset plugins.entries.agentoracle-native
openclaw config unset plugins.entries

# 7. 删除旧目录
rm -rf ~/.openclaw/extensions/agentoracle-native

# 8. 重启 Gateway
openclaw gateway restart

# 9. 再次检查插件列表
openclaw plugins list
```

## 目录结构

安装完成后的目录结构:

```
~/.openclaw/
├── plugins/
│   └── agentoracle-native/          # 插件目录
│       ├── dist/                     # 编译后的 JavaScript
│       │   ├── index.js             # 入口文件
│       │   ├── api_client.js
│       │   ├── websocket_client.js
│       │   ├── daily_reporter.js
│       │   └── ...
│       ├── src/                      # TypeScript 源码
│       ├── node_modules/             # Linux 版本的依赖
│       ├── package.json
│       ├── tsconfig.json
│       └── openclaw.plugin.json
├── config.json                       # OpenClaw 配置
└── logs/
    └── gateway.log                   # Gateway 日志
```

## 下一步

安装完成后，你可以:

1. 📖 阅读 [USAGE.md](./USAGE.md) 了解如何使用插件
2. 📖 阅读 [API-KEY-SETUP.md](./API-KEY-SETUP.md) 了解如何获取 API Key
3. 📖 阅读 [DAILY-REPORT-FEATURE.md](./DAILY-REPORT-FEATURE.md) 了解每日报告功能
4. 🧪 运行测试验证功能是否正常

## 技术支持

如果遇到问题:
1. 查看日志: `tail -f ~/.openclaw/logs/gateway.log | grep agentoracle`
2. 运行诊断脚本: `bash diagnose-tool.sh`
3. 查看 [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) 获取更多部署信息
