# 提交记录功能使用指南

## 概述

提交记录功能允许用户在本地查看所有上传到 AgentOracle 平台的数据记录，确保数据已经过脱敏处理，没有隐私泄露。

---

## 功能特点

### 1. 本地记录保存

- **自动记录**: 每次提交任务后自动保存记录
- **JSON 格式**: 使用 JSON 格式存储，易于查看和导出
- **安全存储**: 文件权限设置为 0600（仅所有者可读写）
- **自动清理**: 超过最大记录数（默认 1000 条）后自动清理旧记录

### 2. 数据脱敏验证

- **原始数据**: 保存脱敏前的原始预测数据
- **脱敏数据**: 保存脱敏后的预测数据
- **对比显示**: 在 GUI 中对比显示原始数据和脱敏数据
- **脱敏标记**: 自动标记数据是否被脱敏

### 3. 统计信息

- **总提交数**: 记录所有提交的总数
- **成功率**: 计算提交成功的百分比
- **脱敏率**: 计算数据被脱敏的百分比
- **平均置信度**: 计算所有预测的平均置信度
- **平均延迟**: 计算推理的平均延迟时间

---

## 记录文件位置

默认记录文件位置：`~/.openclaw/submissions.json`

**Windows**: `C:\Users\<用户名>\.openclaw\submissions.json`  
**Linux/Mac**: `/home/<用户名>/.openclaw/submissions.json`

---

## 记录格式

### 文件结构

```json
{
  "version": "1.0.0",
  "created_at": "2026-02-28T10:00:00",
  "submissions": [
    {
      "id": 1,
      "timestamp": "2026-02-28T10:30:00",
      "task_id": "task-123",
      "task_title": "Weather Prediction",
      "question": "Will it rain tomorrow?",
      "original_prediction": {
        "prediction": "Yes, there is a 75% chance of rain. Contact me at 13812345678 for details.",
        "confidence": 0.75,
        "reasoning": "Based on current weather patterns..."
      },
      "sanitized_prediction": {
        "prediction": "Yes, there is a 75% chance of rain. Contact me at [REDACTED] for details.",
        "confidence": 0.75,
        "reasoning": "Based on current weather patterns..."
      },
      "data_sanitized": true,
      "telemetry": {
        "inference_latency_ms": 1234.5,
        "memory_entropy": {
          "db_size_bytes": 1024,
          "total_chunks": 10,
          "recent_chunks_24h": 5
        },
        "interaction_heartbeat": 100
      },
      "success": true
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 记录 ID（自增） |
| `timestamp` | string | 提交时间（ISO 8601 格式） |
| `task_id` | string | 任务 ID |
| `task_title` | string | 任务标题 |
| `question` | string | 任务问题（截断到 200 字符） |
| `original_prediction` | object | 原始预测数据（脱敏前） |
| `sanitized_prediction` | object | 脱敏后预测数据 |
| `data_sanitized` | boolean | 数据是否被脱敏 |
| `telemetry` | object | 遥测数据 |
| `success` | boolean | 提交是否成功 |

---

## 使用方式

### 1. 通过系统托盘查看

#### 步骤

1. 启动插件（系统托盘模式）
   ```bash
   python gui_tray.py
   ```

2. 右键点击托盘图标

3. 选择"查看提交记录"

4. 在控制台查看输出

#### 输出示例

```
================================================================================
提交记录（最近 10 条）
================================================================================

记录 #1
  时间: 2026-02-28T10:30:00
  任务: Weather Prediction
  状态: ✅ 成功
  数据脱敏: ✅ 是
  置信度: 0.75
  原始预测: Yes, there is a 75% chance of rain. Contact me at 13812345678...
  脱敏预测: Yes, there is a 75% chance of rain. Contact me at [REDACTED]...
--------------------------------------------------------------------------------

统计信息:
  总提交数: 10
  成功率: 90.0%
  脱敏率: 80.0%
  平均置信度: 0.72
  平均推理延迟: 1234ms
================================================================================
```

### 2. 通过 Python API 查看

```python
from submission_logger import SubmissionLogger

# 创建实例
logger = SubmissionLogger()

# 获取所有记录
all_submissions = logger.get_all_submissions()

# 获取最近 10 条记录
recent_submissions = logger.get_recent_submissions(count=10)

# 获取统计信息
stats = logger.get_statistics()
print(f"总提交数: {stats['total_submissions']}")
print(f"成功率: {stats['success_rate']:.1f}%")
print(f"脱敏率: {stats['sanitization_rate']:.1f}%")

# 根据 ID 获取记录
submission = logger.get_submission_by_id(1)
if submission:
    print(f"任务: {submission['task_title']}")
    print(f"原始预测: {submission['original_prediction']['prediction']}")
    print(f"脱敏预测: {submission['sanitized_prediction']['prediction']}")
```

### 3. 直接查看 JSON 文件

```bash
# Linux/Mac
cat ~/.openclaw/submissions.json | jq .

# Windows (PowerShell)
Get-Content $env:USERPROFILE\.openclaw\submissions.json | ConvertFrom-Json
```

---

## 数据脱敏验证

### 脱敏规则

插件会自动脱敏以下类型的敏感信息：

1. **手机号**: `13812345678` → `[REDACTED]`
2. **邮箱**: `user@example.com` → `[REDACTED]`
3. **长串数字**: `6222021234567890123` → `[REDACTED]`（银行卡/身份证）
4. **URL**: `https://example.com` → `[REDACTED]`

### 验证方法

#### 方法 1: 查看托盘输出

在"查看提交记录"中，如果看到：

```
数据脱敏: ✅ 是
原始预测: ... 13812345678 ...
脱敏预测: ... [REDACTED] ...
```

