# AgentOracle 插件打包指南

## 概述

本指南说明如何将 AgentOracle 插件打包成独立的可执行文件，让用户无需安装 Python 环境即可使用。

## 打包方式对比

### 方式 1: PyInstaller（推荐）

**优点**:
- 打包成单个 .exe 文件
- 用户无需安装 Python
- 支持 Windows/Mac/Linux
- 配置简单

**缺点**:
- 文件较大（20-50MB）
- 首次启动稍慢

### 方式 2: cx_Freeze

**优点**:
- 文件较小
- 启动速度快

**缺点**:
- 配置复杂
- 需要多个文件

### 方式 3: Nuitka

**优点**:
- 编译成原生代码
- 性能最好
- 文件最小

**缺点**:
- 编译时间长
- 配置最复杂

## PyInstaller 打包步骤（推荐）

### 1. 安装 PyInstaller

```bash
pip install pyinstaller
```

### 2. 基础打包命令

```bash
cd openclaw_agentoracle_plugin

# 打包迷你面板
pyinstaller --onefile --windowed --name="AgentOracle" run_mini.py
```

### 3. 高级打包命令（推荐）

```bash
# 带图标和优化的打包
pyinstaller \
  --onefile \
  --windowed \
  --name="AgentOracle" \
  --icon=icon.ico \
  --add-data="config.json.example:." \
  --hidden-import=skill \
  --hidden-import=logger \
  --hidden-import=api_client \
  --exclude-module=matplotlib \
  --exclude-module=numpy \
  --exclude-module=pandas \
  run_mini.py
```

参数说明:
- `--onefile`: 打包成单个文件
- `--windowed`: 不显示控制台（GUI 应用必须）
- `--name`: 可执行文件名称
- `--icon`: 应用图标（.ico 格式）
- `--add-data`: 包含额外文件
- `--hidden-import`: 显式导入模块
- `--exclude-module`: 排除不需要的大型库

### 4. 打包结果

```
openclaw_agentoracle_plugin/
├── dist/
│   └── AgentOracle.exe  ← 最终可执行文件
├── build/               ← 临时文件（可删除）
└── AgentOracle.spec     ← 配置文件
```

## 创建应用图标

### Windows (.ico)

1. 准备一张 PNG 图片（建议 256x256 像素）
2. 使用在线工具转换为 .ico 格式:
   - https://convertio.co/png-ico/
   - https://www.icoconverter.com/

3. 将 `icon.ico` 放在 `openclaw_agentoracle_plugin` 目录

### Mac (.icns)

```bash
# 使用 iconutil 工具
mkdir icon.iconset
sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
# ... 其他尺寸
iconutil -c icns icon.iconset
```

## 优化打包大小

### 1. 排除不需要的模块

编辑 `AgentOracle.spec`:

```python
excludes=[
    'matplotlib',
    'numpy',
    'pandas',
    'scipy',
    'PIL',
    'tkinter.test',
    'unittest',
    'test',
]
```

### 2. 使用 UPX 压缩

```bash
# 下载 UPX: https://upx.github.io/
# 解压到某个目录，例如 C:\upx

# 打包时指定 UPX 路径
pyinstaller --onefile --windowed --name="AgentOracle" --upx-dir=C:\upx run_mini.py
```

### 3. 移除调试信息

```python
# 在 AgentOracle.spec 中设置
debug=False,
strip=True,
```

## 完整的 spec 文件示例

创建 `AgentOracle-Mini.spec`:

```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['run_mini.py'],
    pathex=[],
    binaries=[],
    datas=[('config.json.example', '.')],
    hiddenimports=['skill', 'logger', 'api_client', 'telemetry', 'sanitizer', 'memory_monitor', 'validators'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas', 'scipy', 'PIL', 'tkinter.test', 'unittest', 'test'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='AgentOracle',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico'
)
```

使用 spec 文件打包:

```bash
pyinstaller AgentOracle-Mini.spec
```

## 测试打包结果

