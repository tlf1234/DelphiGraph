@echo off
chcp 65001 >nul
REM AgentOracle GUI 启动器 (Anaconda版本)

echo ========================================
echo AgentOracle 控制面板
echo ========================================
echo.

REM 直接使用你的 Python 路径
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

echo 使用 Python: %PYTHON_CMD%
echo 正在启动 GUI...
echo.

REM 运行 src 目录中的 gui.py
"%PYTHON_CMD%" src\gui.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 启动失败！
    echo.
    echo 如果提示缺少模块，请先运行: install_dependencies.bat
    echo 或手动安装: %PYTHON_CMD% -m pip install -r requirements.txt
    echo.
    pause
)
