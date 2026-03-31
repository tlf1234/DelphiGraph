# Claw-Hub 发布指南

## 概述

本指南详细说明如何将 `agentoracle-native-plugin` 发布到 **Claw-Hub**（OpenClaw 官方插件市场），供生产环境用户安装使用。

**重要说明**：本插件发布到 Claw-Hub，而非 npm。Claw-Hub 是 OpenClaw 的官方插件市场，专门用于分发 OpenClaw 插件。

## 目标读者

- 插件开发者
- 项目维护者
- 需要发布新版本的团队成员

## 前置要求

### 必需
- Claw-Hub 账户（通过 OpenClaw 官方网站注册）
- 项目维护者权限
- Node.js 16+ 和 npm
- OpenClaw CLI 工具

### 推荐
- Git 版本控制
- 了解语义化版本（Semantic Versioning）
- 了解 tar 打包命令

## 发布内容说明

### 将要发布的文件

当打包并发布到 Claw-Hub 时，以下内容会被包含：

```
agentoracle-native-plugin/
├── dist/                      # 编译后的 JavaScript 代码（必需）
│   ├── index.js
│   ├── index.d.ts
│   ├── daemon.js
│   ├── websocket_client.js
│   └── ... (其他编译文件)
├── node_modules/              # 依赖包（必需，已安装）
│   └── ... (所有依赖)
├── src/                       # TypeScript 源代码（推荐）
│   ├── daemon.ts
│   ├── websocket_client.ts
│   └── ... (其他源文件)
├── package.json               # 包配置（必需）
├── package-lock.json          # 依赖锁定文件（推荐）
├── openclaw.plugin.json       # OpenClaw 插件元数据（必需）
├── tsconfig.json              # TypeScript 配置（推荐）
├── README.md                  # 主文档（推荐）
├── LICENSE                    # 许可证（推荐）
└── scripts/                   # 工具脚本（可选）
    ├── doctor.js
    └── test-websocket.ts
```

**关键区别**：
- 必须包含 `node_modules/`（用户环境可能无法运行 npm install）
- 推荐包含 `src/`（便于用户调试和理解）
- 推荐包含 `tsconfig.json` 和 `package-lock.json`（完整的开发环境）

### 不会发布的文件

使用 `tar --exclude` 排除：

```
- .git/                       # Git 仓库
- src/__tests__/              # 测试文件
- coverage/                   # 测试覆盖率报告
- .vscode/                    # 编辑器配置
- *.log                       # 日志文件
- 临时文档                     # 开发过程文档
```

## 版本管理

### 语义化版本

