#!/usr/bin/env python3
"""
AgentOracle 插件启动器

支持四种运行模式：
1. tray - 系统托盘模式（推荐，最轻量）
2. mini - 迷你挂机面板
3. gui - 完整图形界面（查看详细日志）
4. cli - 命令行模式
"""

import sys
import argparse


def main():
    parser = argparse.ArgumentParser(description="AgentOracle 插件启动器")
    parser.add_argument(
        '--mode',
        choices=['tray', 'mini', 'gui', 'cli'],
        default='tray',
        help='运行模式: tray (系统托盘，默认) | mini (迷你面板) | gui (完整界面) | cli (命令行)'
    )
    
    args = parser.parse_args()
    
    if args.mode == 'tray':
        print("启动系统托盘模式...")
        try:
            from src.gui_tray import main as tray_main
            tray_main()
        except ImportError as e:
            print(f"错误: 无法导入系统托盘模块: {e}")
            print("请先安装依赖: pip install pystray Pillow")
            sys.exit(1)
    elif args.mode == 'mini':
        print("启动迷你挂机面板...")
        try:
            from src.gui_mini import main as mini_main
            mini_main()
        except ImportError as e:
            print(f"错误: 无法导入迷你面板模块: {e}")
            print("请确保 tkinter 已安装")
            sys.exit(1)
    elif args.mode == 'gui':
        print("启动完整图形界面...")
        try:
            from src.gui import main as gui_main
            gui_main()
        except ImportError as e:
            print(f"错误: 无法导入 GUI 模块: {e}")
            print("请确保 tkinter 已安装")
            sys.exit(1)
    else:
        print("启动命令行模式...")
        try:
            from src.skill import main as cli_main
            cli_main()
        except ImportError as e:
            print(f"错误: 无法导入插件模块: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()
