@echo off
chcp 65001 >nul
echo ========================================
echo OpenClaw WebSocket 稳定性测试
echo ========================================
echo.

C:\Users\58290\AppData\Local\Programs\Python\Python39\python.exe "%~dp0test_stability.py"

echo.
echo ========================================
echo 测试完成！
echo ========================================
pause