遵循 [Semantic Versioning 2.0.0](https://semver.org/)：

**格式**: `MAJOR.MINOR.PATCH`

- **MAJOR** (1.0.0 → 2.0.0): 破坏性更改
  - 示例: 更改配置格式、删除 API、重大架构调整
  
- **MINOR** (1.0.0 → 1.1.0): 新功能，向后兼容
  - 示例: 添加新配置选项、新功能、性能优化
  
- **PATCH** (1.0.0 → 1.0.1): Bug 修复，向后兼容
  - 示例: 修复 bug、文档更新、小改进

### 版本号命令

```bash
# Patch 版本（bug 修复）
npm version patch -m "Fix: WebSocket reconnection issue"

# Minor 版本（新功能）
npm version minor -m "Feature: Add multi-account support"

# Major 版本（破坏性更改）
npm version major -m "Breaking: Change configuration format"
```

## 首次发布流程

### 步骤 1: 准备 Claw-Hub 账户

```bash
# 1. 注册 Claw-Hub 账户（如果没有）
# 访问 OpenClaw 官方网站注册

# 2. 登录 Claw-Hub
openclaw hub login

# 输入：
# - Username: your-username
# - Password: your-password

# 3. 验证登录状态
openclaw hub whoami
# 应该显示你的用户名
```

### 步骤 2: 检查插件名

```bash
# 检查插件名是否已被占用
openclaw hub search agentoracle-native-plugin

# 如果返回空结果或 "not found"，说明插件名可用
# 如果返回插件信息，说明插件名已被占用，需要更改 openclaw.plugin.json 中的 id
```

### 步骤 3: 配置打包内容

我们提供了自动化打包脚本，推荐使用：

**Windows PowerShell 脚本** (`scripts/package.ps1`):
- 自动检查必需文件
- 自动获取版本号
- 显示打包进度和结果
- 提供下一步操作提示

**Linux/macOS/WSL 脚本** (`scripts/package.sh`):
- 与 PowerShell 脚本功能相同
- 使用 bash 语法

这些脚本已包含在项目中，无需手动创建。

### 步骤 4: 预览打包内容

**使用打包脚本（推荐）**:

```bash
# Windows PowerShell:
.\scripts\package.ps1

# Linux/macOS/WSL:
bash scripts/package.sh
```

脚本会自动：
- 检查必需文件是否存在
- 打包所有必需内容
- 显示文件大小和统计信息
- 提供下一步操作提示

**手动预览（可选）**:

```bash
# Linux/macOS/WSL - 使用 --dry-run 预览（不实际创建文件）
tar -czf test-package.tar.gz \
  --exclude='.git' \
  --exclude='src/__tests__' \
  --exclude='coverage' \
  --exclude='*.log' \
  --exclude='.vscode' \
  --dry-run \
  dist/ node_modules/ src/ package.json package-lock.json \
  openclaw.plugin.json README.md LICENSE tsconfig.json

# Windows PowerShell - 实际打包后查看
tar -czf test-package.tar.gz --exclude='.git' --exclude='src/__tests__' --exclude='coverage' --exclude='*.log' --exclude='.vscode' dist/ node_modules/ src/ package.json package-lock.json openclaw.plugin.json README.md LICENSE tsconfig.json

# 查看打包内容
tar -tzf test-package.tar.gz | Select-Object -First 20  # PowerShell
tar -tzf test-package.tar.gz | head -20                  # bash

# 查看文件大小
# PowerShell:
(Get-Item test-package.tar.gz).Length / 1MB

# bash:
du -h test-package.tar.gz

# 查看完毕后删除
Remove-Item test-package.tar.gz  # PowerShell
rm test-package.tar.gz           # bash
```

### 步骤 5: 最终测试

```bash
# 1. 运行所有测试
npm test

# 2. 检查测试覆盖率
npm run test:coverage

# 3. 运行环境诊断
npm run doctor

# 4. 运行 WebSocket 测试
npm run test:websocket

# 5. 构建生产版本
npm run build

# 6. 检查编译输出
ls -la dist/

# 7. 验证 node_modules 完整性
npm list --depth=0
```

### 步骤 6: 打包插件

**推荐方式：使用 npm 脚本**

```bash
# Windows PowerShell:
npm run package:win

# Linux/macOS/WSL:
npm run package
```

这些脚本会自动：
- 检查必需文件是否存在
- 获取当前版本号
- 打包所有必需内容
- 显示文件大小和统计信息
- 提供下一步操作提示

**或者直接运行脚本：**

```bash
# Windows PowerShell:
.\scripts\package.ps1

# Linux/macOS/WSL:
bash scripts/package.sh
```

**手动打包方式（不推荐）：**

```bash
# 获取当前版本号
# Linux/macOS/WSL:
VERSION=$(node -p "require('./package.json').version")

# Windows PowerShell:
$version = node -p "require('./package.json').version"

# 打包插件
# Linux/macOS/WSL (多行):
tar -czf agentoracle-native-plugin-v${VERSION}.tar.gz \
  --exclude='.git' \
  --exclude='src/__tests__' \
  --exclude='coverage' \
  --exclude='*.log' \
  --exclude='.vscode' \
  dist/ \
  node_modules/ \
  src/ \
  package.json \
  package-lock.json \
  openclaw.plugin.json \
  README.md \
  LICENSE \
  tsconfig.json

# Windows PowerShell (单行):
tar -czf "agentoracle-native-plugin-v$version.tar.gz" --exclude='.git' --exclude='src/__tests__' --exclude='coverage' --exclude='*.log' --exclude='.vscode' dist/ node_modules/ src/ package.json package-lock.json openclaw.plugin.json README.md LICENSE tsconfig.json
```

### 步骤 7: 发布到 Claw-Hub

```bash
# 发布到 Claw-Hub
openclaw hub publish agentoracle-native-plugin-v${VERSION}.tar.gz

# 或使用完整路径
openclaw hub publish ./agentoracle-native-plugin-v1.0.0.tar.gz

# 如果支持，可以添加发布说明
openclaw hub publish agentoracle-native-plugin-v${VERSION}.tar.gz \
  --description "Initial release with WebSocket support" \
  --tags "prediction,ai,automation"
```

### 步骤 8: 验证发布

```bash
# 1. 查看 Claw-Hub 上的插件信息
openclaw hub search agentoracle-native-plugin
openclaw hub info agentoracle-native-plugin

# 2. 在新环境测试安装
openclaw plugins install agentoracle-native-plugin

# 3. 验证版本
openclaw plugins info agentoracle-native-plugin

# 4. 测试插件功能
openclaw gateway restart
tail -f ~/.openclaw/logs/gateway.log | grep agentoracle

# 5. 检查审计日志
ls -la ~/.openclaw/agentoracle_logs/
```

### 步骤 9: 推送到 Git

```bash
# npm version 命令会自动创建 git tag
# 推送代码和标签到远程仓库
git push origin main
git push origin --tags

# 在 GitHub 创建 Release（可选）
# 访问 GitHub 仓库，创建新的 Release，上传打包文件
```

## 后续版本发布流程

### 步骤 1: 开发和测试

```bash
# 1. 创建功能分支
git checkout -b feature/new-feature

# 2. 开发新功能或修复 bug
# ... 编写代码 ...

# 3. 运行测试
npm test
npm run test:coverage

# 4. 提交代码
git add .
git commit -m "Feature: Add new feature"

# 5. 合并到主分支
git checkout main
git merge feature/new-feature
```

### 步骤 2: 更新版本号

```bash
# 根据更改类型选择版本号
npm version patch  # bug 修复: 1.0.0 → 1.0.1
npm version minor  # 新功能: 1.0.0 → 1.1.0
npm version major  # 破坏性更改: 1.0.0 → 2.0.0

# 带提交信息
npm version patch -m "Fix: Resolve WebSocket timeout issue"

# 同时更新 openclaw.plugin.json 中的版本号
# 确保两个文件的版本号一致
```

### 步骤 3: 更新文档

```bash
# 更新 OPENCLAW-INTEGRATION-GUIDE.md 中的"更新日志"部分
# 更新 README.md（如果有 API 变更）
# 更新 OPENCLAW-INTEGRATION-GUIDE.md（如果有配置变更）
# 更新 CLAW-HUB-PUBLISHING-GUIDE.md（如果有发布流程变更）
```

### 步骤 4: 构建和打包

```bash
# 构建
npm run build

# 打包
VERSION=$(node -p "require('./package.json').version")
tar -czf agentoracle-native-plugin-v${VERSION}.tar.gz \
  --exclude='.git' \
  --exclude='src/__tests__' \
  --exclude='coverage' \
  --exclude='*.log' \
  --exclude='.vscode' \
  dist/ node_modules/ src/ package.json package-lock.json \
  openclaw.plugin.json README.md LICENSE tsconfig.json
```

### 步骤 5: 发布新版本

```bash
# 发布到 Claw-Hub
openclaw hub publish agentoracle-native-plugin-v${VERSION}.tar.gz

# 推送到 Git
git push origin main --tags
```

### 步骤 6: 通知用户

```bash
# 1. 在 GitHub 创建 Release
# 访问 GitHub 仓库，创建新的 Release
# 上传打包文件作为附件
# 添加更新说明

# 2. 在 Claw-Hub 添加发布说明（如果支持）
openclaw hub update agentoracle-native-plugin \
  --version ${VERSION} \
  --notes "Bug fixes and improvements"

# 3. 通知用户更新插件
# 发送邮件或在社区发布更新公告
```

## 发布检查清单

### 发布前

- [ ] 所有测试通过 (`npm test`)
- [ ] 测试覆盖率达标 (`npm run test:coverage`)
- [ ] 环境诊断通过 (`npm run doctor`)
- [ ] WebSocket 测试通过 (`npm run test:websocket`)
- [ ] 代码已构建 (`npm run build`)
- [ ] 版本号已更新（`package.json` 和 `openclaw.plugin.json` 一致）
- [ ] 更新日志已更新（OPENCLAW-INTEGRATION-GUIDE.md）
- [ ] 文档已更新（README.md, OPENCLAW-INTEGRATION-GUIDE.md）
- [ ] Claw-Hub 已登录 (`openclaw hub whoami`)
- [ ] 预览打包内容（使用 `tar --dry-run`）
- [ ] `node_modules/` 完整且最新

### 发布时

- [ ] 执行打包命令（`tar -czf ...`）
- [ ] 验证打包文件大小合理
- [ ] 执行 `openclaw hub publish`
- [ ] 验证发布成功 (`openclaw hub info agentoracle-native-plugin`)
- [ ] 推送到 Git (`git push origin main --tags`)

### 发布后

- [ ] 在新环境测试安装 (`openclaw plugins install`)
- [ ] 验证插件加载成功 (`openclaw plugins list`)
- [ ] 验证插件功能正常（查看日志）
- [ ] 验证内置验证通过
- [ ] 创建 GitHub Release（上传打包文件）
- [ ] 更新文档网站（如果有）
- [ ] 通知用户更新（社区公告、邮件等）

## 常见问题

### Q1: 发布失败，提示 "You do not have permission to publish"

A: 
- 检查是否已登录：`openclaw hub whoami`
- 检查插件名是否已被占用：`openclaw hub search agentoracle-native-plugin`
- 确认你有该插件的维护者权限
- 联系 Claw-Hub 管理员获取权限

### Q2: 如何撤销已发布的版本？

A:
```bash
# 联系 Claw-Hub 管理员撤销版本
# 或使用 CLI（如果支持）
openclaw hub unpublish agentoracle-native-plugin@1.0.0

# 注意：不推荐撤销，建议发布修复版本
npm version patch
npm run build
# 重新打包和发布
```

### Q3: 如何发布 beta 版本？

A:
```bash
# 更新版本号为 beta
npm version 1.1.0-beta.0

# 构建和打包
npm run build
tar -czf agentoracle-native-plugin-v1.1.0-beta.0.tar.gz ...

# 发布到 beta 频道（如果 Claw-Hub 支持）
openclaw hub publish agentoracle-native-plugin-v1.1.0-beta.0.tar.gz --channel beta

# 用户安装 beta 版本
openclaw plugins install agentoracle-native-plugin@beta
```

### Q4: 打包文件太大怎么办？

A:
1. 检查是否包含了不必要的文件（使用 `tar -tzf` 查看）
2. 确保排除了测试文件、日志、临时文件
3. 考虑使用 `npm prune --production` 清理开发依赖（但要小心）
4. 压缩级别已经是最高（`-z` 选项）

### Q5: 如何管理多个维护者？

A:
```bash
# 添加维护者（如果 Claw-Hub 支持）
openclaw hub maintainer add username agentoracle-native-plugin

# 查看维护者列表
openclaw hub maintainer list agentoracle-native-plugin

# 移除维护者
openclaw hub maintainer remove username agentoracle-native-plugin

# 或联系 Claw-Hub 管理员手动管理
```

### Q6: 打包时 node_modules 太大怎么办？

A:
```bash
# 1. 清理不必要的依赖
npm prune

# 2. 检查依赖大小
npm list --depth=0

# 3. 考虑移除开发依赖（谨慎）
npm prune --production

# 4. 重新安装生产依赖
rm -rf node_modules
npm install --production

# 5. 打包后恢复开发环境
npm install
```

### Q7: 如何验证打包文件的完整性？

A:
```bash
# 1. 解压到临时目录
mkdir -p /tmp/test-plugin
tar -xzf agentoracle-native-plugin-v1.0.0.tar.gz -C /tmp/test-plugin

# 2. 检查关键文件
ls -la /tmp/test-plugin/dist/
ls -la /tmp/test-plugin/node_modules/
cat /tmp/test-plugin/package.json
cat /tmp/test-plugin/openclaw.plugin.json

# 3. 尝试在测试环境安装
openclaw plugins install /tmp/test-plugin

# 4. 清理
rm -rf /tmp/test-plugin
```

## 最佳实践

### 1. 使用 prepublishOnly 脚本

在 `package.json` 中：

```json
{
  "scripts": {
    "prepublishOnly": "npm run build && npm test"
  }
}
```

这确保发布前自动构建和测试。

### 2. 使用 .npmrc 配置

创建 `.npmrc` 文件：

```
# 发布前需要 2FA
publish-require-2fa=true

# 使用 npm registry
registry=https://registry.npmjs.org/
```

### 3. 版本号规范

- 使用 `npm version` 命令而非手动修改
- 每次发布都创建 git tag
- 在 commit message 中说明更改

### 4. 文档同步

- 确保 README.md 与代码同步
- 更新 CHANGELOG.md
- 更新集成指南中的版本信息

### 5. 测试发布

在发布到生产前，可以：

```bash
# 在本地测试环境安装
mkdir -p /tmp/test-openclaw-plugins
tar -xzf agentoracle-native-plugin-v1.0.0.tar.gz -C /tmp/test-openclaw-plugins
openclaw plugins install /tmp/test-openclaw-plugins/agentoracle-native-plugin

# 或使用 npm link 本地测试（开发环境）
npm link
cd ~/.openclaw/plugins
npm link agentoracle-native-plugin
```

## 回滚策略

如果发布的版本有严重问题：

### 方式 1: 发布修复版本（推荐）

```bash
# 修复问题
# ... 编写修复代码 ...

# 发布 patch 版本
npm version patch -m "Fix: Critical bug in v1.0.0"
npm run build

# 重新打包
VERSION=$(node -p "require('./package.json').version")
tar -czf agentoracle-native-plugin-v${VERSION}.tar.gz \
  --exclude='.git' --exclude='src/__tests__' --exclude='coverage' \
  --exclude='*.log' --exclude='.vscode' \
  dist/ node_modules/ src/ package.json package-lock.json \
  openclaw.plugin.json README.md LICENSE tsconfig.json

# 发布到 Claw-Hub
openclaw hub publish agentoracle-native-plugin-v${VERSION}.tar.gz
```

### 方式 2: 废弃版本

```bash
# 标记版本为废弃
npm deprecate agentoracle-native-plugin@1.0.0 "Critical bug, please upgrade to 1.0.1"
```

### 方式 3: 撤销发布（不推荐）

```bash
# 仅在 72 小时内可用
npm unpublish agentoracle-native-plugin@1.0.0
```

## 自动化发布

### 使用 GitHub Actions

创建 `.github/workflows/publish.yml`:

```yaml
name: Publish to Claw-Hub

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '16'
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Package plugin
        run: |
          VERSION=$(node -p "require('./package.json').version")
          tar -czf agentoracle-native-plugin-v${VERSION}.tar.gz \
            --exclude='.git' --exclude='src/__tests__' --exclude='coverage' \
            --exclude='*.log' --exclude='.vscode' \
            dist/ node_modules/ src/ package.json package-lock.json \
            openclaw.plugin.json README.md LICENSE tsconfig.json
      - name: Publish to Claw-Hub
        run: |
          VERSION=$(node -p "require('./package.json').version")
          openclaw hub login --token ${{ secrets.CLAW_HUB_TOKEN }}
          openclaw hub publish agentoracle-native-plugin-v${VERSION}.tar.gz
```

## 总结

Claw-Hub 发布流程：
1. ✅ 准备 Claw-Hub 账户和权限
2. ✅ 配置打包内容（使用 tar 命令）
3. ✅ 测试和构建
4. ✅ 更新版本号
5. ✅ 打包插件（包含 dist/、node_modules/、src/ 等）
6. ✅ 发布到 Claw-Hub
7. ✅ 验证和推送到 Git
8. ✅ 通知用户更新

遵循本指南，可以确保插件的每次发布都是高质量、可靠的。

---

**文档版本**: 1.0.0  
**最后更新**: 2026-03-05  
**作者**: AgentOracle Team
