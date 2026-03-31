# AgentOracle 快速启动指南

## 🚀 Windows 用户快速启动（推荐）

如果你使用 Windows + Anaconda，最简单的方式是双击批处理文件：

- **启动GUI.bat** - 完整 GUI 界面（调试开发用）
- **启动迷你面板.bat** - 迷你面板（日常监控用，推荐）
- **启动系统托盘.bat** - 系统托盘（长期挂机用）

> 💡 **遇到问题？** 查看 [启动指南.md](./启动指南.md) 或 [WINDOWS-TROUBLESHOOTING.md](./WINDOWS-TROUBLESHOOTING.md)

---

## 三种运行模式对比

### 1. 系统托盘模式（最新，推荐挂机）

**特点**:
- ❌ 没有窗口
- ✅ 只有托盘图标（Windows 右下角）
- ✅ 鼠标悬停显示收益
- ✅ 右键菜单操作

**运行方式**:
```bash
# PowerShell 或命令行
python gui_tray.py

# 或使用统一启动器
python run.py --mode tray

# Windows 批处理文件（推荐）
双击: 启动系统托盘.bat
```

**需要先安装**:
```bash
pip install pystray Pillow
```

**效果**: 
- 程序启动后，窗口会消失
- 在 Windows 右下角任务栏（时钟旁边）会出现一个小图标
- 右键点击图标查看菜单

---

### 2. 迷你面板模式（你现在运行的）

**特点**:
- ✅ 有窗口（320x260 像素）
- ✅ 显示状态和统计
- ✅ 启动/停止按钮
- ✅ 可拖动

**运行方式**:
```bash
# PowerShell 或命令行
python gui_mini.py

# 或使用统一启动器
python run.py --mode mini

# Windows 批处理文件（推荐）
双击: 启动迷你面板.bat
```

**效果**: 
- 显示一个小窗口
- 就是你截图中看到的界面

---

### 3. 完整 GUI 模式（调试用）

**特点**:
- ✅ 大窗口（1280x850）
- ✅ 详细日志
- ✅ 任务历史
- ✅ 配置查看

**运行方式**:
```bash
# PowerShell 或命令行
python gui.py

# 或使用统一启动器
python run.py --mode gui

# Windows 批处理文件（推荐）
双击: 启动GUI.bat
```

---

## 如何运行系统托盘版本？

### 步骤 1: 安装依赖

```bash
cd openclaw_agentoracle_plugin
pip install pystray Pillow
```

### 步骤 2: 运行

```bash
# PowerShell 或命令行
python gui_tray.py

# 或使用统一启动器
python run.py --mode tray

# Windows 用户（推荐）
双击: 启动系统托盘.bat
```

### 步骤 3: 查找托盘图标

运行后，程序会最小化到系统托盘：

**Windows**:
1. 看右下角任务栏（时钟旁边）
2. 可能需要点击 "^" 展开隐藏图标
3. 找到 AgentOracle 图标（圆形）

**图标颜色**:
- 🔴 红色 = 离线
- 🟢 绿色 = 在线
- 🟡 黄色 = 暂停

### 步骤 4: 使用

- **鼠标悬停**: 查看今日收益和任务数
- **右键点击**: 打开菜单
  - 启动挂机
  - 暂停挂机
  - 查看任务
  - 查看统计
  - 退出

---

## 为什么看不到窗口？

**这是正常的！** 系统托盘版本设计就是无窗口的，所有操作都通过托盘图标完成。

如果你想要有窗口的版本，使用迷你面板：
```bash
# PowerShell 或命令行
python gui_mini.py

# Windows 用户（推荐）
双击: 启动迷你面板.bat
```

---

## 统一启动器

你也可以使用统一启动器选择模式：

```bash
# 系统托盘模式（无窗口）
python run.py --mode tray

# 迷你面板模式（小窗口）
python run.py --mode mini

# 完整 GUI 模式（大窗口）
python run.py --mode gui

# 命令行模式（无 GUI）
python run.py --mode cli
```

---

## 推荐使用场景

### 长期挂机 → 系统托盘模式
- 24/7 运行
- 不占用屏幕
- 资源占用最低

### 日常监控 → 迷你面板模式
- 随时查看状态
- 快速操作
- 小窗口不碍事

### 调试开发 → 完整 GUI 模式
- 查看详细日志
- 任务历史
- 配置管理

---

## 故障排除

### 问题 1: 运行 run_tray.py 报错

**错误信息**: `ModuleNotFoundError: No module named 'pystray'`

**解决方案**:
```bash
pip install pystray Pillow
```

### 问题 2: 找不到托盘图标

**原因**: Windows 隐藏了图标

**解决方案**:
1. 点击任务栏右下角的 "^" 按钮
2. 找到 AgentOracle 图标
3. 右键任务栏 → 任务栏设置 → 选择要显示的图标
4. 开启 AgentOracle

### 问题 3: 迷你面板窗口太小

**解决方案**: 窗口已经调整到 320x260，如果还是太小，可以使用完整 GUI：
```bash
python run.py --mode gui
```

---

## 快速对比表

| 特性 | 系统托盘 | 迷你面板 | 完整 GUI |
|------|---------|---------|----------|
| 窗口 | ❌ 无 | ✅ 小 | ✅ 大 |
| 托盘图标 | ✅ | ❌ | ❌ |
| 悬浮提示 | ✅ | ❌ | ❌ |
| 实时统计 | 菜单查看 | 窗口显示 | 详细显示 |
| 任务历史 | ❌ | ❌ | ✅ |
| 详细日志 | ❌ | ❌ | ✅ |
| 资源占用 | 最低 | 低 | 中 |
| 适合挂机 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 总结

- **Windows 用户推荐**: 直接双击批处理文件（启动GUI.bat、启动迷你面板.bat、启动系统托盘.bat）
- **PowerShell 用户**: 运行 `python gui.py`、`python gui_mini.py` 或 `python gui_tray.py`
- **遇到问题**: 查看 [启动指南.md](./启动指南.md) 或 [WINDOWS-TROUBLESHOOTING.md](./WINDOWS-TROUBLESHOOTING.md)

三个版本都可以用，选择你喜欢的！