### 1. 基础测试

```bash
cd dist
AgentOracle.exe
```

检查:
- [ ] 窗口正常显示
- [ ] 大小为 300x200 像素
- [ ] 位置在屏幕右下角
- [ ] 可以拖动
- [ ] 始终置顶
- [ ] 配色正确

### 2. 功能测试

- [ ] 首次运行显示 API Key 配置对话框
- [ ] 输入 API Key 后保存成功
- [ ] 点击启动按钮正常工作
- [ ] 状态指示灯变绿
- [ ] 统计数据正常更新
- [ ] 点击停止按钮正常工作
- [ ] 关闭窗口正常退出

### 3. 兼容性测试

在不同 Windows 版本测试:
- [ ] Windows 10
- [ ] Windows 11
- [ ] Windows Server 2019/2022

## 分发准备

### 1. 创建分发包

```
AgentOracle-Plugin-v1.0/
├── AgentOracle.exe
├── README.txt
├── LICENSE.txt
└── config.json.example
```

### 2. README.txt 内容

```
AgentOracle Plugin - 迷你挂机面板
版本: 1.0.0

=== 快速开始 ===

1. 双击 AgentOracle.exe 运行
2. 首次运行输入您的 API Key
3. 点击"启动"按钮开始工作

=== 系统要求 ===

- Windows 10/11 (64位)
- 无需安装 Python
- 需要网络连接

=== 功能说明 ===

- 实时监控 Agent 运行状态
- 显示今日任务数、成功率、失败数
- 一键启动/停止
- 小巧精致，不占用屏幕空间

=== 配置说明 ===

配置文件: config.json
- api_key: 您的 API Key
- base_url: API 服务器地址
- poll_interval: 轮询间隔（秒）

=== 技术支持 ===

官网: https://agentoracle.example.com
文档: https://docs.agentoracle.example.com
问题反馈: https://github.com/your-org/agentoracle/issues

=== 许可证 ===

详见 LICENSE.txt
```

### 3. 打包成 ZIP

```bash
# Windows
Compress-Archive -Path AgentOracle-Plugin-v1.0 -DestinationPath AgentOracle-Plugin-v1.0.zip

# Linux/Mac
zip -r AgentOracle-Plugin-v1.0.zip AgentOracle-Plugin-v1.0/
```

## 上传到 claw-hub

### 1. 准备元数据

创建 `plugin.json`:

```json
{
  "name": "AgentOracle",
  "version": "1.0.0",
  "description": "AgentOracle 迷你挂机面板 - 小巧精致的 Agent 监控工具",
  "author": "AgentOracle Team",
  "homepage": "https://agentoracle.example.com",
  "repository": "https://github.com/your-org/agentoracle",
  "license": "MIT",
  "platform": "windows",
  "architecture": "x64",
  "category": "productivity",
  "tags": ["agent", "monitoring", "automation"],
  "requirements": {
    "os": "Windows 10+",
    "memory": "100MB",
    "disk": "50MB"
  },
  "files": {
    "executable": "AgentOracle.exe",
    "config": "config.json.example"
  }
}
```

### 2. 上传步骤

1. 登录 claw-hub
2. 创建新插件
3. 上传 ZIP 文件
4. 填写插件信息
5. 提交审核

## 自动化打包脚本

创建 `build.bat` (Windows):

```batch
@echo off
echo ========================================
echo AgentOracle Plugin Build Script
echo ========================================
echo.

echo [1/5] Cleaning old builds...
rmdir /s /q build dist
del /q *.spec

echo [2/5] Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller

echo [3/5] Building executable...
pyinstaller --onefile --windowed --name="AgentOracle" --icon=icon.ico run_mini.py

echo [4/5] Testing executable...
cd dist
AgentOracle.exe --version
cd ..

echo [5/5] Creating distribution package...
mkdir AgentOracle-Plugin-v1.0
copy dist\AgentOracle.exe AgentOracle-Plugin-v1.0\
copy README.txt AgentOracle-Plugin-v1.0\
copy LICENSE.txt AgentOracle-Plugin-v1.0\
copy config.json.example AgentOracle-Plugin-v1.0\

echo.
echo ========================================
echo Build completed successfully!
echo Output: AgentOracle-Plugin-v1.0\
echo ========================================
pause
```

