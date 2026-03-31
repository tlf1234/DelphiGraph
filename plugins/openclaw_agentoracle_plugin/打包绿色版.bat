@echo off
chcp 65001 >nul
REM ============================================================================
REM AgentOracle 绿色版打包脚本
REM ============================================================================
REM 使用 Python Embeddable Package 创建完全便携的绿色版本
REM 用户无需安装任何东西，解压即用
REM ============================================================================

echo ========================================
echo AgentOracle 绿色版打包工具
echo ========================================
echo.

REM 设置当前 Python 路径（用于安装依赖）
set PYTHON_CMD=D:\Users\58290\miniconda3_new\python.exe

REM 检查 Python 是否存在
if not exist "%PYTHON_CMD%" (
    echo [错误] 找不到 Python！
    echo Python 路径: %PYTHON_CMD%
    echo.
    echo 请修改此文件中的 PYTHON_CMD 变量为你的 Python 路径
    echo.
    pause
    exit /b 1
)

REM 获取 Python 版本
for /f "tokens=2 delims= " %%i in ('"%PYTHON_CMD%" --version 2^>^&1') do set PYTHON_VERSION=%%i
echo 当前 Python 版本: %PYTHON_VERSION%
echo.

REM 提取主版本号（例如 3.11）
for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
    set MAJOR=%%a
    set MINOR=%%b
)
set PYTHON_SHORT_VERSION=%MAJOR%.%MINOR%
echo Python 主版本: %PYTHON_SHORT_VERSION%
echo.

echo ========================================
echo 步骤 1/6: 下载 Python Embeddable Package
echo ========================================
echo.
echo 请按照以下步骤操作:
echo.
echo 1. 访问 Python 官网下载页面:
echo    https://www.python.org/downloads/windows/
echo.
echo 2. 找到对应版本 (Python %PYTHON_SHORT_VERSION%) 的下载链接
echo    下载 "Windows embeddable package (64-bit)"
echo    文件名类似: python-%PYTHON_SHORT_VERSION%.x-embed-amd64.zip
echo.
echo 3. 下载后，将 zip 文件放到当前目录
echo.
echo 4. 按任意键继续...
pause >nul
echo.

REM 查找 embeddable zip 文件
set EMBED_ZIP=
for %%f in (python-*-embed-amd64.zip) do set EMBED_ZIP=%%f

if "%EMBED_ZIP%"=="" (
    echo [错误] 未找到 Python embeddable package!
    echo 请确保已下载并放置在当前目录
    echo 文件名格式: python-3.x.x-embed-amd64.zip
    echo.
    pause
    exit /b 1
)

echo [找到] %EMBED_ZIP%
echo.

echo ========================================
echo 步骤 2/6: 创建绿色版目录结构
echo ========================================
echo.

if exist "AgentOracle_Green" rmdir /s /q "AgentOracle_Green"
mkdir "AgentOracle_Green"
mkdir "AgentOracle_Green\python_env"
mkdir "AgentOracle_Green\plugin"

echo [完成] 目录创建完成
echo.

echo ========================================
echo 步骤 3/6: 解压 Python Embeddable Package
echo ========================================
echo.

REM 使用 PowerShell 解压
powershell -command "Expand-Archive -Path '%EMBED_ZIP%' -DestinationPath 'AgentOracle_Green\python_env' -Force"

if %ERRORLEVEL% NEQ 0 (
    echo [错误] 解压失败！
    pause
    exit /b 1
)

echo [完成] Python 环境解压完成
echo.

echo ========================================
echo 步骤 4/6: 配置 Python 环境
echo ========================================
echo.

REM 找到 ._pth 文件并修改
for %%f in (AgentOracle_Green\python_env\python*._pth) do (
    echo [配置] %%f
    REM 备份原文件
    copy "%%f" "%%f.bak" >nul
    
    REM 创建新的配置（启用 site-packages）
    (
        echo python%MAJOR%%MINOR%.zip
        echo .
        echo ..\plugin
        echo.
        echo # 启用 site-packages 支持
        echo import site
    ) > "%%f"
)

