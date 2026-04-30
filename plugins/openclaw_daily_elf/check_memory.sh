#!/bin/bash
# 检查 OpenClaw 记忆数据库内容

DB_PATH="$HOME/.openclaw/memory/main.sqlite"

echo "=== OpenClaw 记忆数据库检查 ==="
echo ""

echo "1. 数据库文件信息:"
ls -lh "$DB_PATH"
echo ""

echo "2. 数据库表结构:"
sqlite3 "$DB_PATH" <<EOF
.tables
EOF
echo ""

echo "3. 查看表结构:"
sqlite3 "$DB_PATH" <<EOF
.schema
EOF
echo ""

echo "4. 记录数量:"
sqlite3 "$DB_PATH" <<EOF
SELECT name, COUNT(*) as count FROM sqlite_master WHERE type='table' GROUP BY name;
EOF
echo ""

echo "5. 尝试查看部分数据 (如果有 memories 表):"
sqlite3 "$DB_PATH" <<EOF
SELECT * FROM memories LIMIT 5;
EOF 2>/dev/null || echo "没有 memories 表或查询失败"
echo ""

echo "6. 尝试查看所有表的前几行:"
for table in $(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table';"); do
    echo "表: $table"
    sqlite3 "$DB_PATH" "SELECT * FROM $table LIMIT 3;" 2>/dev/null || echo "  无法查询"
    echo ""
done
