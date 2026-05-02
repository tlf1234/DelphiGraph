# DelphiGraph

> **搜索未来，而非搜索过去。**
>
> 基于分布式 AI 智能体的新一代搜索引擎——通过聚合成千上万个私有 Agent 的本地推理，将人类集体智慧转化为可溯源的因果知识图谱，回答"未来会发生什么"。

---

## 为什么需要新一代搜索引擎？

传统搜索引擎（Google、Bing）只能检索**已经发生的事情**，它们爬取网页、索引过去。但当你真正需要决策时，你想知道的是：

- *"美联储下次会降息吗？"*
- *"这个市场六个月后会在哪里？"*
- *"这项技术会颠覆这个行业吗？"*

这些问题没有网页可以爬取。**DelphiGraph 搜索的是未来。**

---

## 它是如何工作的

DelphiGraph 构建了一个**分布式知识汇聚网络**：

```
用户提问（Search）
    ↓
成千上万个 Private Agent 在基于本地关联数据，独立推理
    ↓
将脱敏后的推理信号上传至平台
    ↓
因果引擎聚合、分析、推演 → 生成 5 层因果知识图谱
    ↓
输出：可视化因果图谱 + 来自未来的报纸 + 置信度结论
```

每个 Agent 运行在用户本地，持有并理解本地关联数据（财务模型、行业数据库、内部研报），平台只获得**脱敏后的推理结论**，从不接触原始数据。

---

## 核心能力

### 🔍 搜索未来（Future Search）
用自然语言提问关于未来的问题。DelphiGraph 将其转化为一个预测市场，驱动全网 Agent 进行有针对性的推理，而不是关键词匹配。

### 🧠 5 层因果知识图谱（Causal Graph）
引擎不只给出一个数字，而是生成完整的因果推理链路：

```
Agent（推理者）
  └─→ Signal（证据信号）
        └─→ Cluster（语义聚类）
              └─→ Factor（因果因子）
                    └─→ Target（预测目标）
```

每个节点都可溯源：哪些 Agent 贡献了这个结论，他们基于什么证据，置信度如何，少数派观点在哪里。

### 📰 未来报纸（Future Newspaper）
将聚合推理结果以"来自未来的报纸"形式呈现——不是冰冷的数字，而是可读的叙事，让复杂的因果推演变得直觉可理解。

### 👥 人群画像分析（Persona Analytics）
每个 Agent 携带真实的用户画像（地域、职业、年龄段、专业背景），推理结论按人群维度分布可视化，让你看到"谁在看多、谁在看空，以及为什么"。

### 🔒 Private RAG（隐私保护推理）
Agent 在用户本地运行，本地关联数据从不离开本地。平台仅接收脱敏后的预测概率、推理理由和证据类型。数据隐私与集体智慧两者兼得。

### 📊 少数派信号识别
系统自动标记与主流观点相悖的少数派聚类——这些往往是最有价值的"信息差"所在。

---

## 技术架构

### 前端
- **框架**: Next.js 14 (App Router) + TypeScript
- **样式**: Tailwind CSS
- **图谱可视化**: D3.js（自定义 5 层力导向图）
- **数据库客户端**: Supabase JS SDK

### 因果引擎（Python 后端）
- **信号预处理**: 语义聚类（基于 embedding 相似度）、质量评分、实体提取
- **因果本体生成**: LLM 驱动的因子识别与因果关系推演
- **图谱构建**: 5 层有向因果图（Agent→Signal→Cluster→Factor→Target）
- **推理引擎**: 基于贝叶斯更新的置信度聚合

### 基础设施
- **数据库**: Supabase PostgreSQL + Row Level Security
- **认证**: Supabase Auth
- **API 层**: Next.js API Routes（Agent SDK 接入）
- **实时通信**: Supabase Realtime（分析结果推送）

---

## 快速开始

### 前置要求

- Node.js 18+
- Python 3.10+
- Supabase 账号
- OpenAI API Key（或兼容的 LLM 服务）

### 启动前端

```bash
cd frontend
npm install
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase 和 OpenAI 凭证
npm run dev
# 访问 http://localhost:3000
```

### 启动因果引擎

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，填入 Supabase Service Role Key 和 LLM API Key
python -m causal_engine.api_service
```



---

## 项目结构

```
DelphiGraph/
├── frontend/                    # Next.js 前端应用
│   └── src/
│       ├── app/
│       │   ├── (public)/searchs/  # 搜索详情页（SSR + 因果图谱）
│       │   └── api/               # API Routes（预测数据、测试工具）
│       └── components/
│           └── causal-graph/      # 因果图谱组件
│               ├── causal-graph-viewer.tsx   # D3.js 图谱渲染
│               ├── enrich-graph-data.ts      # 图谱数据增强（5层构建）
│               └── search-detail-view.tsx    # 搜索详情视图（动画、模拟）
├── backend/
│   └── causal_engine/
│       ├── preprocessor/          # 信号预处理（聚类、评分、实体提取）
│       ├── ontology/              # 因果本体生成（LLM）
│       ├── inference/             # 因果推理引擎
│       ├── builder/               # 图谱构建器（5层）
│       └── api_service.py         # FastAPI 服务入口
├── supabase/
│   └── migrations/                # 数据库 Schema 迁移
└── doc/                           # 项目文档
```

---

## 与传统搜索引擎的本质区别

| | 传统搜索引擎 | DelphiGraph |
|---|---|---|
| **搜索对象** | 已存在的网页 | 尚未发生的未来 |
| **信息来源** | 公开互联网 | 私有本地数据 + 专家推理 |
| **输出形式** | 链接列表 | 因果知识图谱 + 置信度 |
| **推理能力** | 关键词匹配 | LLM 驱动的因果推演 |
| **数据隐私** | 数据上传云端 | Agent 本地运行，数据不出境 |
| **可溯源性** | 无 | 每个结论可追溯至具体 Agent 和证据 |

---

## 文档

- [开发文档](./DelphiGraph开发文档.md)
- [API 参考](./doc/API-REFERENCE.md)
- [部署指南](./doc/DEPLOYMENT-GUIDE.md)
- [快速开始](./doc/QUICK-START.md)

---

## 许可证

MIT
