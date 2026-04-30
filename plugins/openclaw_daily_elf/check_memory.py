#!/usr/bin/env python3
# 检查 OpenClaw 记忆数据库内容

import sqlite3
import os
from pathlib import Path

DB_PATH = Path.home() / ".openclaw" / "memory" / "main.sqlite"

print("=== OpenClaw 记忆数据库检查 ===\n")

if not DB_PATH.exists():
    print(f"❌ 数据库文件不存在: {DB_PATH}")
    exit(1)

print(f"✅ 数据库文件: {DB_PATH}")
print(f"   大小: {DB_PATH.stat().st_size / 1024:.2f} KB\n")

try:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. 获取所有表
    print("1. 数据库表:")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    for table in tables:
        print(f"   - {table[0]}")
    print()
    
    # 2. 对每个表查看结构和数据
    for table in tables:
        table_name = table[0]
        print(f"2. 表 '{table_name}' 的结构:")
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        for col in columns:
            print(f"   - {col[1]} ({col[2]})")
        print()
        
        # 查看记录数
        cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
        count = cursor.fetchone()[0]
        print(f"   记录数: {count}")
        
        if count > 0:
            print(f"   前3条记录:")
            cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;")
            rows = cursor.fetchall()
            for i, row in enumerate(rows, 1):
                print(f"   [{i}] {row}")
        print()
    
    conn.close()
    print("✅ 检查完成")
    
except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()
