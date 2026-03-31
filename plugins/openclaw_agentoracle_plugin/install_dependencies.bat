@echo off
chcp 65001 >nul
REM AgentOracle 依赖安装脚本

echo ========================================
echo AgentOracle 依赖安装
echo ========================================
echo.

REM 使用你的 Python 路径
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
echo.

REM 显示当前 Python 版本
echo Python 版本:
"%PYTHON_CMD%" --version
echo.

REM 升级 pip
echo 升级 pip...
"%PYTHON_CMD%" -m pip install --upgrade pip
echo.

REM 安装依赖
echo 安装依赖包...
echo.
"%PYTHON_CMD%" -m pip install -r requirements.txt

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo ✅ 依赖安装成功！
    echo ========================================
    echo.
    echo 现在可以运行 启动GUI.bat 启动插件
    echo.
) else (
    echo.
    echo ========================================
    echo ❌ 依赖安装失败！
    echo ========================================
    echo.
    echo 请检查网络连接和 Python 环境
    echo.
)

pause