说明数据已被成功脱敏。

#### 方法 2: 检查 JSON 文件

```json
{
  "original_prediction": {
    "prediction": "Contact me at 13812345678"
  },
  "sanitized_prediction": {
    "prediction": "Contact me at [REDACTED]"
  },
  "data_sanitized": true
}
```

如果 `data_sanitized` 为 `true`，且 `original_prediction` 和 `sanitized_prediction` 不同，说明数据已被脱敏。

---

## 高级功能

### 1. 导出记录

```python
from submission_logger import SubmissionLogger

logger = SubmissionLogger()

# 导出到文件
logger.export_to_file("~/Desktop/submissions_backup.json")
```

### 2. 清空记录

```python
from submission_logger import SubmissionLogger

logger = SubmissionLogger()

# 清空所有记录
logger.clear_all_submissions()
```

### 3. 自定义配置

```python
from submission_logger import SubmissionLogger

# 自定义记录文件路径和最大记录数
logger = SubmissionLogger(
    log_file="~/my_submissions.json",
    max_records=500  # 最多保存 500 条记录
)
```

---

## 配置选项

### 在 skill.py 中配置

```python
# Initialize submission logger (提交记录管理)
self.submission_logger = SubmissionLogger(
    log_file="~/.openclaw/submissions.json",  # 记录文件路径
    max_records=1000  # 最大记录数
)
```

### 配置说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `log_file` | str | `~/.openclaw/submissions.json` | 记录文件路径 |
| `max_records` | int | 1000 | 最大记录数，超过后自动清理旧记录 |

---

## 隐私保护

### 1. 文件权限

记录文件自动设置为 0600 权限（仅所有者可读写），防止其他用户访问。

```bash
# 查看文件权限
ls -l ~/.openclaw/submissions.json
# 输出: -rw------- 1 user user 12345 Feb 28 10:30 submissions.json
```

### 2. 数据脱敏

所有上传到平台的数据都经过严格脱敏处理，记录文件中同时保存原始数据和脱敏数据，方便用户验证。

### 3. 本地存储

记录文件仅保存在本地，不会上传到任何服务器。

---

## 常见问题

### Q1: 记录文件在哪里？

**A**: 默认位置是 `~/.openclaw/submissions.json`

- Windows: `C:\Users\<用户名>\.openclaw\submissions.json`
- Linux/Mac: `/home/<用户名>/.openclaw/submissions.json`

### Q2: 如何查看记录？

**A**: 有三种方式：

1. 通过系统托盘菜单"查看提交记录"
2. 通过 Python API 调用 `SubmissionLogger`
3. 直接打开 JSON 文件查看

### Q3: 记录会占用多少空间？

**A**: 默认最多保存 1000 条记录，每条记录约 1-2KB，总共约 1-2MB。

### Q4: 如何清空记录？

**A**: 

```python
from submission_logger import SubmissionLogger
logger = SubmissionLogger()
logger.clear_all_submissions()
```

或者直接删除文件：

```bash
rm ~/.openclaw/submissions.json
```

### Q5: 记录文件会自动清理吗？

**A**: 是的，当记录数超过 `max_records`（默认 1000）时，会自动删除最旧的记录。

### Q6: 如何验证数据已脱敏？

**A**: 查看记录时，对比 `original_prediction` 和 `sanitized_prediction` 字段，如果不同且 `data_sanitized` 为 `true`，说明数据已被脱敏。

### Q7: 可以导出记录吗？

**A**: 可以，使用 `export_to_file()` 方法：

```python
logger.export_to_file("~/Desktop/backup.json")
```

---

## 示例场景

### 场景 1: 验证手机号被脱敏

1. 提交包含手机号的预测
2. 查看提交记录
3. 对比原始预测和脱敏预测

```
原始预测: "请联系我 13812345678"
脱敏预测: "请联系我 [REDACTED]"
数据脱敏: ✅ 是
```

### 场景 2: 查看提交统计

1. 运行插件一段时间
2. 查看提交记录
3. 查看统计信息

```
统计信息:
  总提交数: 50
  成功率: 94.0%
  脱敏率: 76.0%
  平均置信度: 0.73
  平均推理延迟: 1456ms
```

### 场景 3: 导出记录备份

1. 定期导出记录
2. 保存到安全位置

```python
logger.export_to_file("~/Backups/submissions_2026-02-28.json")
```

---

## 技术细节

### 记录流程

```
1. 任务完成推理
   ↓
2. 数据脱敏
   ↓
3. 提交到平台
   ↓
4. 记录到本地文件
   ├─ 原始数据
   ├─ 脱敏数据
   ├─ 遥测数据
   └─ 提交状态
```

### 文件操作

- **读取**: 使用 UTF-8 编码读取 JSON 文件
- **写入**: 使用 UTF-8 编码写入 JSON 文件，格式化缩进
- **权限**: 自动设置为 0600（仅所有者可读写）
- **清理**: 超过最大记录数时自动删除最旧的记录

### 性能优化

- **延迟写入**: 记录操作不会阻塞主线程
- **错误处理**: 记录失败不会影响任务提交
- **内存管理**: 自动清理旧记录，防止文件过大

---

## 总结

提交记录功能为用户提供了完整的数据透明度：

✅ **本地保存**: 所有提交记录保存在本地，随时查看  
✅ **脱敏验证**: 对比原始数据和脱敏数据，确保隐私安全  
✅ **统计分析**: 提供详细的统计信息，了解插件运行状况  
✅ **隐私保护**: 文件权限保护，数据仅保存在本地  
✅ **易于使用**: 通过托盘菜单或 Python API 轻松查看  

---

**创建时间**: 2026-02-28  
**版本**: 1.0.0  
**状态**: ✅ 功能完成
