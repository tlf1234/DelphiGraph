@echo off
chcp 65001 >nul
REM AgentOracle GUI Launcher

echo ========================================
echo AgentOracle Control Panel
echo ========================================
echo.

REM Find Python command
set PYTHON_CMD=

REM OPTION 1: Hardcoded path for Anaconda users (uncomment the line below)
REM set PYTHON_CMD=D:\Users\58290\miniconda3_new\python.exe

REM If hardcoded path is set, use it
if defined PYTHON_CMD (
    if exist "%PYTHON_CMD%" (
        goto :run
    )
)

REM OPTION 2: Try to auto-detect Python
REM Try python command first (works in PowerShell/Anaconda)
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
    goto :run
)

REM Try py command (Windows Python Launcher)
py --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=py
    goto :run
)

REM Try python3 command
python3 --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python3
    goto :run
)

REM Python not found
echo [ERROR] Python not found!
echo.
echo If you are using Anaconda, please use one of these methods:
echo 1. Use PowerShell: python gui.py
echo 2. Use the Chinese batch file: 启动GUI.bat (recommended)
echo 3. Edit this file and uncomment line 12, then set your Python path
echo.
echo Example: set PYTHON_CMD=D:\Users\YourName\miniconda3\python.exe
echo.
pause
exit /b 1

:run
echo Using Python: %PYTHON_CMD%
echo Starting GUI...
echo.
"%PYTHON_CMD%" gui.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to start!
    echo.
    echo Possible solutions:
    echo 1. Install dependencies: "%PYTHON_CMD%" -m pip install -r requirements.txt
    echo 2. Check config.json file
    echo 3. Ensure tkinter is installed
    echo 4. See WINDOWS-TROUBLESHOOTING.md for more help
    echo.
    pause
)
