# 搜索框打字机效果功能

## 概述

为首页搜索框添加了动态打字机效果，通过展示具体的高价值问题来引导新用户理解平台的使用场景。

## 功能特性

### 1. 打字机动画效果

搜索框的 placeholder 会像打字机一样自动轮播展示问题：
- 逐字输入动画
- 停顿展示完整问题
- 逐字删除动画
- 切换到下一个问题
- 无限循环

### 2. 视觉光标

在打字机文本后添加了闪烁的光标效果，使动画更加逼真：
- 绿色竖线光标
- 脉冲动画效果
- 与文本同步显示

### 3. 智能隐藏

打字机效果会在以下情况下自动隐藏：
- 用户聚焦搜索框时
- 用户开始输入时
- 搜索框有内容时

### 4. 国际化支持

根据用户选择的语言显示不同的问题列表：

**中文问题示例：**
- 2026年 Q3 英伟达财报会超预期吗？
- 下周比特币会突破 10 万美元吗？
- GPT-5 会在 2025 年发布吗？
- 程序员最喜欢的 IDE 是什么？
- 特斯拉 2025 年销量能达到 300 万辆吗？
- 下一届美国总统会是谁？
- AI 会在 2026 年通过图灵测试吗？
- 苹果会在 2025 年推出 AR 眼镜吗？

**英文问题示例：**
- Will NVIDIA Q3 2026 earnings beat expectations?
- Will Bitcoin break $100K next week?
- Will GPT-5 be released in 2025?
- What is the most popular IDE among developers?
- Will Tesla sell 3M vehicles in 2025?
- Who will be the next US President?
- Will AI pass the Turing Test in 2026?
- Will Apple launch AR glasses in 2025?

## 技术实现

### 新增文件

#### 1. `hooks/use-typewriter.ts`
自定义 React Hook，实现打字机效果逻辑：

```typescript
interface TypewriterOptions {
  words: string[]           // 要轮播的文本数组
  typeSpeed?: number        // 打字速度（毫秒/字符）
  deleteSpeed?: number      // 删除速度（毫秒/字符）
  delayBetweenWords?: number // 单词间停顿时间
  loop?: boolean            // 是否循环
}
```

**特性：**
- 状态管理：当前文本、索引、删除状态、暂停状态
- 定时器控制：使用 setTimeout 实现动画
- 自动清理：组件卸载时清理定时器
- 循环播放：支持无限循环或单次播放

#### 2. 更新 `components/search/search-box.tsx`
集成打字机效果到搜索框：

**关键改动：**
- 导入 `useTypewriter` hook
- 导入 `useTranslation` hook 获取语言设置
- 根据语言选择问题列表
- 使用绝对定位的 div 显示打字机文本
- 添加闪烁光标效果
- 条件渲染：仅在未聚焦且无输入时显示

### 动画参数

```typescript
const typewriterText = useTypewriter({
  words: placeholderQuestions,
  typeSpeed: 80,           // 打字速度：80ms/字符
  deleteSpeed: 40,         // 删除速度：40ms/字符（更快）
  delayBetweenWords: 2500, // 停顿时间：2.5秒
  loop: true,              // 无限循环
})
```

### CSS 实现

```tsx
{/* 打字机效果的 placeholder */}
{!isFocused && !query && (
  <div className="absolute inset-0 flex items-center pointer-events-none">
    <span className="text-zinc-500 text-xl">
      {typewriterText}
      <span className="inline-block w-0.5 h-5 bg-emerald-400 ml-1 animate-pulse" />
    </span>
  </div>
)}
```

**关键样式：**
- `absolute inset-0`：覆盖整个输入框
- `pointer-events-none`：不阻止输入框交互
- `animate-pulse`：光标闪烁效果
- `text-zinc-500`：与原 placeholder 颜色一致

## 用户体验优势

### 1. 隐形的新手引导

通过展示具体问题，用户可以：
- 理解平台的使用场景
- 了解可以提问的问题类型
- 获得提问灵感
- 降低首次使用门槛

### 2. 提升参与度

动态效果吸引用户注意：
- 视觉吸引力强
- 展示平台的专业性
- 传达"未来感"的品牌调性

### 3. 教育价值

展示的问题涵盖多个领域：
- 科技（英伟达、GPT-5、AI）
- 金融（比特币）
- 商业（特斯拉、苹果）
- 政治（美国总统）
- 开发者工具（IDE）

### 4. 无干扰设计

- 用户聚焦时立即消失
- 不影响正常输入体验
- 保持搜索框的简洁性

## 性能考虑

### 优化措施

1. **定时器管理**
   - 使用 `useRef` 存储定时器引用
   - 组件卸载时自动清理
   - 避免内存泄漏

2. **条件渲染**
   - 仅在需要时渲染打字机文本
   - 减少不必要的 DOM 更新

3. **动画性能**
   - 使用 CSS `animate-pulse` 而非 JS 动画
   - 利用浏览器硬件加速

## 未来优化建议

1. **动态问题加载**
   - 从 API 获取热门问题
   - 根据用户兴趣个性化问题
   - 展示实时热门预测市场

2. **可点击的问题**
   - 点击打字机文本直接搜索
   - 快速跳转到相关市场

3. **更多动画效果**
   - 添加淡入淡出效果
   - 字符颜色渐变
   - 更丰富的光标样式

4. **A/B 测试**
   - 测试不同的问题集合
   - 优化动画速度参数
   - 分析用户参与度提升

5. **可配置性**
   - 管理后台配置问题列表
   - 支持多语言问题管理
   - 实时更新问题内容

## 测试建议

1. **功能测试**
   - 验证打字机动画正常播放
   - 测试语言切换时问题列表更新
   - 确认聚焦时动画消失
   - 测试输入时动画隐藏

2. **性能测试**
   - 检查内存泄漏
   - 验证定时器正确清理
   - 测试长时间运行的稳定性

3. **兼容性测试**
   - 不同浏览器的动画效果
   - 移动端的显示效果
   - 不同屏幕尺寸的适配

4. **用户体验测试**
   - 观察新用户的反应
   - 收集用户反馈
   - 分析搜索使用率变化

## 更新日期

2024-02-18
