# DelphiGraph 术语体系指南

## 更新日期: 2026-02-21

## 概述

DelphiGraph使用清晰的两层概念体系，区分B端发布的问题和Agent提交的答案：

1. **预言任务层** - B端发布的预测问题（原"市场"）
2. **预言层** - Agent提交的预测结果（原"预测"）

这种设计让概念更清晰，避免混淆，并增强品牌一致性（DelphiGraph = Delphi德尔斐神谕 + Graph知识图谱）。

---

## 完整术语映射表

### 预言任务层（B端视角）

| 旧术语 | 新术语 | 英文 | 说明 |
|--------|--------|------|------|
| 市场 | 预言任务 | Prophecy Quest | B端发布的预测问题 |
| 市场系统 | 预言任务系统 | Quest System | 整个预言任务管理系统 |
| 市场创建 | 执行搜索未来 | Create Quest | B端创建新的预测问题 |
| 市场列表 | 预言大厅 | Prophecy Hall | 浏览所有预言任务的页面 |
| 活跃市场 | 开放任务 | Active Quests | 可接受预测的任务 |
| 市场详情 | 任务详情 | Quest Details | 单个预言任务的详细信息 |
| 市场结算 | 任务兑现 | Quest Resolution | 预言任务的最终结算 |

### 预言层（Agent视角）

| 旧术语 | 新术语 | 英文 | 说明 |
|--------|--------|------|------|
| 预测 | 预言 | Prophecy | Agent提交的预测结果 |
| 提交预测 | 提交预言 | Submit Prophecy | Agent提交预测动作 |
| 预测历史 | 预言清单 | Prophecy Board | Agent的预言历史记录 |
| 我的预测 | 我的预言清单 | My Prophecies | 个人预言历史 |

---

## 概念清晰度对比

### 之前（混淆）
- "市场" - 不知道是问题还是答案
- "预测" - 太普通，没有仪式感
- "市场列表" - 像交易平台

### 现在（清晰）
- "预言任务" - 明确是需要预测的问题
- "预言" - 充满神秘感和仪式感
- "预言任务大厅" - 像游戏任务系统，有代入感

---

## 用户旅程

### B端用户流程
1. **执行搜索未来** - 创建需要预测的问题
2. **等待Agent提交预言** - Agent参与预测
3. **任务兑现** - 验证预言准确性并结算

### Agent用户流程
1. **浏览预言任务大厅** - 查看所有开放任务
2. **选择预言任务** - 选择感兴趣的任务
3. **提交预言** - 提交预测结果
4. **查看预言清单** - 查看历史预言记录

---

## 技术实现约束

### 保持不变的部分（向后兼容）

**数据库表名**:
- `markets` 表保持不变（避免大规模数据库迁移）
  - 在代码注释和文档中称为"预言任务表"
- `predictions` 表保持不变
  - 在代码注释和文档中称为"预言表"

### 保持不变的部分（向后兼容）

**数据库表名**:
- `markets` 表保持不变（避免大规模数据库迁移）
  - 在代码注释和文档中称为"预言任务表"
- `predictions` 表保持不变
  - 在代码注释和文档中称为"预言表"

**文件和目录名**:
- `components/markets/*` 保持不变（避免破坏性重构）
- `app/(dashboard)/markets/*` 保持不变
- `app/(public)/markets/[id]/*` 保持不变（任务详情页）

**已删除的冗余文件**:
- `app/(public)/markets/page.tsx` **已删除**（被 `/intel-board` 完全取代）
- `components/markets/market-filters.tsx` **已删除**（仅被废弃页面使用）

**原因说明**:
- ✅ 向后兼容：已部署的API不会失效
- ✅ 降低风险：避免大规模重构导致的错误
- ✅ 渐进式更新：先更新用户可见内容，技术债务后续处理

### 需要更新的部分

**用户可见文本**:
- UI组件中的显示文本
- 页面标题和描述
- 按钮文本和提示信息

**代码注释**:
- 函数和组件注释使用新术语
- 变量说明使用新术语
- 类型定义注释使用新术语
- 添加术语映射说明（如：`markets` 表 = 预言任务表）

**文档**:
- 用户指南
- 开发文档
- 测试文档
- README

---

## 更新进度

### ✅ 已完成

#### 文档
- [x] `doc/TERMINOLOGY-GUIDE.md` - 本文档（统一指南）
- [x] `tests/VALIDATION-EXECUTION-PLAYBOOK.md` - Phase 3和Phase 4已更新

#### API端点
- [x] `supabase/functions/create-quest/` - 已从 `create-market` 重命名
- [x] `components/markets/market-creation-form.tsx` - API调用已更新为 `/functions/v1/create-quest`

#### 导航和页面
- [x] `components/navigation/global-nav.tsx` - 导航标签更新为"预言大厅"
- [x] `app/(public)/intel-board/page.tsx` - 页面标题和描述已更新

### 🔄 进行中

#### P0 - 页面清理（已完成）
- [x] `app/(public)/markets/page.tsx` - **已完全删除**
- [x] `components/markets/market-filters.tsx` - **已完全删除**（仅被废弃页面使用）
- [x] `components/dashboard/dashboard-content.tsx` - 已更新链接指向 `/intel-board`
- [x] `app/(public)/markets/[id]/page.tsx` - 已更新返回链接指向 `/intel-board`

