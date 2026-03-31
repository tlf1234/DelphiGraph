# 快速启动指南

## 首次使用

### 步骤 1: 安装依赖

**方法 A: 使用安装脚本（推荐）**

双击运行 `install_dependencies.bat`

**方法 B: 手动安装**

```cmd
cd E:\dev_use\AIagentOracle\plugins\openclaw_agentoracle_plugin
D:\Users\58290\miniconda3_new\python.exe -m pip install -r requirements.txt
```

### 步骤 2: 启动 GUI

双击运行 `启动GUI.bat`

## 后续使用

直接双击 `启动GUI.bat` 即可。

## 常见问题

### Q: 提示 "ModuleNotFoundError: No module named 'websockets'"

**A:** 说明依赖未安装，请先运行 `install_dependencies.bat`

### Q: 为什么要分两步？

**A:** 这是 Python 项目的标准实践：
- ✅ 依赖只需安装一次
- ✅ 启动速度更快
- ✅ 符合行业标准
- ✅ 离线环境也能使用

### Q: 如何验证依赖已安装？

**A:** 运行以下命令：
```cmd
D:\Users\58290\miniconda3_new\python.exe -c "import websockets, requests, psutil; print('✅ 所有依赖已安装')"
```

## 文件说明

- `requirements.txt` - 依赖列表
- `install_dependencies.bat` - 安装依赖脚本
- `启动GUI.bat` - 启动 GUI 脚本
- `gui.py` - GUI 主程序

## 标准流程

```
首次使用:
┌─────────────────────────┐
│ install_dependencies.bat│  ← 安装依赖（只需一次）
└─────────────────────────┘
           ↓
┌─────────────────────────┐
│      启动GUI.bat        │  ← 启动程序
└─────────────────────────┘

后续使用:
┌─────────────────────────┐
│      启动GUI.bat        │  ← 直接启动
└─────────────────────────┘
```
