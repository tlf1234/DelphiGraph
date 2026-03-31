# AgentOracle 迷你挂机面板使用指南

## 概述

迷你挂机面板是一个小巧的桌面监控工具，类似 Discord/Spotify 的迷你播放器。

### 特性

- **小巧精致**: 320x260 像素，不占用太多屏幕空间
- **可拖动**: 点击标题栏拖动到任意位置
- **始终置顶**: 始终显示在其他窗口之上
- **品牌风格**: 符合 AgentOracle 深色科技风设计
- **实时监控**: 显示状态、今日任务数、成功率、失败数
- **简单控制**: 一键启动/停止

## 快速开始

### 方式 1: Python 直接运行（开发模式）

```bash
cd openclaw_agentoracle_plugin
python run_mini.py
```

### 方式 2: 打包成独立可执行文件（推荐）

使用 PyInstaller 打包成单文件 .exe，用户无需安装 Python 环境。

#### 安装 PyInstaller

```bash
pip install pyinstaller
```

#### 打包命令

```bash
cd openclaw_agentoracle_plugin

# Windows 打包
pyinstaller --onefile --windowed --name="AgentOracle" --icon=icon.ico run_mini.py

# 如果没有 icon.ico，可以省略 --icon 参数
pyinstaller --onefile --windowed --name="AgentOracle" run_mini.py
```

参数说明：
- `--onefile`: 打包成单个 .exe 文件
- `--windowed`: 不显示控制台窗口（GUI 应用）
- `--name`: 可执行文件名称
- `--icon`: 应用图标（可选）

#### 打包后的文件位置

```
openclaw_agentoracle_plugin/
├── dist/
│   └── AgentOracle.exe  ← 这就是最终的可执行文件
├── build/               ← 临时文件，可以删除
└── AgentOracle.spec     ← PyInstaller 配置文件
```

#### 分发给用户

1. 将 `dist/AgentOracle.exe` 复制出来
2. 用户双击运行即可
3. 首次运行会弹出 API Key 配置对话框
4. 配置完成后会自动保存到 `config.json`

## 界面说明

### 标题栏
- **Logo + 标题**: 显示 "🤖 AgentOracle"
- **拖动**: 点击标题栏任意位置可拖动窗口
- **关闭按钮**: 右上角 ✕ 按钮关闭面板

### 状态区域
- **状态指示灯**: 
  - 🔴 红色 = 离线
  - 🟢 绿色 = 在线
- **状态文字**: "离线" 或 "在线"

### 统计数据
- **今日任务**: 今天完成的任务总数
- **成功率**: 成功任务的百分比
- **失败数**: 失败的任务数量

### 控制按钮
- **▶ 启动**: 启动 Agent 开始工作
- **⏹ 停止**: 停止 Agent

## 首次配置

首次运行时会弹出配置对话框：

1. 输入您的 AgentOracle API Key（至少 32 个字符）
2. 点击"保存配置"按钮
3. 配置会保存到 `config.json` 文件
4. 下次运行会自动加载配置

## 配置文件

配置文件 `config.json` 会自动创建在可执行文件同目录下：

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
- `base_url`: API 服务器地址（默认本地）
- `poll_interval`: 轮询间隔（秒），默认 180 秒
- `vector_db_path`: 向量数据库路径
- `conversation_log_path`: 对话日志路径

## 使用技巧

### 1. 窗口位置
- 默认显示在屏幕右下角
- 可以拖动到任意位置
- 位置不会保存，每次启动都在右下角

### 2. 始终置顶
- 面板始终显示在其他窗口之上
- 方便随时查看运行状态
- 不会被其他窗口遮挡

### 3. 关闭面板
- 点击右上角 ✕ 按钮
- 如果 Agent 正在运行，会提示确认
- 确认后会自动停止 Agent 并关闭面板

### 4. 查看详细日志
- 迷你面板只显示核心信息
- 如需查看详细日志，运行完整版 GUI：
  ```bash
  python run.py --mode gui
  ```

## 打包优化

### 减小文件大小

如果打包后的 .exe 文件太大，可以使用以下优化：

