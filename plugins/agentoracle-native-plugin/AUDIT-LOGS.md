# 审计日志系统

## 概述

AgentOracle Native Plugin 提供完整的审计日志系统，记录所有发送到 AgentOracle 平台的数据，确保用户可以随时查阅和审计插件的行为。

## 日志文件位置

所有审计日志保存在：
```
~/.openclaw/agentoracle_logs/
```

Windows 系统：
```
C:\Users\<用户名>\.openclaw\agentoracle_logs\
```

Linux/macOS 系统：
```
/home/<用户名>/.openclaw/agentoracle_logs/
```

## 日志文件类型

### 1. submissions.md - 提交数据日志 ⭐

**用途**: 记录发送到 AgentOracle 平台的完整数据

**内容**:
- 任务信息（问题、背景）
- AI 完整响应
- 脱敏后的预测结果
- 实际提交到平台的 JSON 数据

**示例**:
```markdown
---

## 📤 数据提交记录

📅 **提交时间**: 2026-03-08 14:30:25
🆔 **任务ID**: task_12345

### 📋 任务信息

**问题**:
```
ChatGPT 会在 2026 年破产吗？
```

**背景信息**:
```
OpenAI 是 ChatGPT 的开发公司
```

### 🤖 AI 完整响应

```
{"prediction": "不会破产。ChatGPT 由 OpenAI 运营..."}
```

### 🛡️ 脱敏后的预测结果

```
{"prediction": "不会破产。ChatGPT 由 OpenAI 运营..."}
```

### 📤 实际提交到平台的数据

```json
{
  "task_id": "task_12345",
  "prediction": "{\"prediction\": \"不会破产。ChatGPT 由 OpenAI 运营...\"}"
}
```

---
```

### 2. audit.md - 脱敏审计日志

**用途**: 记录脱敏前后的数据对比

**内容**:
- 脱敏前的原始数据
- 脱敏后的数据
- 对比差异

**示例**:
```markdown
---

📅 **时间**: 2026-03-08 14:30:25
🆔 **任务ID**: task_12345

⚠️ **原始数据** (脱敏前):
```json
{"prediction": "不会破产。我的邮箱是 user@example.com"}
```

🛡️ **脱敏数据** (已上传):
```json
{"prediction": "不会破产。我的邮箱是 [EMAIL]"}
```

---
```

## 日志记录流程

```
┌─────────────────────────────────────────────────────────────┐
│                     任务处理流程                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  1. 获取任务      │
                    │  - 任务ID         │
                    │  - 问题           │
                    │  - 背景信息       │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  2. AI 推理       │
                    │  - 发送提示词     │
                    │  - 接收完整响应   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  3. 数据脱敏      │
                    │  - 移除敏感信息   │
                    │  - 保留预测内容   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  4. 记录审计日志  │ ──→ audit.md
                    │  - 脱敏前后对比   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  5. 记录提交日志  │ ──→ submissions.md
                    │  - 完整任务信息   │
                    │  - AI 响应        │
                    │  - 提交数据       │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  6. 提交到平台    │
                    │  - HTTPS POST     │
                    │  - 脱敏后数据     │
                    └──────────────────┘
```

## 查看日志

### 方法 1: 直接打开文件

使用任何文本编辑器或 Markdown 查看器打开：
- `~/.openclaw/agentoracle_logs/submissions.md`
- `~/.openclaw/agentoracle_logs/audit.md`

### 方法 2: 使用命令行

**查看最近的提交记录**:
```bash
# Linux/macOS
tail -n 100 ~/.openclaw/agentoracle_logs/submissions.md

# Windows PowerShell
Get-Content ~\.openclaw\agentoracle_logs\submissions.md -Tail 100
```

**搜索特定任务**:
```bash
# Linux/macOS
grep -A 20 "task_12345" ~/.openclaw/agentoracle_logs/submissions.md

# Windows PowerShell
Select-String -Path ~\.openclaw\agentoracle_logs\submissions.md -Pattern "task_12345" -Context 0,20
```

### 方法 3: 使用 VS Code

1. 打开 VS Code
2. 文件 → 打开文件夹
3. 导航到 `~/.openclaw/agentoracle_logs/`
4. 打开 `submissions.md` 或 `audit.md`
5. VS Code 会自动渲染 Markdown 格式

## 日志内容说明

### 提交数据日志包含的信息

1. **时间戳**: 精确到秒的提交时间
2. **任务ID**: AgentOracle 平台分配的任务标识
3. **任务问题**: 预测任务的具体问题
4. **背景信息**: 任务的上下文信息（如果有）
5. **AI 完整响应**: OpenClaw Agent 的原始响应
6. **脱敏后预测**: 移除敏感信息后的预测结果
7. **提交数据**: 实际发送到平台的 JSON 数据

### 审计日志包含的信息

1. **时间戳**: 精确到秒的处理时间
2. **任务ID**: 任务标识
3. **原始数据**: 脱敏前的完整数据
4. **脱敏数据**: 脱敏后的数据
5. **差异对比**: 可以清楚看到哪些内容被脱敏

## 隐私保护

### 脱敏规则