echo [完成] Python 环境配置完成
echo.

echo ========================================
echo 步骤 5/6: 安装依赖到绿色环境
echo ========================================
echo.

REM 下载 get-pip.py
echo [1/3] 下载 pip 安装脚本...
powershell -command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'AgentOracle_Green\python_env\get-pip.py'"

if %ERRORLEVEL% NEQ 0 (
    echo [错误] 下载 get-pip.py 失败！
    echo 请检查网络连接
    pause
    exit /b 1
)

echo [完成] get-pip.py 下载完成
echo.

REM 安装 pip
echo [2/3] 安装 pip...
"AgentOracle_Green\python_env\python.exe" "AgentOracle_Green\python_env\get-pip.py"

if %ERRORLEVEL% NEQ 0 (
    echo [错误] pip 安装失败！
    pause
    exit /b 1
)

echo [完成] pip 安装完成
echo.

REM 安装依赖
echo [3/3] 安装项目依赖（这可能需要几分钟）...
"AgentOracle_Green\python_env\python.exe" -m pip install -r requirements.txt

if %ERRORLEVEL% NEQ 0 (
    echo [错误] 依赖安装失败！
    pause
    exit /b 1
)

echo [完成] 所有依赖安装完成
echo.

echo ========================================
echo 步骤 6/6: 复制插件文件
echo ========================================
echo.

REM 复制所有 Python 文件
xcopy "*.py" "AgentOracle_Green\plugin\" /Y >nul
xcopy "*.json" "AgentOracle_Green\plugin\" /Y >nul
xcopy "*.md" "AgentOracle_Green\plugin\" /Y >nul
xcopy "requirements.txt" "AgentOracle_Green\plugin\" /Y >nul

REM 复制文档
if exist "doc" xcopy "doc" "AgentOracle_Green\plugin\doc\" /E /I /Y >nul
if exist "docs" xcopy "docs" "AgentOracle_Green\plugin\docs\" /E /I /Y >nul

echo [完成] 插件文件复制完成
echo.

echo ========================================
echo 创建启动脚本
echo ========================================
echo.

REM Windows 启动脚本（无窗口）
(
echo @echo off
echo cd /d "%%~dp0"
echo start "" "python_env\pythonw.exe" "plugin\gui.py"
) > "AgentOracle_Green\启动AgentOracle.bat"

REM Windows 启动脚本（调试模式）
(
echo @echo off
echo chcp 65001 ^>nul
echo cd /d "%%~dp0"
echo echo ========================================
echo echo AgentOracle 控制面板 - 调试模式
echo echo ========================================
echo echo.
echo "python_env\python.exe" "plugin\gui.py"
echo echo.
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo [错误] 程序异常退出！
echo     echo 错误代码: %%ERRORLEVEL%%
echo ^)
echo echo.
echo pause
) > "AgentOracle_Green\启动AgentOracle(调试模式).bat"

REM Mac 启动脚本
(
echo #!/bin/bash
echo cd "$$(dirname "$$0")"
echo ./python_env/bin/python3 plugin/gui.py
) > "AgentOracle_Green\启动AgentOracle.command"

REM Linux 启动脚本
(
echo #!/bin/bash
echo cd "$$(dirname "$$0")"
echo ./python_env/bin/python3 plugin/gui.py
) > "AgentOracle_Green\启动AgentOracle.sh"

echo [完成] 启动脚本创建完成
echo.

echo ========================================
echo 创建使用文档
echo ========================================
echo.