创建 `build.sh` (Linux/Mac):

```bash
#!/bin/bash

echo "========================================"
echo "AgentOracle Plugin Build Script"
echo "========================================"
echo

echo "[1/5] Cleaning old builds..."
rm -rf build dist *.spec

echo "[2/5] Installing dependencies..."
pip install -r requirements.txt
pip install pyinstaller

echo "[3/5] Building executable..."
pyinstaller --onefile --windowed --name="AgentOracle" --icon=icon.ico run_mini.py

echo "[4/5] Testing executable..."
cd dist
./AgentOracle --version
cd ..

echo "[5/5] Creating distribution package..."
mkdir -p AgentOracle-Plugin-v1.0
cp dist/AgentOracle AgentOracle-Plugin-v1.0/
cp README.txt AgentOracle-Plugin-v1.0/
cp LICENSE.txt AgentOracle-Plugin-v1.0/
cp config.json.example AgentOracle-Plugin-v1.0/

echo
echo "========================================"
echo "Build completed successfully!"
echo "Output: AgentOracle-Plugin-v1.0/"
echo "========================================"
```

## 故障排除

### 问题 1: 打包后运行报错 "Failed to execute script"

**原因**: 缺少依赖模块

**解决方案**:
```bash
pyinstaller --onefile --windowed --name="AgentOracle" \
  --hidden-import=skill \
  --hidden-import=logger \
  --hidden-import=api_client \
  run_mini.py
```

### 问题 2: 文件太大（>100MB）

**原因**: 包含了不需要的库

**解决方案**:
```bash
pyinstaller --onefile --windowed --name="AgentOracle" \
  --exclude-module=matplotlib \
  --exclude-module=numpy \
  --exclude-module=pandas \
  run_mini.py
```

### 问题 3: 打包后无法找到配置文件

**原因**: 配置文件路径问题

**解决方案**: 使用相对于可执行文件的路径
```python
import sys
import os

if getattr(sys, 'frozen', False):
    # 打包后的路径
    base_path = sys._MEIPASS
else:
    # 开发环境路径
    base_path = os.path.dirname(__file__)

config_path = os.path.join(base_path, 'config.json')
```

### 问题 4: 杀毒软件误报

**原因**: PyInstaller 打包的文件可能被误报为病毒

**解决方案**:
1. 使用代码签名证书签名
2. 提交到杀毒软件厂商白名单
3. 在 README 中说明

## 代码签名（可选）

### Windows 代码签名

1. 购买代码签名证书
2. 使用 signtool 签名:

```bash
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com dist\AgentOracle.exe
```

### Mac 代码签名

```bash
codesign --force --sign "Developer ID Application: Your Name" dist/AgentOracle.app
```

## 持续集成（CI/CD）

### GitHub Actions 示例

创建 `.github/workflows/build.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pyinstaller
      
      - name: Build executable
        run: |
          cd openclaw_agentoracle_plugin
          pyinstaller --onefile --windowed --name="AgentOracle" run_mini.py
      
      - name: Upload artifact
        uses: actions/upload-artifact@v2
        with:
          name: AgentOracle-Windows
          path: openclaw_agentoracle_plugin/dist/AgentOracle.exe
```

## 总结

打包流程:
1. 安装 PyInstaller
2. 准备应用图标
3. 运行打包命令
4. 测试可执行文件
5. 创建分发包
6. 上传到 claw-hub

推荐配置:
- 使用 `--onefile` 打包成单文件
- 使用 `--windowed` 隐藏控制台
- 添加应用图标提升专业度
- 排除不需要的大型库减小文件大小
- 使用 UPX 压缩进一步减小文件
