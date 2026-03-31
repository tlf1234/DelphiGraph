#!/bin/bash
# ============================================================================
# AgentOracle 绿色版打包脚本 (Mac/Linux)
# ============================================================================
# 使用 Python 虚拟环境创建便携版本
# Mac/Linux 没有 embeddable package，使用 venv 方案
# ============================================================================

set -e  # 遇到错误立即退出

echo "========================================"
echo "AgentOracle 绿色版打包工具 (Mac/Linux)"
echo "========================================"
echo ""

# 检查 Python 是否存在
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 Python3！"
    echo "请先安装 Python 3.9 或更高版本"
    exit 1
fi

PYTHON_CMD=$(which python3)
echo "使用 Python: $PYTHON_CMD"
PYTHON_VERSION=$($PYTHON_CMD --version)
echo "Python 版本: $PYTHON_VERSION"
echo ""

echo "========================================"
echo "步骤 1/5: 创建绿色版目录结构"
echo "========================================"
echo ""

rm -rf AgentOracle_Green
mkdir -p AgentOracle_Green/python_env
mkdir -p AgentOracle_Green/plugin

echo "[完成] 目录创建完成"
echo ""

echo "========================================"
echo "步骤 2/5: 创建 Python 虚拟环境"
echo "========================================"
echo ""

$PYTHON_CMD -m venv AgentOracle_Green/python_env

echo "[完成] 虚拟环境创建完成"
echo ""

echo "========================================"
echo "步骤 3/5: 安装依赖到绿色环境"
echo "========================================"
echo ""

source AgentOracle_Green/python_env/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

echo "[完成] 依赖安装完成"
echo ""

echo "========================================"
echo "步骤 4/5: 复制插件文件"
echo "========================================"
echo ""

# 复制所有必要文件
cp *.py AgentOracle_Green/plugin/ 2>/dev/null || true
cp *.json AgentOracle_Green/plugin/ 2>/dev/null || true
cp *.md AgentOracle_Green/plugin/ 2>/dev/null || true
cp requirements.txt AgentOracle_Green/plugin/ 2>/dev/null || true

# 复制文档
if [ -d "doc" ]; then
    cp -r doc AgentOracle_Green/plugin/
fi
if [ -d "docs" ]; then
    cp -r docs AgentOracle_Green/plugin/
fi

echo "[完成] 插件文件复制完成"
echo ""

echo "========================================"
echo "步骤 5/5: 创建启动脚本"
echo "========================================"
echo ""

# Mac 启动脚本 (.command 文件可以双击运行)
cat > AgentOracle_Green/启动AgentOracle.command << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source python_env/bin/activate
python plugin/gui.py
deactivate
EOF
chmod +x AgentOracle_Green/启动AgentOracle.command

# Linux 启动脚本
cat > AgentOracle_Green/启动AgentOracle.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source python_env/bin/activate
python plugin/gui.py
deactivate
EOF
chmod +x AgentOracle_Green/启动AgentOracle.sh

# 后台启动脚本（无终端窗口）
cat > AgentOracle_Green/启动AgentOracle_后台.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source python_env/bin/activate
nohup python plugin/gui.py > /dev/null 2>&1 &
deactivate
EOF
chmod +x AgentOracle_Green/启动AgentOracle_后台.sh

echo "[完成] 启动脚本创建完成"
echo ""

echo "========================================"
echo "创建使用文档"
echo "========================================"
echo ""

# 创建使用说明
cat > AgentOracle_Green/使用说明.txt << 'EOF'
========================================
AgentOracle 绿色版 - 使用说明
========================================

这是一个完全绿色便携的版本，特点：

✓ 无需安装 Python（Mac 系统自带 Python 除外）
✓ 无需安装任何依赖
✓ 解压即用，删除即净
✓ 不污染系统环境
✓ 完全开源透明

========================================
快速开始
========================================

Mac 用户:
  1. 编辑 plugin/config.json 配置 API 信息
  2. 双击 "启动AgentOracle.command"
  
Linux 用户:
  1. 编辑 plugin/config.json 配置 API 信息
  2. 打开终端，cd 到本目录
  3. 运行: ./启动AgentOracle.sh
  
后台运行（无终端窗口）:
  ./启动AgentOracle_后台.sh

========================================
目录结构
========================================

AgentOracle_Green/
  ├── python_env/              # Python 虚拟环境
  │   ├── bin/python           # Python 解释器
  │   └── lib/site-packages/  # 所有依赖库
  │
  ├── plugin/                  # 插件源代码
  │   ├── gui.py               # 主程序
  │   ├── config.json          # 配置文件
  │   └── docs/                # 文档
  │
  ├── 启动AgentOracle.command  # Mac 启动脚本
  ├── 启动AgentOracle.sh       # Linux 启动脚本
  └── 使用说明.txt             # 本文件

========================================
系统要求
========================================

Mac:
  - macOS 10.14 或更高版本
  - 可能需要安装 Xcode Command Line Tools
    运行: xcode-select --install

Linux:
  - Ubuntu 18.04+ / Debian 10+ / Fedora 30+
  - 需要安装 python3-tk
    Ubuntu/Debian: sudo apt install python3-tk
    Fedora: sudo dnf install python3-tkinter

========================================
为什么选择绿色版？
========================================

1. 零门槛
   用户不需要懂 Python，不需要配置环境
   下载 -> 解压 -> 双击，三步完成