REM 创建使用说明
(
echo ========================================
echo AgentOracle 绿色版 - 使用说明
echo ========================================
echo.
echo 这是一个完全绿色便携的版本，特点：
echo.
echo ✓ 无需安装 Python
echo ✓ 无需安装任何依赖
echo ✓ 解压即用，删除即净
echo ✓ 不污染系统环境
echo ✓ 不会被杀毒软件误报
echo ✓ 完全开源透明
echo.
echo ========================================
echo 快速开始
echo ========================================
echo.
echo 1. 首次使用前，编辑 plugin\config.json
echo    配置你的 AgentOracle API 信息
echo.
echo 2. 双击 "启动AgentOracle.bat" 启动程序
echo.
echo 3. 程序会在后台运行，不显示命令行窗口
echo.
echo 4. 如遇问题，使用 "启动AgentOracle(调试模式).bat"
echo    查看详细错误信息
echo.
echo ========================================
echo 目录结构
echo ========================================
echo.
echo AgentOracle_Green\
echo   ├── python_env\              # 绿色版 Python 环境
echo   │   ├── python.exe           # Python 解释器
echo   │   ├── pythonw.exe          # 无窗口 Python
echo   │   └── Lib\site-packages\  # 所有依赖库
echo   │
echo   ├── plugin\                  # 插件源代码
echo   │   ├── gui.py               # 主程序
echo   │   ├── config.json          # 配置文件
echo   │   └── docs\                # 文档
echo   │
echo   ├── 启动AgentOracle.bat      # 启动脚本
echo   └── 使用说明.txt             # 本文件
echo.
echo ========================================
echo 系统要求
echo ========================================
echo.
echo Windows:
echo   - Windows 10/11 (64位)
echo   - 无需安装任何软件
echo.
echo Mac/Linux:
echo   - 需要单独打包对应平台的版本
echo   - 或者使用虚拟环境方案
echo.
echo ========================================
echo 为什么选择绿色版？
echo ========================================
echo.
echo 1. 零门槛
echo    用户不需要懂 Python，不需要配置环境
echo    下载 -> 解压 -> 双击，三步完成
echo.
echo 2. 绝对安全
echo    不是编译的黑盒 .exe 文件
echo    是官方原版 python.exe + 明文 .py 脚本
echo    杀毒软件完全信任，不会误报
echo.
echo 3. 不污染系统
echo    所有文件都在这个文件夹里
echo    不修改注册表，不添加环境变量
echo    删除文件夹 = 完全卸载
echo.
echo 4. 完全开源
echo    所有源代码都在 plugin\ 目录
echo    可以随意查看、修改、学习
echo.
echo ========================================
echo 配置说明
echo ========================================
echo.
echo 配置文件: plugin\config.json
echo.
echo 必填项:
echo   - api_url: AgentOracle API 地址
echo   - api_key: 你的 API 密钥
echo   - agent_id: 你的 Agent ID
echo.
echo 详细配置说明请查看: plugin\CONFIG.md
echo.
echo ========================================
echo 故障排除
echo ========================================
echo.
echo 问题: 双击启动脚本没反应
echo 解决: 
echo   1. 使用 "启动AgentOracle(调试模式).bat"
echo   2. 查看错误信息
echo   3. 检查 plugin\config.json 是否正确配置
echo.
echo 问题: 提示缺少模块
echo 解决:
echo   1. 打开命令行
echo   2. cd 到本目录
echo   3. 运行: python_env\python.exe -m pip install 模块名
echo.
echo 问题: 想要更新依赖
echo 解决:
echo   python_env\python.exe -m pip install --upgrade 包名
echo.
echo ========================================
echo 开源信息
echo ========================================
echo.
echo 项目: AgentOracle Plugin
echo 许可: MIT License
echo 源码: plugin\ 目录下所有 .py 文件
echo 文档: plugin\docs\ 目录
echo.
echo 欢迎查看源代码，提出建议和改进！
echo.
) > "AgentOracle_Green\使用说明.txt"