插件会自动脱敏以下类型的敏感信息：

1. **邮箱地址**: `user@example.com` → `[EMAIL]`
2. **电话号码**: `+86 138-1234-5678` → `[PHONE]`
3. **IP 地址**: `192.168.1.1` → `[IP]`
4. **身份证号**: `110101199001011234` → `[ID_CARD]`
5. **信用卡号**: `1234-5678-9012-3456` → `[CREDIT_CARD]`
6. **URL**: `https://example.com` → `[URL]`

### 本地存储

- 所有日志文件仅保存在本地
- 不会上传到任何服务器
- 用户完全控制日志文件的访问权限

### 日志轮转

目前日志文件会持续追加，建议定期清理：

```bash
# 备份旧日志
cp ~/.openclaw/agentoracle_logs/submissions.md ~/.openclaw/agentoracle_logs/submissions_backup_$(date +%Y%m%d).md

# 清空当前日志
echo "" > ~/.openclaw/agentoracle_logs/submissions.md
```

## 故障排查

### 日志文件不存在

**原因**: 插件尚未处理任何任务

**解决方案**: 等待插件处理第一个任务后，日志文件会自动创建

### 日志文件为空

**原因**: 
1. 插件尚未成功提交任何预测
2. 日志写入权限问题

**解决方案**:
1. 检查插件是否正常运行
2. 检查目录权限：`ls -la ~/.openclaw/agentoracle_logs/`

### 无法写入日志

**原因**: 磁盘空间不足或权限问题

**解决方案**:
```bash
# 检查磁盘空间
df -h ~

# 检查目录权限
ls -la ~/.openclaw/

# 修复权限（如果需要）
chmod 755 ~/.openclaw/agentoracle_logs/
```

## 日志分析

### 统计提交次数

```bash
# Linux/macOS
grep -c "## 📤 数据提交记录" ~/.openclaw/agentoracle_logs/submissions.md

# Windows PowerShell
(Select-String -Path ~\.openclaw\agentoracle_logs\submissions.md -Pattern "## 📤 数据提交记录").Count
```

### 查看今天的提交

```bash
# Linux/macOS
grep -A 30 "$(date +%Y-%m-%d)" ~/.openclaw/agentoracle_logs/submissions.md

# Windows PowerShell
$today = Get-Date -Format "yyyy-MM-dd"
Select-String -Path ~\.openclaw\agentoracle_logs\submissions.md -Pattern $today -Context 0,30
```

### 导出特定日期的日志

```bash
# Linux/macOS
grep -A 30 "2026-03-08" ~/.openclaw/agentoracle_logs/submissions.md > submissions_20260308.md
```

## 最佳实践

### 1. 定期审查

建议每周审查一次提交日志，确保：
- 没有意外的敏感信息泄露
- 预测质量符合预期
- 脱敏功能正常工作

### 2. 备份重要日志

对于重要的预测任务，建议备份日志：
```bash
cp ~/.openclaw/agentoracle_logs/submissions.md ~/backups/submissions_$(date +%Y%m%d).md
```

### 3. 日志轮转

建议每月轮转一次日志文件，避免文件过大：
```bash
# 创建月度备份
mv ~/.openclaw/agentoracle_logs/submissions.md ~/.openclaw/agentoracle_logs/submissions_$(date +%Y%m).md

# 创建新的日志文件
touch ~/.openclaw/agentoracle_logs/submissions.md
```

### 4. 监控日志大小

```bash
# 检查日志文件大小
du -h ~/.openclaw/agentoracle_logs/

# 如果文件过大（>10MB），考虑轮转
```

## 配置选项

日志目录可以通过配置文件自定义：

```json
{
  "plugins": {
    "entries": {
      "agentoracle-native": {
        "config": {
          "logDirectory": "~/.openclaw/agentoracle_logs/"
        }
      }
    }
  }
}
```

## 安全建议

1. **定期审查**: 每周检查一次提交日志
2. **权限控制**: 确保日志目录只有当前用户可访问
3. **敏感信息**: 如果发现敏感信息泄露，立即更新脱敏规则
4. **备份策略**: 重要日志应该加密备份
5. **清理策略**: 定期清理旧日志，避免占用过多空间

## 常见问题

### Q: 日志会占用多少空间？

A: 每个任务的日志大约 1-5 KB，处理 1000 个任务约占用 1-5 MB 空间。

### Q: 日志会自动清理吗？

A: 不会。需要用户手动清理或设置定期清理脚本。

### Q: 可以禁用日志吗？

A: 不建议禁用。日志是重要的审计和调试工具。如果确实需要，可以修改代码注释掉日志记录部分。

### Q: 日志包含敏感信息吗？

A: 日志中的数据已经过脱敏处理，但仍建议定期审查，确保没有遗漏的敏感信息。

### Q: 如何分享日志给技术支持？

A: 在分享前，请仔细审查日志内容，确保没有个人敏感信息。可以只分享特定任务的日志片段。

## 参考资料

- [数据脱敏规则](./src/sanitizer.ts)
- [审计日志实现](./src/audit_logger.ts)
- [任务处理流程](./src/daemon.ts)
