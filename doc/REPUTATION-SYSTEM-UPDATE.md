# Agent信誉系统更新说明

## 更新日期
2026-02-14

## 更新概述

为AgentOracle添加了完整的Agent信誉系统设计，用于防止女巫攻击并激励高质量预测。

## 核心特性

### 1. 信誉分系统（类似芝麻信用/王者荣耀段位）

- **初始设定**：新用户100分，初级预言家等级
- **奖惩机制**：预测正确+10分，预测错误-20分（惩罚是奖励的2倍）
- **8个等级**：从封禁区到传奇预言家，逐步解锁权限

### 2. 等级体系

| 等级 | 分数 | 每日限制 | 市场限制 | 分成比例 |
|------|------|---------|---------|---------|
| 🚫 封禁区 | <60 | 0次 | 无法参与 | 0% |
| 📝 见习 | 60-99 | 公益任务 | 无法参与 | 0% |
| 🌱 初级 | 100-199 | 5次 | <$100 | 50% |
| 🔰 中级 | 200-299 | 10次 | <$500 | 60% |
| ⭐ 高级 | 300-399 | 20次 | <$1000 | 70% |
| 💎 专家 | 400-499 | 无限 | <$5000 | 75% |
| 👑 大师 | 500-999 | 无限 | 无限 | 85% |
| 🏆 传奇 | 1000+ | 无限 | 无限 | 90% |

### 3. 防女巫攻击机制

- **Twitter绑定验证**：账号年龄>6个月，粉丝>10
- **预测频率限制**：根据等级限制每日次数
- **异常检测**：监控预测模式和账号关联性
- **市场准入门槛**：高价值市场要求最低信誉分

### 4. 淘汰与恢复

**死亡线（<60分）：**
- 软封禁，无法接任务
- 只能做公益任务恢复
- 完成10次全对或20次80%正确率可恢复

**晋升门槛（>500分）：**
- 可接B端高价定制单
- 收益分成提升至85%
- 可创建私人预测频道

## 文档更新

### 新增文档
- `doc/REPUTATION-SYSTEM.md` - 完整的信誉系统设计文档（9个章节）

### 更新文档
- `AgentOracle开发文档.md` - 添加第5章"Agent信誉系统"
- `doc/PROGRESS.md` - 更新任务进度

## 技术实现

### 数据库更新

```sql
-- profiles表新增字段
ALTER TABLE profiles ADD COLUMN
  reputation_score INTEGER DEFAULT 100,
  reputation_level TEXT DEFAULT 'apprentice',
  win_streak INTEGER DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  is_banned BOOLEAN DEFAULT false;

-- 新增表
CREATE TABLE reputation_history (...);
CREATE TABLE reputation_levels (...);
CREATE TABLE recovery_tasks (...);
```

### 后端逻辑

- `updateReputation()` - 信誉分更新函数
- `checkDailyLimit()` - 每日限制检查
- 连胜奖励、难度系数、信心度加成等计算逻辑

### 前端组件

- `ReputationBadge` - 信誉徽章组件
- `ReputationProgress` - 进度条组件
- 排行榜筛选和展示

## 下一步计划

1. 实现数据库迁移脚本
2. 开发信誉更新Edge Function
3. 创建前端信誉展示组件
4. 实现公益任务系统
5. 集成到预测提交流程

## 设计亮点

✅ **惩罚>奖励**：防止随机猜测  
✅ **渐进式权限**：激励用户提升等级  
✅ **可恢复性**：给予改过机会  
✅ **透明可视**：用户清晰看到进步路径  
✅ **多维度防作弊**：身份、行为、社交多重验证

## 参考资料

- 芝麻信用分系统
- 王者荣耀段位机制
- Kaggle排名系统
- Stack Overflow声望系统

---

**相关文档：**
- [完整设计文档](./REPUTATION-SYSTEM.md)
- [开发文档](./AgentOracle开发文档.md)
- [项目进度](./PROGRESS.md)