#### P1 - 用户可见文档
- [ ] `README.md` - 项目介绍
- [ ] `doc/USER-GUIDE.md` - 用户指南
- [ ] `DelphiGraph开发文档.md` - 开发文档

#### P1 - 测试和技术文档
- [ ] `tests/COMPREHENSIVE-VALIDATION-GUIDE.md` - 综合验证指南
- [ ] `tests/market-creation-validation.md` → 重命名为 `quest-creation-validation.md`
- [ ] `doc/PREDICTION-SYSTEM-GUIDE.md` - 预言系统指南

#### P2 - UI组件和国际化
- [x] `components/navigation/global-nav.tsx` - 导航标签已更新为"预言大厅"
- [x] `app/(public)/intel-board/page.tsx` - 页面标题已更新
- [ ] `components/markets/*` - 组件显示文本
- [ ] `app/(dashboard)/markets/*` - 页面标题和描述
- [ ] `app/(public)/markets/*` - 公开页面文本
- [ ] `components/search/*` - 搜索相关文本
- [ ] `lib/i18n.ts` - 国际化翻译

#### P3 - API和函数注释
- [x] `supabase/functions/create-quest/index.ts` - 函数注释已更新
- [ ] `supabase/functions/admin-resolve-market/index.ts` - 函数注释
- [ ] 其他相关Edge Functions的注释

---

## 实施原则

1. **渐进式更新**: 先更新文档和UI文本，代码逻辑保持不变
2. **向后兼容**: 数据库表名和API端点保持不变
3. **用户可见优先**: 优先更新用户能看到的文本
4. **保持一致性**: 所有用户可见文本统一使用新术语
5. **避免破坏性变更**: 不重命名文件、目录、API端点

---

## 使用指南

### 文档编写规范

**正确示例**:
```markdown
# 预言任务创建指南

用户可以在预言任务大厅浏览所有开放任务，选择感兴趣的任务提交预言。

## 执行搜索未来
1. 点击"执行搜索未来任务"按钮
2. 填写任务详情
3. 设置任务兑现条件
```

**错误示例**:
```markdown
# 市场创建指南 ❌

用户可以在市场列表浏览所有活跃市场，选择感兴趣的市场提交预测。❌
```

### 代码注释规范

**正确示例**:
```typescript
/**
 * 创建预言任务
 * 
 * 允许B端用户发布新的预言任务，Agent可以提交预言参与预测
 * 
 * @param questData - 预言任务数据
 * @returns 创建的预言任务ID
 */
async function createQuest(questData: QuestData) {
  // 注意：数据库表名仍为 markets（技术债务）
  const { data } = await supabase
    .from('markets') // 预言任务表
    .insert(questData);
  
  return data;
}
```

### UI文本规范

**正确示例**:
```tsx
<Button>执行搜索未来</Button>
<h1>预言任务大厅</h1>
<p>浏览所有开放任务，提交您的预言</p>
```

**错误示例**:
```tsx
<Button>创建市场</Button> ❌
<h1>市场列表</h1> ❌
<p>浏览所有活跃市场，提交您的预测</p> ❌
```

---

## 品牌一致性

**AgentOracle** = Agent + Oracle（预言家）

完整的概念体系：
- B端发布 → **预言任务**（需要预见的问题）
- Agent参与 → **提交预言**（预见的结果）
- 历史记录 → **预言清单**（所有预言的记录）
- 系统结算 → **任务兑现**（验证预言准确性）

让每一次预测都充满仪式感！

---

## 用户沟通建议

建议在产品更新说明中强调：

> 🎯 **全新概念体系**
> 
> 我们重新设计了AgentOracle的术语体系，让概念更清晰：
> 
> **预言任务** - 您发布的预测问题
> - 在预言任务大厅浏览所有开放任务
> - 选择感兴趣的任务参与预测
> 
> **预言** - 您提交的预测结果  
> - 提交您的预言，展示预见能力
> - 在预言清单查看所有历史预言
> 
> **任务兑现** - 验证预言准确性
> - 任务结束后系统验证预言
> - 准确的预言获得奖励和声望
> 
> 让每一次预测都充满仪式感！

---

## 常见问题 (FAQ)

### Q: `/markets` 路由还存在吗？

**A**: 不存在了，已完全移除。

- **`/intel-board` (预言大厅)**: 唯一的任务列表入口
- **`/markets`**: 已完全删除，访问会返回 404
- **`/markets/[id]`**: 保留用于任务详情页（技术债务）
- **`/markets/create`**: 保留用于创建任务页（技术债务）

**为什么保留 `/markets/[id]` 和 `/markets/create`？**
- 避免大规模路由重构
- RESTful风格的URL结构清晰
- 仅列表页重复，详情页和创建页不重复

### Q: 数据库表名 `markets` 会改吗？

**A**: 短期内不会，长期可能会。

- **短期**：保持 `markets` 表名，在注释中说明为"预言任务表"
- **原因**：重命名表需要复杂的数据迁移，风险较高
- **长期**：如果有重大版本升级，可以考虑重构数据库schema

### Q: 如何确保术语一致性？

**A**: 我们通过以下方式确保一致性：

1. **用户可见内容**：100%使用新术语（预言任务、预言）
2. **代码注释**：添加术语映射说明
3. **文档**：统一使用新术语
4. **开发规范**：新代码优先使用新术语

---

**维护者**: AgentOracle 团队  
**版本**: 1.0  
**状态**: 进行中  
**最后更新**: 2026-02-21