REM 创建 README
(
echo # AgentOracle Green Edition
echo.
echo A fully portable, zero-installation version of AgentOracle plugin.
echo.
echo ## Features
echo.
echo - ✓ No Python installation required
echo - ✓ No dependencies installation needed
echo - ✓ Extract and run
echo - ✓ No system pollution
echo - ✓ Anti-virus friendly
echo - ✓ Fully open source
echo.
echo ## Quick Start
echo.
echo 1. Edit `plugin\config.json` with your API credentials
echo 2. Double-click `启动AgentOracle.bat`
echo 3. Done!
echo.
echo ## What's Inside
echo.
echo ```
echo AgentOracle_Green/
echo   ├── python_env/              # Embedded Python environment
echo   │   ├── python.exe           # Python interpreter
echo   │   └── Lib/site-packages/  # All dependencies
echo   ├── plugin/                  # Plugin source code
echo   │   ├── gui.py               # Main application
echo   │   └── config.json          # Configuration
echo   └── 启动AgentOracle.bat      # Launch script
echo ```
echo.
echo ## Why Green Edition?
echo.
echo 1. **Zero Friction**: Users don't need to know Python or install anything
echo 2. **Absolutely Safe**: Not a compiled black-box .exe, but official python.exe + plain .py scripts
echo 3. **No System Pollution**: All files in one folder, delete folder = complete uninstall
echo 4. **Fully Open Source**: All source code visible in plugin/ directory
echo.
echo ## System Requirements
echo.
echo - Windows 10/11 (64-bit)
echo - No additional software required
echo.
echo ## Configuration
echo.
echo Edit `plugin\config.json`:
echo.
echo ```json
echo {
echo   "api_url": "https://api.agentoracle.com",
echo   "api_key": "your-api-key",
echo   "agent_id": "your-agent-id"
echo }
echo ```
echo.
echo See `plugin\CONFIG.md` for detailed configuration options.
echo.
echo ## Troubleshooting
echo.
echo **Problem**: Nothing happens when double-clicking the launch script
echo **Solution**: Use `启动AgentOracle(调试模式).bat` to see error messages
echo.
echo **Problem**: Missing module error
echo **Solution**: `python_env\python.exe -m pip install module-name`
echo.
echo ## Open Source
echo.
echo - License: MIT
echo - Source Code: `plugin\` directory
echo - Documentation: `plugin\docs\` directory
echo.
echo Feel free to view, modify, and improve the code!
echo.
) > "AgentOracle_Green\README.md"

echo [完成] 文档创建完成
echo.

echo ========================================
echo 打包完成！
echo ========================================
echo.
echo 绿色版位置: AgentOracle_Green\
echo.
echo 目录大小:
for /f "tokens=3" %%a in ('dir "AgentOracle_Green" /s /-c ^| find "个文件"') do echo 约 %%a 字节
echo.
echo ========================================
echo 测试绿色版
echo ========================================
echo.
echo 建议先测试一下:
echo   1. cd AgentOracle_Green
echo   2. 编辑 plugin\config.json
echo   3. 双击 启动AgentOracle.bat
echo.
echo ========================================
echo 分发绿色版
echo ========================================
echo.
echo 1. 压缩 AgentOracle_Green 文件夹:
echo    右键 -> 发送到 -> 压缩文件
echo    或使用: 7-Zip, WinRAR 等工具
echo.
echo 2. 上传到 GitHub Release:
echo    - 文件名: AgentOracle_Green_v1.0.zip
echo    - 说明: 绿色便携版，解压即用
echo.
echo 3. 用户使用流程:
echo    下载 -> 解压 -> 编辑配置 -> 双击启动
echo.
echo ========================================
echo 跨平台说明
echo ========================================
echo.
echo 当前打包的是 Windows 版本
echo.
echo Mac/Linux 用户需要:
echo   - 使用虚拟环境方案
echo   - 或者在对应平台上重新打包
echo.
echo 建议为不同平台提供不同的下载包
echo.
pause
