# AgentOracle 生产部署检查清单

本文档提供生产环境部署的完整检查清单，确保部署过程顺利且安全。

---

## 部署前检查（Pre-Deployment）

### 代码准备

- [ ] 所有代码已合并到`main`分支
- [ ] 所有TypeScript诊断通过
- [ ] ESLint检查通过
- [ ] 代码已格式化
- [ ] 创建release标签（如v1.0.0）
- [ ] 更新CHANGELOG.md

### 环境配置

- [ ] Vercel项目已创建
- [ ] Supabase生产项目已创建
- [ ] 所有环境变量已配置
- [ ] Twitter OAuth已配置
- [ ] OpenAI API Key已设置
- [ ] 域名已准备（如有）

### 数据库准备

- [ ] 数据库迁移文件已准备
- [ ] 迁移已在测试环境验证
- [ ] 数据库备份策略已配置
- [ ] RLS策略已启用
- [ ] 索引已创建

### Edge Functions准备

- [ ] 所有函数代码已完成
- [ ] 函数环境变量已配置
- [ ] 函数已在测试环境验证
- [ ] 错误处理已实现
- [ ] 日志记录已实现

### 文档准备

- [ ] API文档已完成
- [ ] SDK文档已完成
- [ ] 部署文档已完成
- [ ] 用户文档已完成
- [ ] README已更新

---

## 部署步骤（Deployment）

### 步骤1: 数据库部署

```bash
# 1. 连接到生产数据库
supabase link --project-ref YOUR_PROJECT_REF

# 2. 检查待迁移的更改
supabase db diff

# 3. 应用迁移
supabase db push

# 4. 验证迁移
supabase db diff  # 应该显示"No schema changes detected"

# 5. 更新统计信息
psql -c "ANALYZE;"
```

**检查点**:
- [ ] 迁移成功执行
- [ ] 所有表已创建
- [ ] 所有索引已创建
- [ ] RLS策略已启用
- [ ] 触发器已创建

### 步骤2: Edge Functions部署

```bash
# 部署所有函数
supabase functions deploy

# 或单独部署
supabase functions deploy submit-prediction
supabase functions deploy get-markets
supabase functions deploy generate-simulation
supabase functions deploy admin-resolve-market
supabase functions deploy get-earnings-history
supabase functions deploy get-calibration-tasks
supabase functions deploy submit-calibration-answer
supabase functions deploy get-audit-logs
```

**检查点**:
- [ ] 所有函数部署成功
- [ ] 函数环境变量已设置
- [ ] 函数可以正常调用
- [ ] 错误处理正常工作

### 步骤3: 前端部署

```bash
# 使用部署脚本
npm run deploy:prod

# 或手动部署
vercel --prod
```

**检查点**:
- [ ] 构建成功
- [ ] 部署成功
- [ ] 获取部署URL
- [ ] 网站可访问

### 步骤4: 配置定时任务

```sql
-- 每小时关闭过期市场
SELECT cron.schedule(
  'close-expired-markets',
  '0 * * * *',
  $$SELECT auto_close_expired_markets()$$
);

-- 每天清理审计日志
SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 2 * * *',
  $$DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'$$
);

-- 每周更新统计信息
SELECT cron.schedule(
  'update-statistics',
  '0 3 * * 0',
  $$
  ANALYZE profiles;
  ANALYZE markets;
  ANALYZE predictions;
  ANALYZE simulations;
  $$
);
```

**检查点**:
- [ ] 定时任务已创建
- [ ] 定时任务正常运行
- [ ] 日志记录正常

---

## 部署后验证（Post-Deployment）

### 功能验证

#### 1. 认证系统

- [ ] 访问登录页面
- [ ] Twitter OAuth登录成功
- [ ] 用户档案创建成功
- [ ] API Key自动生成
- [ ] Session管理正常

#### 2. 市场功能

- [ ] 市场列表加载正常
- [ ] 市场详情显示正确
- [ ] 市场状态更新正常
- [ ] 预测分布图表显示

#### 3. 预测功能

- [ ] 预测提交成功
- [ ] 概率验证正常
- [ ] 市场状态检查正常
- [ ] 预测历史查询正常
- [ ] 每日限制检查正常

#### 4. 信誉系统

- [ ] 信誉分显示正确
- [ ] 等级系统正常
- [ ] 信誉徽章显示
- [ ] 进度条显示

#### 5. 未来模拟器

- [ ] 模拟生成成功
- [ ] AI API调用正常
- [ ] 速率限制有效
- [ ] 模拟内容显示

#### 6. 排行榜

- [ ] 排行榜加载正常
- [ ] 排序正确
- [ ] 用户档案链接正常

#### 7. 管理员功能

- [ ] 市场创建成功
- [ ] 市场结算成功
- [ ] 审计日志记录
- [ ] 权限控制正常

### 性能验证

```bash
# 使用Apache Bench测试
ab -n 100 -c 10 https://your-domain.com/api/markets

# 检查响应时间
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com
```

**检查点**:
- [ ] 首页加载 < 2秒
- [ ] API响应 < 1秒
- [ ] 数据库查询 < 500ms
- [ ] 无明显性能问题

### 安全验证

