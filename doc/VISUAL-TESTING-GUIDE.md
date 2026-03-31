# DelphiGraph 视觉回归测试指南

## 概述

本文档提供DelphiGraph平台的视觉回归测试（Visual Regression Testing）完整指南，包括测试方法、工具配置、最佳实践和故障排除。

## 目录

1. [什么是视觉回归测试](#什么是视觉回归测试)
2. [为什么需要视觉测试](#为什么需要视觉测试)
3. [测试工具选择](#测试工具选择)
4. [Playwright配置](#playwright配置)
5. [编写测试用例](#编写测试用例)
6. [测试执行](#测试执行)
7. [CI/CD集成](#cicd集成)
8. [故障排除](#故障排除)
9. [最佳实践](#最佳实践)

---

## 什么是视觉回归测试

视觉回归测试是一种自动化测试方法，通过对比新旧版本的页面截图来检测UI变化。它可以：

- 自动发现布局错乱
- 检测样式丢失
- 验证颜色变化
- 确保响应式设计正确
- 验证跨浏览器兼容性

### 工作原理

```
1. 基准截图（Baseline）
   ↓
2. 代码更新
   ↓
3. 新截图（Current）
   ↓
4. 像素级对比
   ↓
5. 生成差异报告
```

---

## 为什么需要视觉测试

### DelphiGraph特定需求

1. **Bloomberg Terminal主题一致性**
   - 深色背景色系（#0a0e27, #1a1f3a, #2a3f5f）
   - 霓虹绿/蓝主色调（#00ff88, #00d4ff）
   - 特殊状态颜色（炼狱橙色、成功绿色、错误红色）

2. **复杂组件验证**
   - Recharts图表渲染
   - 信誉徽章和进度条
   - Framer Motion动画效果
   - 响应式网格布局

3. **多状态测试**
   - 加载状态（骨架屏）
   - 空状态（无数据提示）
   - 错误状态（Toast通知）
   - 交互状态（悬停、活跃、禁用）

4. **响应式设计**
   - 桌面端（1920x1080）
   - 平板端（768x1024）
   - 移动端（375x667）
   - 汉堡菜单

5. **跨浏览器兼容性**
   - Chrome/Edge
   - Firefox
   - Safari
   - 移动浏览器

---

## 测试工具选择

### 推荐工具对比

| 工具 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **Playwright** | 快速、免费、本地运行 | 需要手动管理基准 | 开发阶段、CI/CD |
| **Percy** | 云端对比、协作友好 | 付费、依赖网络 | 团队协作、生产环境 |
| **Chromatic** | Storybook集成 | 需要Storybook | 组件库项目 |
| **BackstopJS** | 配置灵活 | 配置复杂 | 高级定制需求 |

### 本指南选择：Playwright

原因：
- ✅ 免费开源
- ✅ 快速执行
- ✅ 支持多浏览器
- ✅ 易于集成CI/CD
- ✅ 强大的API

---

## Playwright配置

### 1. 安装依赖

```bash
# 安装Playwright
npm install -D @playwright/test

# 安装浏览器
npx playwright install

# 安装系统依赖（Linux）
npx playwright install-deps
```

### 2. 创建配置文件

创建 `playwright.config.ts`：

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // 测试目录
  testDir: './tests/visual',
  
  // 并行执行
  fullyParallel: true,
  
  // CI环境禁止.only
  forbidOnly: !!process.env.CI,
  
  // 重试次数
  retries: process.env.CI ? 2 : 0,
  
  // 工作线程数
  workers: process.env.CI ? 1 : undefined,
  
  // 测试报告
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  // 全局配置
  use: {
    // 基础URL
    baseURL: 'http://localhost:3000',
    
    // 追踪
    trace: 'on-first-retry',
    
    // 截图
    screenshot: 'only-on-failure',
    
    // 视频
    video: 'retain-on-failure',
  },

  // 测试项目（不同浏览器和设备）
  projects: [
    // 桌面浏览器
    {
      name: 'Desktop Chrome',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'Desktop Firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'Desktop Safari',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    
    // 移动设备
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    
    // 平板设备
    {
      name: 'Tablet',
      use: {
        ...devices['iPad Pro'],
        viewport: { width: 1024, height: 768 },
      },
    },
  ],

  // 开发服务器
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
```

### 3. 创建测试目录结构

```
tests/
├── visual/
│   ├── auth.spec.ts          # 认证页面测试
│   ├── dashboard.spec.ts     # 仪表盘测试
│   ├── markets.spec.ts       # 市场页面测试
│   ├── purgatory.spec.ts     # 炼狱模式测试
│   ├── profile.spec.ts       # 用户档案测试
│   └── helpers/
│       ├── auth.ts           # 登录辅助函数
│       └── setup.ts          # 测试设置
└── visual-snapshots/         # 基准截图（自动生成）
```

---

## 编写测试用例

### 1. 登录辅助函数

创建 `tests/visual/helpers/auth.ts`：

```typescript
import { Page } from '@playwright/test'

export async function login(page: Page) {
  // 方法1：使用测试账号直接登录
  await page.goto('/login')
  
  // 如果有测试环境的直接登录方式
  await page.evaluate(() => {
    localStorage.setItem('supabase.auth.token', 'test-token')
  })
  
  // 方法2：模拟OAuth流程（需要配置测试OAuth应用）
  // await page.click('[data-testid="twitter-login"]')
  // await page.fill('[name="username"]', process.env.TEST_USERNAME!)
  // await page.fill('[name="password"]', process.env.TEST_PASSWORD!)
  // await page.click('[type="submit"]')
  
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
}

export async function loginAsAdmin(page: Page) {
  await login(page)
  // 设置管理员权限
  await page.evaluate(() => {
    localStorage.setItem('user_role', 'admin')
  })
}
```

### 2. 基础页面测试

创建 `tests/visual/dashboard.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('仪表盘页面', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('主仪表盘 - 桌面端', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // 等待关键元素加载
    await page.waitForSelector('[data-testid="dashboard-stats"]')
    
    // 截图
    await expect(page).toHaveScreenshot('dashboard-desktop.png', {
      fullPage: true,
      animations: 'disabled',
      timeout: 10000,
    })
  })

  test('主仪表盘 - 加载状态', async ({ page }) => {
    // 拦截API请求以模拟加载状态
    await page.route('**/api/**', route => route.abort())
    
    await page.goto('/dashboard')
    
    // 截取骨架屏
    await expect(page).toHaveScreenshot('dashboard-loading.png', {
      animations: 'disabled',
    })
  })

  test('主仪表盘 - 空状态', async ({ page }) => {
    // 模拟空数据
    await page.route('**/api/markets', route => 
      route.fulfill({ json: { data: [] } })
    )
    
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('dashboard-empty.png')
  })
})
```

### 3. 市场页面测试

创建 `tests/visual/markets.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('市场页面', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('市场列表 - 网格布局', async ({ page }) => {
    await page.goto('/markets')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('markets-list.png', {
      fullPage: true,
    })
  })

  test('市场详情 - 预测图表', async ({ page }) => {
    await page.goto('/markets/test-market-id')
    await page.waitForLoadState('networkidle')
    
    // 等待图表渲染
    await page.waitForSelector('.recharts-wrapper')
    
    await expect(page).toHaveScreenshot('market-detail.png', {
      fullPage: true,
    })
  })

  test('市场筛选 - 活跃状态', async ({ page }) => {
    await page.goto('/markets')
    await page.click('[data-filter="active"]')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('markets-filtered-active.png')
  })
})
```

### 4. 响应式测试

创建 `tests/visual/responsive.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
]

test.describe('响应式设计', () => {
  for (const viewport of viewports) {
    test(`导航栏 - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await login(page)
      await page.goto('/dashboard')
      
      await expect(page).toHaveScreenshot(
        `nav-${viewport.name}.png`,
        { fullPage: false }
      )
    })

    test(`市场列表 - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await login(page)
      await page.goto('/markets')
      await page.waitForLoadState('networkidle')
      
      await expect(page).toHaveScreenshot(
        `markets-${viewport.name}.png`,
        { fullPage: true }
      )
    })
  }

  test('移动端汉堡菜单', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await login(page)
    await page.goto('/dashboard')
    
    // 点击汉堡菜单
    await page.click('[data-testid="mobile-menu-button"]')
    await page.waitForSelector('[data-testid="mobile-menu"]')
    
    await expect(page).toHaveScreenshot('mobile-menu-open.png')
  })
})
```

### 5. 交互状态测试

创建 `tests/visual/interactions.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('交互状态', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('按钮悬停状态', async ({ page }) => {
    await page.goto('/markets')
    
    // 悬停在按钮上
    await page.hover('[data-testid="create-prediction-button"]')
    
    await expect(page).toHaveScreenshot('button-hover.png', {
      clip: { x: 0, y: 0, width: 200, height: 100 },
    })
  })

  test('导航活跃状态', async ({ page }) => {
    await page.goto('/markets')
    
    // 市场导航应该高亮
    await expect(page).toHaveScreenshot('nav-active-markets.png', {
      clip: { x: 0, y: 0, width: 1920, height: 80 },
    })
  })

  test('表单验证错误', async ({ page }) => {
    await page.goto('/markets/test-id')
    
    // 提交空表单
    await page.click('[data-testid="submit-prediction"]')
    
    // 等待错误提示
    await page.waitForSelector('[data-testid="error-message"]')
    
    await expect(page).toHaveScreenshot('form-validation-error.png')
  })

  test('Toast通知', async ({ page }) => {
    await page.goto('/settings')
    
    // 触发成功通知
    await page.click('[data-testid="regenerate-api-key"]')
    await page.click('[data-testid="confirm-regenerate"]')
    
    // 等待Toast出现
    await page.waitForSelector('[data-testid="toast"]')
    
    await expect(page).toHaveScreenshot('toast-success.png')
  })
})
```

### 6. 炼狱模式测试

创建 `tests/visual/purgatory.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('炼狱模式', () => {
  test('普通用户视图', async ({ page }) => {
    await login(page)
    await page.goto('/purgatory')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('purgatory-public.png', {
      fullPage: true,
    })
  })

  test('炼狱用户视图', async ({ page }) => {
    await login(page)
    
    // 设置炼狱状态
    await page.evaluate(() => {
      localStorage.setItem('user_status', 'restricted')
    })
    
    await page.goto('/purgatory')
    await page.waitForLoadState('networkidle')
    
    // 应该看到校准任务
    await page.waitForSelector('[data-testid="calibration-tasks"]')
    
    await expect(page).toHaveScreenshot('purgatory-restricted.png', {
      fullPage: true,
    })
  })

  test('炼狱导航徽章', async ({ page }) => {
    await login(page)
    
    await page.evaluate(() => {
      localStorage.setItem('user_status', 'restricted')
    })
    
    await page.goto('/dashboard')
    
    // 炼狱导航应该有红色徽章
    await expect(page).toHaveScreenshot('nav-purgatory-badge.png', {
      clip: { x: 0, y: 0, width: 1920, height: 80 },
    })
  })
})
```

---

## 测试执行

### 本地执行

```bash
# 首次运行：生成基准截图
npx playwright test --update-snapshots

# 运行所有测试
npx playwright test

# 运行特定测试文件
npx playwright test tests/visual/dashboard.spec.ts

# 运行特定浏览器
npx playwright test --project="Desktop Chrome"

# 调试模式
npx playwright test --debug

# 查看测试报告
npx playwright show-report
```

### 更新基准截图

当UI有意更新时：

```bash
# 更新所有截图
npx playwright test --update-snapshots

# 更新特定测试的截图
npx playwright test dashboard.spec.ts --update-snapshots

# 更新特定浏览器的截图
npx playwright test --project="Desktop Chrome" --update-snapshots
```

### 查看差异

测试失败时，Playwright会生成差异报告：

```bash
# 查看HTML报告
npx playwright show-report

# 报告包含：
# - 基准截图（Expected）
# - 当前截图（Actual）
# - 差异高亮（Diff）
```

---

## CI/CD集成

### GitHub Actions配置

创建 `.github/workflows/visual-tests.yml`：

```yaml
name: Visual Regression Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm install --no-workspaces
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Setup Supabase
        run: |
          npx supabase start
          npx supabase db reset --db-url $DATABASE_URL
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: Run visual tests
        run: npx playwright test
        env:
          CI: true
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
      
      - name: Upload failed screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: failed-screenshots
          path: test-results/
          retention-days: 30
      
      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: daun/playwright-report-comment@v3
        with:
          report-url: ${{ steps.upload.outputs.artifact-url }}
```

### 配置环境变量

在GitHub仓库设置中添加：

```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=...
```

---

## 故障排除

### 问题1：截图不稳定（Flaky Tests）

**症状**：同样的代码，截图有时通过有时失败

**原因**：
- 动画未完成
- 异步加载未完成
- 时间戳等动态内容
- 字体加载延迟

**解决方案**：

```typescript
// 1. 禁用动画
await expect(page).toHaveScreenshot({
  animations: 'disabled',
})

// 2. 等待网络空闲
await page.waitForLoadState('networkidle')

// 3. 等待特定元素
await page.waitForSelector('[data-testid="content"]')

// 4. 隐藏动态内容
await page.addStyleTag({
  content: `
    .timestamp { visibility: hidden !important; }
    .animation { animation: none !important; }
  `
})

// 5. 等待字体加载
await page.evaluate(() => document.fonts.ready)

// 6. 固定时间
await page.addInitScript(() => {
  Date.now = () => 1234567890000
})
```

### 问题2：跨平台截图差异

**症状**：本地通过，CI失败（或反之）

**原因**：
- 操作系统字体渲染差异
- 浏览器版本不同
- 屏幕DPI不同

**解决方案**：

```typescript
// 1. 使用Docker统一环境
// docker-compose.yml
services:
  playwright:
    image: mcr.microsoft.com/playwright:latest
    volumes:
      - .:/app
    working_dir: /app

// 2. 设置像素差异阈值
await expect(page).toHaveScreenshot({
  maxDiffPixels: 100,  // 允许100个像素差异
  threshold: 0.2,      // 允许20%的颜色差异
})

// 3. 使用Web字体
// 在CSS中指定Web字体，避免使用系统字体

// 4. 固定浏览器版本
// package.json
{
  "devDependencies": {
    "@playwright/test": "1.40.0"  // 固定版本
  }
}
```

### 问题3：截图文件过大

**症状**：Git仓库体积快速增长

**原因**：
- 全页面截图
- 高分辨率
- 过多的基准截图

**解决方案**：

```typescript
// 1. 只截取可见区域
await expect(page).toHaveScreenshot({
  fullPage: false,
})

// 2. 使用clip截取特定区域
await expect(page).toHaveScreenshot({
  clip: { x: 0, y: 0, width: 800, height: 600 },
})

// 3. 使用Git LFS管理大文件
// .gitattributes
*.png filter=lfs diff=lfs merge=lfs -text

// 4. 定期清理旧截图
git filter-branch --tree-filter 'rm -rf tests/visual-snapshots' HEAD
```

### 问题4：测试执行缓慢

**症状**：测试运行时间过长

**原因**：
- 串行执行
- 全页面截图
- 未复用浏览器上下文

**解决方案**：

```typescript
// 1. 启用并行执行
// playwright.config.ts
export default defineConfig({
  fullyParallel: true,
  workers: 4,  // 4个并行worker
})

// 2. 复用浏览器上下文
test.describe.configure({ mode: 'parallel' })

// 3. 只测试变更的页面
// 使用git diff识别变更的文件

// 4. 使用缓存
// 缓存node_modules和playwright浏览器
```

---

## 最佳实践

### 1. 命名规范

```typescript
// ✅ 好的命名
'dashboard-desktop-chrome.png'
'markets-mobile-safari.png'
'purgatory-restricted-state.png'

// ❌ 不好的命名
'screenshot1.png'
'test.png'
'image.png'
```

### 2. 组织结构

```
tests/
├── visual/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   └── oauth.spec.ts
│   ├── dashboard/
│   │   ├── overview.spec.ts
│   │   └── stats.spec.ts
│   ├── markets/
│   │   ├── list.spec.ts
│   │   └── detail.spec.ts
│   └── helpers/
│       ├── auth.ts
│       ├── data.ts
│       └── setup.ts
└── visual-snapshots/
    ├── auth/
    ├── dashboard/
    └── markets/
```

### 3. 测试数据管理

```typescript
// 使用固定的测试数据
const testData = {
  markets: [
    {
      id: 'test-market-1',
      title: 'Test Market',
      status: 'active',
    },
  ],
  users: [
    {
      id: 'test-user-1',
      username: 'testuser',
      reputation: 100,
    },
  ],
}

// 在测试前注入数据
test.beforeEach(async ({ page }) => {
  await page.route('**/api/markets', route =>
    route.fulfill({ json: testData.markets })
  )
})
```

### 4. 版本控制

```bash
# 提交基准截图到Git
git add tests/visual-snapshots/
git commit -m "Update visual baselines"

# 使用Git LFS管理大文件
git lfs track "*.png"
git add .gitattributes
```

### 5. 文档化

```typescript
test('市场列表 - 网格布局', async ({ page }) => {
  // 测试目的：验证市场卡片的网格布局在桌面端正确显示
  // 预期结果：3列网格，每个卡片包含标题、状态、截止时间
  // 相关需求：REQ-2.6
  
  await page.goto('/markets')
  await page.waitForLoadState('networkidle')
  
  await expect(page).toHaveScreenshot('markets-list.png', {
    fullPage: true,
  })
})
```

### 6. 定期维护

```bash
# 每月审查和更新基准截图
npm run visual:review

# 清理未使用的截图
npm run visual:cleanup

# 优化截图文件大小
npm run visual:optimize
```

---

## 相关资源

### 官方文档
- [Playwright官方文档](https://playwright.dev/)
- [Playwright截图API](https://playwright.dev/docs/screenshots)
- [Playwright最佳实践](https://playwright.dev/docs/best-practices)

### 工具和服务
- [Percy](https://percy.io/) - 云端视觉测试
- [Chromatic](https://www.chromatic.com/) - Storybook视觉测试
- [BackstopJS](https://github.com/garris/BackstopJS) - 开源视觉测试工具

### 学习资源
- [Visual Regression Testing Guide](https://www.browserstack.com/guide/visual-regression-testing)
- [Playwright Tutorial](https://playwright.dev/docs/intro)
- [Testing Best Practices](https://testingjavascript.com/)

---

## 总结

视觉回归测试是确保DelphiGraph UI质量的重要手段。通过本指南：

1. ✅ 理解视觉测试的重要性
2. ✅ 掌握Playwright配置和使用
3. ✅ 学会编写高质量的测试用例
4. ✅ 了解CI/CD集成方法
5. ✅ 掌握故障排除技巧
6. ✅ 遵循最佳实践

建议在每次重大UI更新前后都运行完整的视觉测试套件，确保用户体验的一致性和质量。

---

**文档版本**: 1.0  
**最后更新**: 2024-02-16  
**维护者**: DelphiGraph开发团队
