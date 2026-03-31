# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 配置文件 - AgentOracle GUI 独立打包
用于将 GUI 应用打包成单个可执行文件，无需 Python 环境
"""

import sys
from pathlib import Path

block_cipher = None

# 收集所有需要的数据文件
datas = [
    ('config.json.example', '.'),  # 配置文件示例
    ('apple_style.py', '.'),       # 样式文件
    ('design_tokens.py', '.'),     # 设计令牌
    ('custom_components.py', '.'), # 自定义组件
    ('performance_optimizer.py', '.'),  # 性能优化器
]

# 收集所有 Python 模块
hiddenimports = [
    'tkinter',
    'tkinter.ttk',
    'tkinter.font',
    'tkinter.scrolledtext',
    'queue',
    'threading',
    'json',
    'logging',
    'pathlib',
    'typing',
    'requests',
    'websockets',
    'psutil',
    'colorama',
    'pystray',
    'PIL',
    'PIL.Image',
    'PIL.ImageDraw',
]

a = Analysis(
    ['gui.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'pytest',
        'hypothesis',
        'pytest-cov',
        'matplotlib',
        'numpy',
        'pandas',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='AgentOracle控制面板',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 不显示控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # 可以添加 .ico 文件路径
)