```bash
# 使用 UPX 压缩（需要先安装 UPX）
pyinstaller --onefile --windowed --name="AgentOracle" --upx-dir=/path/to/upx run_mini.py

# 排除不需要的模块
pyinstaller --onefile --windowed --name="AgentOracle" --exclude-module matplotlib --exclude-module numpy run_mini.py
```

### 添加应用图标

1. 准备一个 `.ico` 文件（Windows 图标格式）
2. 放在 `openclaw_agentoracle_plugin` 目录下
3. 打包时指定图标：
   ```bash
   pyinstaller --onefile --windowed --name="AgentOracle" --icon=icon.ico run_mini.py
   ```

### 自定义打包配置

编辑 `AgentOracle.spec` 文件可以进行更高级的配置：

```python
# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['run_mini.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas'],  # 排除不需要的大型库
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='AgentOracle',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # 启用 UPX 压缩
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 不显示控制台
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico'  # 应用图标
)
```

然后使用 spec 文件打包：

```bash
pyinstaller AgentOracle.spec
```

## 故障排除

### 问题 1: 打包后运行报错

**解决方案**: 检查是否缺少依赖模块

```bash
# 在 PyInstaller 命令中添加隐藏导入
pyinstaller --onefile --windowed --name="AgentOracle" --hidden-import=skill --hidden-import=logger run_mini.py
```

### 问题 2: 窗口无法拖动

**解决方案**: 确保点击的是标题栏区域（顶部 40 像素高度）

### 问题 3: API Key 配置丢失

**解决方案**: 
- 检查 `config.json` 文件是否在可执行文件同目录
- 确保文件权限正确（Windows 下通常不是问题）

### 问题 4: 无法连接到服务器

**解决方案**:
- 检查 `base_url` 配置是否正确
- 确保服务器正在运行
- 检查防火墙设置

## 从 claw-hub 分发

### 准备分发包

1. 打包成 .exe 文件
2. 创建分发目录结构：
   ```
   AgentOracle-Plugin/
   ├── AgentOracle.exe
   ├── README.txt
   └── config.json.example
   ```

3. 创建 `README.txt`:
   ```
   AgentOracle Plugin - 迷你挂机面板
   
   使用方法：
   1. 双击 AgentOracle.exe 运行
   2. 首次运行输入 API Key
   3. 点击"启动"按钮开始工作
   
   更多信息: https://agentoracle.example.com
   ```

4. 创建 `config.json.example`:
   ```json
   {
     "api_key": "your-api-key-here",
     "base_url": "http://localhost:3000",
     "poll_interval": 180
   }
   ```

### 上传到 claw-hub

1. 将整个 `AgentOracle-Plugin` 目录打包成 .zip
2. 上传到 claw-hub
3. 用户下载后解压即可使用

## 设计说明

### 配色方案

遵循 AgentOracle 主站设计系统：

- **背景色**: `#0A0A0A` (深黑色)
- **卡片背景**: `#141414` (稍浅黑色)
- **主文字**: `#FFFFFF` (白色)
- **次要文字**: `#A1A1AA` (灰色)
- **品牌紫色**: `#8B5CF6` (强调色)
- **成功绿色**: `#10B981`
- **错误红色**: `#EF4444`

### 尺寸规格

- **窗口大小**: 300x200 像素
- **标题栏高度**: 40 像素
- **内边距**: 15 像素
- **按钮高度**: 约 30 像素

### 字体

- **标题**: Segoe UI, 11pt, Bold
- **正文**: Segoe UI, 9-10pt
- **代码**: Consolas, 10pt

## 未来改进

可能的功能增强：

1. **系统托盘支持**: 最小化到系统托盘
2. **位置记忆**: 记住上次窗口位置
3. **主题切换**: 支持浅色/深色主题
4. **通知提示**: 任务完成时桌面通知
5. **快捷键**: 全局快捷键控制
6. **多语言**: 支持英文/中文切换

## 相关文件

- `gui_mini.py`: 迷你面板主程序
- `run_mini.py`: 启动脚本
- `gui.py`: 完整版 GUI（查看详细日志）
- `skill.py`: 核心插件逻辑
- `config.json`: 配置文件

## 技术栈

- **GUI 框架**: Tkinter (Python 标准库)
- **打包工具**: PyInstaller
- **Python 版本**: 3.7+

## 许可证

与 AgentOracle 主项目相同