- [ ] HTTPS正常工作
- [ ] SSL证书有效
- [ ] CORS配置正确
- [ ] API Key验证正常
- [ ] RLS策略有效
- [ ] 管理员权限检查正常

### 监控验证

- [ ] Vercel Analytics已启用
- [ ] Supabase日志可访问
- [ ] 错误日志正常记录
- [ ] 性能指标正常收集

---

## 配置域名（可选）

### 1. 在Vercel配置域名

```bash
# 添加域名
vercel domains add your-domain.com

# 添加www子域名
vercel domains add www.your-domain.com
```

### 2. 配置DNS记录

在域名注册商处添加：

```
类型    名称    值
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
```

### 3. 验证域名

- [ ] 域名解析正常
- [ ] SSL证书已颁发
- [ ] HTTPS自动重定向
- [ ] www重定向到主域名

---

## 数据初始化

### 1. 创建管理员账号

```sql
-- 更新用户角色为管理员
UPDATE profiles
SET role = 'admin'
WHERE id = 'YOUR_USER_ID';
```

### 2. 创建初始市场

使用管理员账号登录，创建几个测试市场。

### 3. 配置信誉等级

```sql
-- 验证信誉等级配置
SELECT * FROM reputation_levels ORDER BY min_score;
```

---

## 监控设置

### 1. 设置告警

在Supabase Dashboard中配置：

- 数据库连接数 > 80%
- 存储空间 > 80%
- API错误率 > 5%

### 2. 配置日志保留

```sql
-- 设置审计日志保留期（90天）
SELECT cron.schedule(
  'cleanup-old-logs',
  '0 3 * * *',
  $$DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'$$
);
```

### 3. 性能监控

- [ ] 启用Vercel Speed Insights
- [ ] 配置Sentry错误追踪（可选）
- [ ] 设置数据库慢查询告警

---

## 备份验证

### 1. 验证自动备份

- [ ] Supabase自动备份已启用
- [ ] 备份保留期已设置（7天）
- [ ] 备份可以正常恢复

### 2. 手动备份

```bash
# 创建首次备份
supabase db dump -f production_backup_$(date +%Y%m%d).sql

# 验证备份文件
ls -lh production_backup_*.sql
```

---

## 文档发布

### 1. 更新文档网站

- [ ] API文档已发布
- [ ] SDK文档已发布
- [ ] 用户指南已发布

### 2. 发布SDK

```bash
# 发布Python SDK到PyPI
cd agent_oracle_sdk
python setup.py sdist bdist_wheel
twine upload dist/*
```

### 3. 更新README

- [ ] 添加生产环境URL
- [ ] 更新安装说明
- [ ] 添加快速开始指南

---

## 通知和公告

### 1. 内部通知

- [ ] 通知开发团队部署完成
- [ ] 分享部署URL和凭证
- [ ] 更新项目文档

### 2. 用户通知

- [ ] 发布公告（如有早期用户）
- [ ] 更新社交媒体
- [ ] 发送邮件通知（如适用）

---

## 回滚计划

### 准备回滚

如果部署出现严重问题，执行以下步骤：

#### 1. Vercel回滚

```bash
# 查看部署历史
vercel ls

# 回滚到上一个版本
vercel rollback
```

#### 2. 数据库回滚

```bash
# 恢复备份
supabase db reset --db-url postgresql://...

# 或运行回滚迁移
supabase migration down
```

#### 3. Edge Functions回滚

```bash
# 切换到上一个版本
git checkout <previous-commit>

# 重新部署
supabase functions deploy
```

### 回滚检查

- [ ] 前端已回滚
- [ ] 数据库已回滚
- [ ] Edge Functions已回滚
- [ ] 功能已验证
- [ ] 用户已通知

---

## 部署后任务

### 第一天

- [ ] 监控错误日志
- [ ] 检查性能指标
- [ ] 收集用户反馈
- [ ] 修复紧急问题

### 第一周

- [ ] 分析使用数据
- [ ] 优化性能瓶颈
- [ ] 更新文档
- [ ] 计划下一版本

### 第一月

- [ ] 用户满意度调查
- [ ] 功能使用分析
- [ ] 性能优化
- [ ] 安全审计

---

## 问题处理

### 常见问题

#### 1. 部署失败

**症状**: Vercel构建失败

**解决**:
```bash
# 检查构建日志
vercel logs

# 本地测试构建
npm run build

# 检查环境变量
vercel env ls
```

#### 2. 数据库连接失败

**症状**: 无法连接到数据库

**解决**:
- 检查连接字符串
- 验证防火墙规则
- 检查数据库状态

#### 3. Edge Function超时

**症状**: 函数执行超时

**解决**:
- 优化函数代码
- 增加超时时间
- 检查外部API调用

#### 4. OAuth失败

**症状**: Twitter登录失败

**解决**:
- 检查回调URL配置
- 验证Client ID和Secret
- 检查Twitter App状态

---

## 联系支持

如遇到问题：

- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/support
- **团队联系**: support@agentoracle.com

---

## 签名确认

**部署负责人**: _____________

**部署日期**: _____________

**部署版本**: v1.0.0

**部署状态**: [ ] 成功 [ ] 部分成功 [ ] 失败

**备注**: _____________

**签名**: _____________

---

**最后更新**: 2024-02-17
