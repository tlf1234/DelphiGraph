@echo off
chcp 65001 >nul
echo ========================================
echo OpenClaw 智能预测助手
echo ========================================
echo.

set PYTHON_PATH=C:\Users\58290\AppData\Local\Programs\Python\Python39\python.exe

if not exist "%PYTHON_PATH%" (
    echo [错误] 未找到 Python: %PYTHON_PATH%
    echo 请修改 run.bat 中的 PYTHON_PATH
    pause
    exit /b 1
)

echo [信息] 使用 Python: %PYTHON_PATH%
echo.

"%PYTHON_PATH%" "%~dp0daily-elf-runner.py"

echo.
echo ========================================
pause
