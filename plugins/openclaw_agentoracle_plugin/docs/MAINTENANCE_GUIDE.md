# 维护指南 / Maintenance Guide

[中文](#中文) | [English](#english)

---

<a name="中文"></a>
## 📖 中文文档

本文档说明 OpenClaw AgentOracle 插件 GUI 的代码结构、模块职责、调试方法和功能扩展指南。

### 目录

- [代码结构](#代码结构)
- [模块职责](#模块职责)
- [样式系统架构](#样式系统架构)
- [调试样式问题](#调试样式问题)
- [添加新功能](#添加新功能)
- [性能优化](#性能优化)
- [测试指南](#测试指南)

---

### 代码结构

#### 项目目录结构

```
plugins/openclaw_agentoracle_plugin/
├── design_tokens.py          # 设计令牌（颜色、字体、间距等）
├── apple_style.py             # 样式管理器
├── custom_components.py       # 自定义组件
├── gui.py                     # 主 GUI 界面
├── performance_optimizer.py   # 性能优化器
├── agent_manager.py           # Agent 管理器
├── api_client.py              # API 客户端
├── config.json                # 配置文件
├── requirements.txt           # 依赖列表
├── docs/                      # 文档目录
│   ├── STYLE_CONFIGURATION.md
│   ├── COMPONENT_USAGE.md
│   └── MAINTENANCE_GUIDE.md
├── test_styles.py             # 样式测试
├── test_accessibility.py      # 可访问性测试
├── test_performance.py        # 性能测试
└── verify_contrast.py         # 对比度验证
```

#### 核心文件说明

| 文件 | 行数 | 职责 | 依赖 |
|------|------|------|------|
| `design_tokens.py` | ~150 | 定义所有设计令牌 | 无 |
| `apple_style.py` | ~800 | 样式管理和应用 | design_tokens.py |
| `custom_components.py` | ~600 | 自定义 UI 组件 | design_tokens.py |
| `gui.py` | ~1500 | 主界面和业务逻辑 | apple_style.py, custom_components.py |
| `performance_optimizer.py` | ~300 | 性能监控和优化 | 无 |

---

### 模块职责

#### 1. design_tokens.py - 设计令牌

**职责**：
- 定义所有可复用的设计值
- 提供浅色和深色主题配色
- 定义字体、间距、圆角、边框常量

**关键类**：
```python
class ColorPalette:
    class Light: ...
    class Dark: ...

class Typography: ...
class Spacing: ...
class BorderRadius: ...
class BorderWidth: ...
```

**修改指南**：
- 修改颜色时必须验证对比度（运行 `verify_contrast.py`）
- 保持间距值为 4 或 8 的倍数
- 字体族必须提供回退选项

**依赖关系**：
- 被 `apple_style.py` 导入
- 被 `custom_components.py` 导入
- 不依赖其他模块

---

#### 2. apple_style.py - 样式管理器

**职责**：
- 管理 ttk.Style 配置
- 应用样式到所有 ttk 组件
- 提供主题切换功能
- 提供辅助函数（颜色操作、对比度计算等）

**关键类和方法**：
```python
class AppleStyleManager:
    def __init__(self, root, theme="light")
    def apply_styles()
    def configure_button_styles()
    def configure_entry_styles()
    def configure_notebook_styles()
    def configure_treeview_styles()
    def configure_frame_styles()
    def switch_theme(theme)
```

**修改指南**：
- 添加新组件样式时，创建 `configure_xxx_styles()` 方法
- 在 `apply_styles()` 中调用新方法
- 使用 `safe_apply_style()` 包装样式应用以处理错误

---

#### 3. custom_components.py - 自定义组件

**职责**：
- 提供 Tkinter 原生不支持的 UI 组件
- 实现圆角按钮、卡片、状态指示器等
- 提供辅助函数（工具提示、对话框等）

**关键类和函数**：
```python
class RoundedButton(tk.Canvas): ...
class CardFrame(tk.Frame): ...
class StatusIndicator(tk.Frame): ...
class LoadingIndicator(tk.Canvas): ...

def add_tooltip(widget, text, theme="light")
def show_confirmation_dialog(parent, title, message, theme="light") -> bool
def show_status_message(parent, message, status="info", duration=3000, theme="light")
```

---

#### 4. gui.py - 主 GUI 界面

**职责**：
- 创建主窗口和所有 UI 组件
- 处理用户交互和事件
- 管理业务逻辑（任务处理、日志显示等）
- 集成样式管理器和自定义组件

**关键类和方法**：
```python
class AgentOracleGUI:
    def __init__(self, root)
    def create_widgets()
    def create_control_panel()
    def create_stats_display()
    def create_notebook()
    def start_plugin()
    def stop_plugin()
    def add_log(message, level)
    def update_stats()
```

---

### 样式系统架构

#### 数据流

```
用户修改 design_tokens.py
    ↓
AppleStyleManager 读取令牌
    ↓
配置 ttk.Style
    ↓
应用到 GUI 组件
    ↓
用户看到新样式
```

#### 样式应用流程

```python
# 1. 创建样式管理器
style_manager = AppleStyleManager(root, theme="light")

# 2. 应用所有样式
style_manager.apply_styles()

# 3. 在组件中使用样式
button = ttk.Button(parent, text="按钮", style="Primary.TButton")
```

---

### 调试样式问题

#### 1. 样式未生效

**症状**：修改 design_tokens.py 后样式没有变化

**调试步骤**：

```python
# 1. 检查样式管理器是否正确初始化
print(f"样式管理器主题: {gui.style_manager.current_theme}")

# 2. 检查样式是否已应用
print(f"已配置的样式: {gui.style_manager.style.theme_names()}")

# 3. 检查组件是否使用了正确的样式
button = gui.start_button
print(f"按钮样式: {button.cget('style')}")
```

**常见原因**：
- 忘记重启 GUI
- 组件没有指定 `style` 参数
- 样式名称拼写错误

---

#### 2. 颜色显示不正确

**调试步骤**：

```python
# 1. 验证颜色值格式
from design_tokens import ColorPalette
print(f"ACCENT 颜色: {ColorPalette.Light.ACCENT}")

# 2. 验证对比度
python verify_contrast.py
```

---

#### 3. 字体显示异常

**调试步骤**：

```python
# 1. 检查可用字体
import tkinter.font as tkfont
available_fonts = tkfont.families()
print("可用字体:", available_fonts)

# 2. 检查字体是否存在
from design_tokens import Typography
for font in Typography.FONT_FAMILY:
    if font in available_fonts:
        print(f"✓ {font} 可用")
    else:
        print(f"✗ {font} 不可用")
```

---

### 添加新功能

#### 1. 添加新的设计令牌

```python
# 1. 在 design_tokens.py 中添加新令牌
class ColorPalette:
    class Light:
        # 现有颜色...
        HIGHLIGHT = "#FFEB3B"  # 新增高亮色

# 2. 验证对比度
python verify_contrast.py

# 3. 在样式管理器中使用
def configure_highlight_styles(self):
    self.style.configure(
        "Highlight.TLabel",
        background=ColorPalette.Light.HIGHLIGHT
    )
```

---

#### 2. 添加新的组件样式

```python
# 1. 在 apple_style.py 中添加配置方法
def configure_my_component_styles(self):
    style = self.style
    style.configure(
        "MyComponent.TFrame",
        background=ColorPalette.Light.SURFACE,
        padding=Spacing.MD
    )

# 2. 在 apply_styles 中调用
def apply_styles(self):
    # ... 现有样式 ...
    self.configure_my_component_styles()
```

---

#### 3. 添加新的自定义组件

```python
# 在 custom_components.py 中创建新类
class MyCustomComponent(tk.Canvas):
    def __init__(self, parent, theme="light", **kwargs):
        if theme == "light":
            self.bg_color = ColorPalette.Light.SURFACE
        else:
            self.bg_color = ColorPalette.Dark.SURFACE
        
        super().__init__(parent, bg=self.bg_color, **kwargs)
        self.draw()
    
    def draw(self):
        self.delete("all")
        # 绘制逻辑...
```

---

### 性能优化

#### 1. 启动性能优化

```python
class AgentOracleGUI:
    def __init__(self, root):
        # 立即创建关键组件
        self.create_control_panel()
        
        # 延迟创建其他组件
        self.root.after(100, self.create_notebook)
```

---

#### 2. 日志更新优化

```python
class AgentOracleGUI:
    def __init__(self, root):
        self.log_buffer = []
        self.max_log_lines = 1000
    
    def add_log(self, message, level):
        """批量更新日志"""
        self.log_buffer.append((message, level))
        if not self.log_update_scheduled:
            self.root.after(100, self.flush_log_buffer)
```

---

### 测试指南

#### 1. 样式测试

```bash
python test_styles.py
```

#### 2. 可访问性测试

```bash
python test_accessibility.py
```

#### 3. 性能测试

```bash
python test_performance.py
```

#### 4. 对比度验证

```bash
python verify_contrast.py
```

---

### 相关文档

- [样式配置文档](./STYLE_CONFIGURATION.md) - 如何修改设计令牌
- [组件使用文档](./COMPONENT_USAGE.md) - 如何使用自定义组件

---

**需求验证**: 19.1-19.5 - 代码结构清晰，提供调试和扩展指南

---

**Version**: 1.0.0  
**Last Updated**: 2024-01-15  
**Maintainer**: OpenClaw Team
