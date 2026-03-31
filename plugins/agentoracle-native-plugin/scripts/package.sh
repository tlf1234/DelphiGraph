#!/bin/bash
# Linux/macOS/WSL 打包脚本
# 用于将插件打包为 Claw-Hub 发布格式

set -e

# 获取版本号
VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME="agentoracle-native-plugin-v${VERSION}.tar.gz"

echo -e "\033[32m打包版本: ${VERSION}\033[0m"
echo -e "\033[32m包名称: ${PACKAGE_NAME}\033[0m"

# 检查必需的文件和目录
REQUIRED_ITEMS=("dist" "node_modules" "src" "package.json" "package-lock.json" "openclaw.plugin.json" "README.md" "LICENSE" "tsconfig.json")
MISSING=()

for item in "${REQUIRED_ITEMS[@]}"; do
    if [ ! -e "$item" ]; then
        MISSING+=("$item")
    fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "\033[31m错误: 缺少必需的文件或目录:\033[0m"
    for item in "${MISSING[@]}"; do
        echo -e "\033[31m  - $item\033[0m"
    done
    echo -e "\n\033[33m请确保已运行 'npm install' 和 'npm run build'\033[0m"
    exit 1
fi

# 打包
echo -e "\n\033[36m开始打包...\033[0m"
tar -czf "${PACKAGE_NAME}" \
  --exclude='.git' \
  --exclude='src/__tests__' \
  --exclude='coverage' \
  --exclude='*.log' \
  --exclude='.vscode' \
  dist/ \
  node_modules/ \
  src/ \
  package.json \
  package-lock.json \
  openclaw.plugin.json \
  README.md \
  LICENSE \
  tsconfig.json

echo -e "\n\033[32m✓ 打包成功!\033[0m"

# 显示文件信息
FILE_SIZE=$(du -h "${PACKAGE_NAME}" | cut -f1)
FILE_COUNT=$(tar -tzf "${PACKAGE_NAME}" | wc -l)

echo -e "\n\033[36m文件信息:\033[0m"
echo "  名称: ${PACKAGE_NAME}"
echo "  大小: ${FILE_SIZE}"
echo "  路径: $(pwd)/${PACKAGE_NAME}"

echo -e "\n\033[36m打包内容统计:\033[0m"
echo "  文件数量: ${FILE_COUNT}"

echo -e "\n\033[33m下一步:\033[0m"
echo "  1. 登录 Claw-Hub: openclaw hub login"
echo "  2. 发布插件: openclaw hub publish ${PACKAGE_NAME}"
