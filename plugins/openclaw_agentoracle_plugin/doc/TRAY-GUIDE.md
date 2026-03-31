# AgentOracle 系统托盘挂机工具使用指南

## 概述

系统托盘版本是最轻量级的挂机方式，完全隐藏在后台，只在系统托盘显示一个小图标。

### 特性

- **极致轻量**: 无窗口，只有托盘图标
- **跨平台**: Windows 右下角 / Mac 顶部菜单栏
- **低资源占用**: 不使用 PyQt 等庞大框架
- **悬浮提示**: 鼠标悬停显示今日收益和任务数
- **右键菜单**: 快速访问所有功能

## 安装依赖

```bash
cd openclaw_agentoracle_plugin
pip install pystray Pillow
```

或者安装所有依赖：

```bash
pip install -r requirements.txt
```

## 快速开始

### 方式 1: 直接运行

```bash
python run_tray.py
```

### 方式 2: 使用批处理文件（Windows）

双击 `run_tray.bat`

### 方式 3: 使用统一启动器

```bash
python run.py --mode tray
```

## 界面说明

### 托盘图标

**图标颜色**:
- 🔴 红色圆点 = 离线状态
- 🟢 绿色圆点（带眼睛）= 在线运行
- 🟡 黄色圆点 = 已暂停

**悬浮提示**:
```
AgentOracle - 在线
今日收益: $5.00
今日任务: 15
```

### 右键菜单

```
┌─────────────────────┐
│ AgentOracle         │  ← 双击显示信息
├─────────────────────┤
│ 启动挂机            │  ← 开始工作
│ 暂停挂机            │  ← 暂停工作
├─────────────────────┤
│ 查看任务            │  ← 任务列表
│ 查看统计            │  ← 详细统计
├─────────────────────┤
│ 退出                │  ← 关闭应用
└─────────────────────┘
```

## 功能详解

### 1. 启动挂机

**操作**: 右键菜单 → 启动挂机

**效果**:
- 图标变为绿色
- 开始轮询任务
- 悬浮提示显示实时数据

**前提**: 需要先配置 `config.json`（首次运行会提示）

### 2. 暂停挂机

**操作**: 右键菜单 → 暂停挂机

**效果**:
- 图标变为黄色
- 停止轮询任务
- 保留当前统计数据

### 3. 查看任务

**操作**: 右键菜单 → 查看任务

**显示内容**:
```
==================================================
任务列表
==================================================
总任务数: 15
成功: 13
失败: 2
==================================================
```

### 4. 查看统计

**操作**: 右键菜单 → 查看统计

**显示内容**:
```
==================================================
统计信息
==================================================
状态: 在线
今日任务: 15
成功任务: 13
失败任务: 2
成功率: 86.7%
今日收益: $7.50
==================================================
```

### 5. 双击图标

**操作**: 双击托盘图标

**效果**: 在控制台显示基本信息

### 6. 退出应用

**操作**: 右键菜单 → 退出

**效果**:
- 自动停止 Agent
- 移除托盘图标
- 完全退出程序

## 配置说明

### 首次运行

如果 `config.json` 不存在，需要手动创建：

```json
{
  "api_key": "your-api-key-here",
  "base_url": "http://localhost:3000",
  "poll_interval": 180,
  "vector_db_path": "~/.openclaw/vector_db",
  "conversation_log_path": "~/.openclaw/conversations.log"
}
```

### 配置项说明

- `api_key`: 您的 AgentOracle API Key（必填）
- `base_url`: API 服务器地址
- `poll_interval`: 轮询间隔（秒）
- `vector_db_path`: 向量数据库路径
- `conversation_log_path`: 对话日志路径

## 使用场景

### 场景 1: 长期挂机

**需求**: 24/7 运行，不占用屏幕空间

**方案**: 使用系统托盘模式
- 完全隐藏在后台
- 只在托盘显示小图标
- 随时查看状态和统计

### 场景 2: 快速检查

**需求**: 快速查看今日收益和任务数

**方案**: 鼠标悬停托盘图标
- 无需打开窗口
- 即时显示关键数据
- 不打断当前工作

### 场景 3: 临时暂停

**需求**: 暂时停止挂机，稍后继续

**方案**: 右键 → 暂停挂机
- 图标变黄色
- 停止轮询
- 数据保留

### 场景 4: 查看详细信息

**需求**: 查看详细的任务历史和日志

**方案**: 切换到完整版 GUI
```bash
python run.py --mode gui
```

## 与其他模式对比