2. 不污染系统
   所有文件都在这个文件夹里
   不修改系统配置
   删除文件夹 = 完全卸载

3. 完全开源
   所有源代码都在 plugin/ 目录
   可以随意查看、修改、学习

========================================
配置说明
========================================

配置文件: plugin/config.json

必填项:
  - api_url: AgentOracle API 地址
  - api_key: 你的 API 密钥
  - agent_id: 你的 Agent ID

详细配置说明请查看: plugin/CONFIG.md

========================================
故障排除
========================================

问题: Mac 提示"无法打开，因为它来自身份不明的开发者"
解决:
  1. 右键点击启动脚本
  2. 选择"打开"
  3. 点击"打开"确认

问题: 权限错误
解决:
  chmod +x 启动AgentOracle.command
  chmod +x 启动AgentOracle.sh

问题: 提示缺少模块
解决:
  source python_env/bin/activate
  pip install 模块名
  deactivate

问题: Linux 提示缺少 tkinter
解决:
  Ubuntu/Debian: sudo apt install python3-tk
  Fedora: sudo dnf install python3-tkinter

========================================
开源信息
========================================

项目: AgentOracle Plugin
许可: MIT License
源码: plugin/ 目录下所有 .py 文件
文档: plugin/docs/ 目录

欢迎查看源代码，提出建议和改进！

EOF

# 创建 README
cat > AgentOracle_Green/README.md << 'EOF'
# AgentOracle Green Edition (Mac/Linux)

A fully portable version of AgentOracle plugin with embedded Python environment.

## Features

- ✓ Minimal dependencies (uses system Python on Mac)
- ✓ All dependencies included
- ✓ Extract and run
- ✓ No system pollution
- ✓ Fully open source

## Quick Start

### Mac
1. Edit `plugin/config.json` with your API credentials
2. Double-click `启动AgentOracle.command`

### Linux
1. Edit `plugin/config.json` with your API credentials
2. Run: `./启动AgentOracle.sh`

## What's Inside

```
AgentOracle_Green/
  ├── python_env/              # Python virtual environment
  │   ├── bin/python           # Python interpreter
  │   └── lib/site-packages/  # All dependencies
  ├── plugin/                  # Plugin source code
  │   ├── gui.py               # Main application
  │   └── config.json          # Configuration
  └── 启动AgentOracle.command  # Launch script (Mac)
```

## System Requirements

### Mac
- macOS 10.14 or later
- May need Xcode Command Line Tools: `xcode-select --install`

### Linux
- Ubuntu 18.04+ / Debian 10+ / Fedora 30+
- python3-tk package:
  - Ubuntu/Debian: `sudo apt install python3-tk`
  - Fedora: `sudo dnf install python3-tkinter`

## Configuration

Edit `plugin/config.json`:

```json
{
  "api_url": "https://api.agentoracle.com",
  "api_key": "your-api-key",
  "agent_id": "your-agent-id"
}
```

See `plugin/CONFIG.md` for detailed configuration options.

## Troubleshooting

**Mac: "Cannot be opened because it is from an unidentified developer"**
- Right-click the script -> Open -> Open (confirm)

**Permission denied**
- `chmod +x 启动AgentOracle.command`
- `chmod +x 启动AgentOracle.sh`

**Missing tkinter (Linux)**
- Ubuntu/Debian: `sudo apt install python3-tk`
- Fedora: `sudo dnf install python3-tkinter`

## Open Source

- License: MIT
- Source Code: `plugin/` directory
- Documentation: `plugin/docs/` directory

Feel free to view, modify, and improve the code!

EOF

echo "[完成] 文档创建完成"
echo ""

echo "========================================"
echo "打包完成！"
echo "========================================"
echo ""
echo "绿色版位置: AgentOracle_Green/"
echo ""
echo "目录大小:"
du -sh AgentOracle_Green/
echo ""

echo "========================================"
echo "测试绿色版"
echo "========================================"
echo ""
echo "建议先测试一下:"
echo "  1. cd AgentOracle_Green"
echo "  2. 编辑 plugin/config.json"
echo "  3. Mac: 双击 启动AgentOracle.command"
echo "     Linux: ./启动AgentOracle.sh"
echo ""

echo "========================================"
echo "分发绿色版"
echo "========================================"
echo ""
echo "1. 压缩 AgentOracle_Green 文件夹:"
echo "   tar -czf AgentOracle_Green_Mac.tar.gz AgentOracle_Green/"
echo "   或"
echo "   zip -r AgentOracle_Green_Mac.zip AgentOracle_Green/"
echo ""
echo "2. 上传到 GitHub Release:"
echo "   - Mac 版: AgentOracle_Green_Mac.tar.gz"
echo "   - Linux 版: AgentOracle_Green_Linux.tar.gz"
echo ""
echo "3. 用户使用流程:"
echo "   下载 -> 解压 -> 编辑配置 -> 运行启动脚本"
echo ""

echo "========================================"
echo "注意事项"
echo "========================================"
echo ""
echo "Mac 用户:"
echo "  - 首次运行可能需要在系统偏好设置中允许"
echo "  - 或右键点击脚本选择"打开""
echo ""
echo "Linux 用户:"
echo "  - 确保已安装 python3-tk"
echo "  - 某些发行版可能需要额外的依赖"
echo ""