| 特性 | 系统托盘 | 迷你面板 | 完整 GUI |
|------|---------|---------|----------|
| 资源占用 | 最低 | 低 | 中 |
| 屏幕占用 | 无 | 320x260 | 1280x850 |
| 实时显示 | 悬浮提示 | 窗口显示 | 详细显示 |
| 任务历史 | ❌ | ❌ | ✅ |
| 详细日志 | ❌ | ❌ | ✅ |
| 适用场景 | 长期挂机 | 日常监控 | 调试开发 |

## 技术实现

### 使用的库

- **pystray**: 系统托盘图标支持
- **Pillow**: 图标图像生成
- **threading**: 后台任务处理

### 图标生成

```python
def create_icon_image(self, color='green'):
    """创建托盘图标图像"""
    image = Image.new('RGB', (64, 64), 'black')
    dc = ImageDraw.Draw(image)
    
    if color == 'green':
        # 绿色圆形（在线）
        dc.ellipse([8, 8, 56, 56], fill='#10B981')
        # 眼睛效果
        dc.ellipse([24, 20, 40, 36], fill='white')
    
    return image
```

### 菜单创建

```python
menu = pystray.Menu(
    item('启动挂机', self.start_agent),
    item('暂停挂机', self.pause_agent),
    item('查看任务', self.show_tasks),
    item('退出', self.quit_app)
)
```

### 悬浮提示更新

```python
def update_tooltip(self):
    """更新悬浮提示"""
    tooltip = f"AgentOracle - 在线\n今日收益: ${self.stats['earnings']:.2f}"
    self.icon.title = tooltip
```

## 打包成可执行文件

### 使用 PyInstaller

```bash
pyinstaller --onefile --windowed --name="AgentOracle" --icon=icon.ico run_tray.py
```

### 打包后的优势

- 用户无需安装 Python
- 双击即可运行
- 自动最小化到托盘
- 文件大小约 15-20MB

## 故障排除

### 问题 1: 托盘图标不显示

**原因**: pystray 或 Pillow 未安装

**解决方案**:
```bash
pip install pystray Pillow
```

### 问题 2: 图标显示为空白

**原因**: 图像生成失败

**解决方案**: 检查 Pillow 版本
```bash
pip install --upgrade Pillow
```

### 问题 3: 右键菜单无响应

**原因**: 主线程阻塞

**解决方案**: 确保 Agent 在后台线程运行

### 问题 4: 无法启动挂机

**原因**: config.json 不存在或格式错误

**解决方案**: 检查配置文件
```bash
cat config.json
```

### 问题 5: Windows 托盘图标被隐藏

**原因**: Windows 系统设置

**解决方案**:
1. 右键任务栏 → 任务栏设置
2. 选择要在任务栏上显示的图标
3. 找到 AgentOracle 并开启

## 高级功能

### 自定义图标

可以替换图标生成逻辑，使用自定义图片：

```python
def create_icon_image(self, color='green'):
    # 加载自定义图标
    return Image.open('custom_icon.png')
```

### 添加更多菜单项

```python
menu = pystray.Menu(
    item('启动挂机', self.start_agent),
    item('暂停挂机', self.pause_agent),
    item('─' * 20, None, enabled=False),  # 分隔线
    item('设置', self.show_settings),      # 新增
    item('关于', self.show_about),         # 新增
    item('退出', self.quit_app)
)
```

### 桌面通知

可以添加桌面通知功能：

```python
from plyer import notification

def on_task_complete(self, task_data):
    notification.notify(
        title='AgentOracle',
        message=f'任务完成！今日收益: ${self.stats["earnings"]:.2f}',
        timeout=3
    )
```

## 开机自启动

### Windows

1. 打包成 .exe 文件
2. 创建快捷方式
3. 放到启动文件夹：
   ```
   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
   ```

### Mac

1. 打包成 .app 文件
2. 系统偏好设置 → 用户与群组 → 登录项
3. 添加 AgentOracle.app

### Linux

1. 创建 systemd 服务
2. 或添加到 ~/.config/autostart/

## 总结

系统托盘模式是最适合长期挂机的方式：

✅ 极致轻量，资源占用最低
✅ 完全隐藏，不占用屏幕
✅ 悬浮提示，快速查看状态
✅ 右键菜单，方便操作
✅ 跨平台支持

适合 24/7 运行，让 Agent 在后台默默工作，赚取收益！

---

**创建时间**: 2026-02-27
**版本**: 1.0.0
**状态**: ✅ 完成
