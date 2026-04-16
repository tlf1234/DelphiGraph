#!/usr/bin/env python3
"""
AgentOracle 插件图形用户界面

提供友好的图形界面来管理和监控插件运行状态
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import threading
import queue
import json
import logging
import os
import sys
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# Support both module and direct execution
try:
    from .skill import PluginManager, BackgroundDaemon
    from .logger import setup_logger
    from .submission_logger import SubmissionLogger
except ImportError:
    from skill import PluginManager, BackgroundDaemon
    from logger import setup_logger
    from submission_logger import SubmissionLogger


class GUILogHandler(logging.Handler):
    """自定义日志处理器，将日志发送到 GUI 队列"""
    
    def __init__(self, log_queue):
        super().__init__()
        self.log_queue = log_queue
    
    def emit(self, record):
        try:
            msg = self.format(record)
            level = record.levelname
            # 映射日志级别到 GUI 标签
            if level == "INFO":
                gui_level = "INFO"
            elif level == "WARNING":
                gui_level = "WARNING"
            elif level == "ERROR":
                gui_level = "ERROR"
            else:
                gui_level = "INFO"
            
            self.log_queue.put((msg, gui_level))
        except Exception:
            self.handleError(record)


class AgentOracleGUI:
    """AgentOracle 插件图形用户界面"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("AgentOracle 插件节点面板")
        self.root.geometry("900x700")
        self.root.resizable(True, True)
        
        # 插件管理器
        self.plugin_manager: Optional[PluginManager] = None
        self.is_running = False
        
        # 原始配置（用于保存时恢复被隐藏的字段）
        self.original_config = {}
        
        # 统计数据
        self.stats = {
            'total_tasks': 0,
            'successful': 0,
            'failed': 0,
            'today_tasks': 0,
            'today_successful': 0,
            'today_failed': 0,
            'start_time': None,
            'today_date': datetime.now().date()  # 记录当前日期
        }
        
        # 任务历史（最多保存 20 条）
        self.task_history = []
        
        # 日志队列
        self.log_queue = queue.Queue()
        
        # 仿真状态
        self._sim_running = False
        self._sim_abort = threading.Event()
        
        # 设置日志记录器并添加 GUI 处理器
        self.logger = setup_logger()
        self.gui_log_handler = GUILogHandler(self.log_queue)
        self.gui_log_handler.setFormatter(logging.Formatter('[%(asctime)s] %(message)s', datefmt='%H:%M:%S'))
        self.logger.addHandler(self.gui_log_handler)
        
        # 配置全局字体 - 使用微软雅黑，更清晰
        self.default_font = ("Microsoft YaHei UI", 10)
        self.bold_font = ("Microsoft YaHei UI", 10, "bold")
        self.large_font = ("Microsoft YaHei UI", 13, "bold")
        self.mono_font = ("Consolas", 10)
        
        # 配置标签页样式（微调选定效果和间隙）
        style = ttk.Style()
        
        # 配置 Notebook 标签页样式 - 保持原有风格，只微调
        style.configure('TNotebook.Tab', 
                       padding=[12, 8])  # 适当增加标签内边距（左右12px，上下8px）
        
        # 选中状态的标签样式 - 使用灰色系，更subtle
        style.map('TNotebook.Tab',
                 background=[('selected', '#d0d0d0')],  # 选中时使用稍深的灰色
                 expand=[('selected', [1, 1, 1, 0])])   # 选中时稍微扩展
        
        # 配置按钮样式 - 添加圆角效果
        style.configure('TButton',
                       padding=[10, 5],
                       relief='flat',
                       borderwidth=1)
        style.map('TButton',
                 relief=[('pressed', 'sunken'), ('active', 'flat')],
                 borderwidth=[('pressed', 2), ('active', 1)])
        
        # 配置 LabelFrame 样式 - 柔和边框
        style.configure('TLabelframe',
                       borderwidth=1,
                       relief='solid')
        style.configure('TLabelframe.Label',
                       padding=[5, 2])
        
        # 配置 Frame 样式
        style.configure('TFrame',
                       borderwidth=0,
                       relief='flat')
        
        # 配置 Treeview 样式 - 柔和的表格
        style.configure('Treeview',
                       borderwidth=1,
                       relief='solid',
                       rowheight=25)
        style.configure('Treeview.Heading',
                       padding=[5, 3],
                       relief='flat',
                       borderwidth=1)
        
        # 创建 UI 组件
        self.create_widgets()
        
        # 启动日志更新线程
        self.update_logs()
        
        # 尝试加载配置
        self.load_config_display()
        
        # 初始化提交记录管理器
        self.submission_logger = SubmissionLogger()
        
        # 加载提交记录
        self.refresh_submissions()
        
        # 初始化API客户端并获取用户统计信息（在GUI启动时就获取）
        self.root.after(500, self.initialize_api_client)  # 延迟500ms确保UI已完全加载
    
    def create_widgets(self):
        """创建所有 UI 组件"""
        
        # ===== 顶部控制面板 =====
        control_frame = ttk.LabelFrame(self.root, text="控制面板", padding=10)
        control_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # 状态指示器
        status_frame = ttk.Frame(control_frame)
        status_frame.pack(side=tk.LEFT, padx=5)
        
        ttk.Label(status_frame, text="状态:", font=self.default_font).pack(side=tk.LEFT)
        self.status_label = ttk.Label(status_frame, text="● 已停止", foreground="red", font=self.bold_font)
        self.status_label.pack(side=tk.LEFT, padx=5)
        
        # 控制按钮
        button_frame = ttk.Frame(control_frame)
        button_frame.pack(side=tk.RIGHT, padx=5)
        
        self.start_button = ttk.Button(button_frame, text="▶ 启动", command=self.start_plugin, width=10)
        self.start_button.pack(side=tk.LEFT, padx=2)
        
        self.stop_button = ttk.Button(button_frame, text="⏹ 停止", command=self.stop_plugin, width=10, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=2)
        
        ttk.Button(button_frame, text="⚙ 配置", command=self.open_config, width=10).pack(side=tk.LEFT, padx=2)
        
        # ===== 统计信息面板 =====
        stats_frame = ttk.LabelFrame(self.root, text="📊 运行统计", padding=15)
        stats_frame.pack(fill=tk.X, padx=10, pady=8)
        
        # 添加一个内部容器，增加视觉层次
        stats_container = ttk.Frame(stats_frame)
        stats_container.pack(fill=tk.X, padx=5, pady=5)
        
        # 创建统计标签
        stats_grid = ttk.Frame(stats_container)
        stats_grid.pack(fill=tk.X)
        
        # ===== 第一行：收益信息（突出显示）=====
        # 当天收益
        ttk.Label(stats_grid, text="💰 今日收益:", font=self.default_font).grid(row=0, column=0, sticky=tk.W, padx=5)
        self.today_earnings_label = ttk.Label(stats_grid, text="$0.00", 
                                              foreground="#FF6B35", 
                                              font=self.large_font)
        self.today_earnings_label.grid(row=0, column=1, sticky=tk.W, padx=5)
        
        # 总收益
        ttk.Label(stats_grid, text="💎 总收益:", font=self.default_font).grid(row=0, column=2, sticky=tk.W, padx=5)
        self.total_earnings_label = ttk.Label(stats_grid, text="$0.00", 
                                              foreground="#4ECDC4", 
                                              font=self.large_font)
        self.total_earnings_label.grid(row=0, column=3, sticky=tk.W, padx=5)
        
        # 声望
        ttk.Label(stats_grid, text="⭐ 声望:", font=self.default_font).grid(row=0, column=4, sticky=tk.W, padx=5)
        self.reputation_label = ttk.Label(stats_grid, text="0 (Novice)", 
                                         foreground="#9B59B6", 
                                         font=self.large_font)
        self.reputation_label.grid(row=0, column=5, sticky=tk.W, padx=5)
        
        # ===== 第二行：今日任务统计 =====
        ttk.Label(stats_grid, text="📅 今日任务:", font=self.default_font).grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        self.today_tasks_label = ttk.Label(stats_grid, text="0", font=self.bold_font)
        self.today_tasks_label.grid(row=1, column=1, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(stats_grid, text="成功:", font=self.default_font).grid(row=1, column=2, sticky=tk.W, padx=5, pady=5)
        self.today_successful_label = ttk.Label(stats_grid, text="0", foreground="green", font=self.bold_font)
        self.today_successful_label.grid(row=1, column=3, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(stats_grid, text="失败:", font=self.default_font).grid(row=1, column=4, sticky=tk.W, padx=5, pady=5)
        self.today_failed_label = ttk.Label(stats_grid, text="0", foreground="red", font=self.bold_font)
        self.today_failed_label.grid(row=1, column=5, sticky=tk.W, padx=5, pady=5)
        
        # ===== 第三行：总任务统计 =====
        ttk.Label(stats_grid, text="📊 总任务:", font=self.default_font).grid(row=2, column=0, sticky=tk.W, padx=5, pady=5)
        self.total_tasks_label = ttk.Label(stats_grid, text="0", font=self.bold_font)
        self.total_tasks_label.grid(row=2, column=1, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(stats_grid, text="成功:", font=self.default_font).grid(row=2, column=2, sticky=tk.W, padx=5, pady=5)
        self.successful_label = ttk.Label(stats_grid, text="0", foreground="green", font=self.bold_font)
        self.successful_label.grid(row=2, column=3, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(stats_grid, text="失败:", font=self.default_font).grid(row=2, column=4, sticky=tk.W, padx=5, pady=5)
        self.failed_label = ttk.Label(stats_grid, text="0", foreground="red", font=self.bold_font)
        self.failed_label.grid(row=2, column=5, sticky=tk.W, padx=5, pady=5)
        
        # ===== 第四行：运行信息 =====
        ttk.Label(stats_grid, text="⏱ 运行时间:", font=self.default_font).grid(row=3, column=0, sticky=tk.W, padx=5, pady=5)
        self.runtime_label = ttk.Label(stats_grid, text="--:--:--", font=self.default_font)
        self.runtime_label.grid(row=3, column=1, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(stats_grid, text="成功率:", font=self.default_font).grid(row=3, column=2, sticky=tk.W, padx=5, pady=5)
        self.success_rate_label = ttk.Label(stats_grid, text="0%", font=self.default_font)
        self.success_rate_label.grid(row=3, column=3, sticky=tk.W, padx=5, pady=5)
        
        # ===== 选项卡面板 =====
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # 任务历史选项卡
        history_frame = ttk.Frame(notebook)
        notebook.add(history_frame, text="📋 任务历史")
        
        # 任务历史表格
        history_scroll = ttk.Scrollbar(history_frame)
        history_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.history_tree = ttk.Treeview(
            history_frame,
            columns=("时间", "任务ID", "标题", "概率", "状态"),
            show="headings",
            yscrollcommand=history_scroll.set
        )
        history_scroll.config(command=self.history_tree.yview)
        
        # 设置列
        self.history_tree.heading("时间", text="时间")
        self.history_tree.heading("任务ID", text="任务 ID")
        self.history_tree.heading("标题", text="标题")
        self.history_tree.heading("概率", text="概率")
        self.history_tree.heading("状态", text="状态")
        
        self.history_tree.column("时间", width=150)
        self.history_tree.column("任务ID", width=250)
        self.history_tree.column("标题", width=200)
        self.history_tree.column("概率", width=80)
        self.history_tree.column("状态", width=80)
        
        self.history_tree.pack(fill=tk.BOTH, expand=True)
        
        # 日志选项卡
        log_frame = ttk.Frame(notebook)
        notebook.add(log_frame, text="📝 日志")
        
        # 日志文本框
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            width=80,
            height=20,
            font=self.mono_font
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # 配置日志文本框的标签
        self.log_text.tag_config("INFO", foreground="black")
        self.log_text.tag_config("WARNING", foreground="orange")
        self.log_text.tag_config("ERROR", foreground="red")
        self.log_text.tag_config("SUCCESS", foreground="green")
        
        # 日志控制按钮
        log_control_frame = ttk.Frame(log_frame)
        log_control_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(log_control_frame, text="清空日志", command=self.clear_logs).pack(side=tk.LEFT, padx=2)
        ttk.Button(log_control_frame, text="导出日志", command=self.export_logs).pack(side=tk.LEFT, padx=2)
        
        # 配置选项卡
        config_frame = ttk.Frame(notebook)
        notebook.add(config_frame, text="⚙ 配置")
        
        # 配置显示
        config_scroll = ttk.Scrollbar(config_frame)
        config_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.config_text = scrolledtext.ScrolledText(
            config_frame,
            wrap=tk.WORD,
            width=80,
            height=20,
            font=self.mono_font,
            yscrollcommand=config_scroll.set
        )
        config_scroll.config(command=self.config_text.yview)
        self.config_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # 配置按钮
        config_button_frame = ttk.Frame(config_frame)
        config_button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(config_button_frame, text="重新加载", command=self.load_config_display).pack(side=tk.LEFT, padx=2)
        ttk.Button(config_button_frame, text="保存配置", command=self.save_config).pack(side=tk.LEFT, padx=2)
        
        # 提交记录选项卡
        submissions_frame = ttk.Frame(notebook)
        notebook.add(submissions_frame, text="📤 提交记录")
        
        # 提交记录表格
        submissions_scroll = ttk.Scrollbar(submissions_frame)
        submissions_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.submissions_tree = ttk.Treeview(
            submissions_frame,
            columns=("ID", "时间", "任务", "状态", "脱敏", "概率"),
            show="headings",
            yscrollcommand=submissions_scroll.set
        )
        submissions_scroll.config(command=self.submissions_tree.yview)
        
        # 设置列
        self.submissions_tree.heading("ID", text="ID")
        self.submissions_tree.heading("时间", text="时间")
        self.submissions_tree.heading("任务", text="任务")
        self.submissions_tree.heading("状态", text="状态")
        self.submissions_tree.heading("脱敏", text="数据脱敏")
        self.submissions_tree.heading("概率", text="概率")
        
        self.submissions_tree.column("ID", width=50)
        self.submissions_tree.column("时间", width=150)
        self.submissions_tree.column("任务", width=250)
        self.submissions_tree.column("状态", width=80)
        self.submissions_tree.column("脱敏", width=80)
        self.submissions_tree.column("概率", width=80)
        
        self.submissions_tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # 双击查看详情
        self.submissions_tree.bind('<Double-Button-1>', self.show_submission_detail)
        
        # 提交记录控制按钮
        submissions_control_frame = ttk.Frame(submissions_frame)
        submissions_control_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(submissions_control_frame, text="刷新记录", command=self.refresh_submissions).pack(side=tk.LEFT, padx=2)
        ttk.Button(submissions_control_frame, text="查看详情", command=lambda: self.show_submission_detail(None)).pack(side=tk.LEFT, padx=2)
        ttk.Button(submissions_control_frame, text="导出记录", command=self.export_submissions).pack(side=tk.LEFT, padx=2)
        ttk.Button(submissions_control_frame, text="清空记录", command=self.clear_submissions).pack(side=tk.LEFT, padx=2)
        
        # 统计信息标签
        self.submissions_stats_label = ttk.Label(
            submissions_control_frame,
            text="总记录: 0 | 成功率: 0% | 脱敏率: 0%",
            font=self.default_font
        )
        self.submissions_stats_label.pack(side=tk.RIGHT, padx=5)
        
        # 仿真选项卡
        sim_frame = ttk.Frame(notebook)
        notebook.add(sim_frame, text="🔬 仿真")
        self._create_sim_tab(sim_frame)
        
        # ===== 底部状态栏 =====
        status_bar = ttk.Frame(self.root)
        status_bar.pack(fill=tk.X, side=tk.BOTTOM, padx=10, pady=(0, 5))  # 添加左右和底部边距
        
        self.status_bar_label = ttk.Label(status_bar, text="就绪", relief=tk.SUNKEN, anchor=tk.W, font=self.default_font)
        self.status_bar_label.pack(fill=tk.X, padx=2, pady=2)
    
    def start_plugin(self):
        """启动插件"""
        if self.is_running:
            messagebox.showwarning("警告", "插件已在运行中")
            return
        
        try:
            # 创建插件管理器
            self.plugin_manager = PluginManager()
            
            # 在新线程中初始化和启动
            def run_plugin():
                try:
                    self.plugin_manager.initialize()
                    
                    # 启动插件并传递任务完成回调
                    self.plugin_manager.start(on_task_complete=self.on_task_complete_callback)
                    
                    # 更新 UI
                    self.root.after(0, self.on_plugin_started)
                    
                except Exception as e:
                    self.root.after(0, lambda: self.on_plugin_error(str(e)))
            
            thread = threading.Thread(target=run_plugin, daemon=True)
            thread.start()
            
            self.add_log("正在启动插件...", "INFO")
            
        except Exception as e:
            messagebox.showerror("错误", f"启动插件失败: {e}")
            self.add_log(f"启动失败: {e}", "ERROR")
    
    def on_task_complete_callback(self, task_data: Dict[str, Any]):
        """任务完成回调 - 从后台线程调用"""
        # 使用 after 方法在主线程中更新 GUI
        self.root.after(0, lambda: self.add_task_to_history(task_data))
    
    def on_plugin_started(self):
        """插件启动成功回调"""
        self.is_running = True
        self.stats['start_time'] = datetime.now()
        
        # 更新 UI
        self.status_label.config(text="● 运行中", foreground="green")
        self.start_button.config(state=tk.DISABLED)
        self.stop_button.config(state=tk.NORMAL)
        self.status_bar_label.config(text="插件运行中...")
        
        self.add_log("✅ 插件启动成功", "SUCCESS")
        
        # 启动运行时间更新
        self.update_runtime()
        
        # 启动用户统计信息更新（收益和声望）
        self.update_user_stats()
    
    def on_plugin_error(self, error_msg):
        """插件错误回调"""
        messagebox.showerror("错误", f"插件启动失败:\n{error_msg}")
        self.add_log(f"❌ 启动失败: {error_msg}", "ERROR")
    
    def stop_plugin(self):
        """停止插件"""
        if not self.is_running:
            messagebox.showwarning("警告", "插件未运行")
            return
        
        try:
            if self.plugin_manager:
                self.plugin_manager.stop()
            
            self.is_running = False
            self.stats['start_time'] = None
            
            # 更新 UI
            self.status_label.config(text="● 已停止", foreground="red")
            self.start_button.config(state=tk.NORMAL)
            self.stop_button.config(state=tk.DISABLED)
            self.status_bar_label.config(text="插件已停止")
            
            self.add_log("⏹ 插件已停止", "INFO")
            
        except Exception as e:
            messagebox.showerror("错误", f"停止插件失败: {e}")
            self.add_log(f"停止失败: {e}", "ERROR")
    
    def open_config(self):
        """打开配置对话框"""
        # 简单实现：切换到配置选项卡
        # 可以扩展为独立的配置对话框
        pass
    
    def load_config_display(self):
        """加载并显示配置"""
        try:
            config_path = Path("config.json")
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                
                # 保存原始配置（用于保存时恢复）
                self.original_config = config.copy()
                
                # 创建显示用的配置副本
                display_config = config.copy()
                
                # 隐藏 API Key 的部分字符（仅用于显示）
                if 'api_key' in display_config and len(display_config['api_key']) > 8:
                    display_config['api_key'] = display_config['api_key'][:4] + "****" + display_config['api_key'][-4:]
                
                # 隐藏 Agent Token 的部分字符（仅用于显示）
                if 'agent_token' in display_config and display_config['agent_token'] and len(str(display_config['agent_token'])) > 8:
                    token = str(display_config['agent_token'])
                    display_config['agent_token'] = token[:4] + "****" + token[-4:]
                
                config_str = json.dumps(display_config, indent=2, ensure_ascii=False)
                self.config_text.delete(1.0, tk.END)
                self.config_text.insert(1.0, config_str)
                
                self.add_log("配置加载成功", "INFO")
            else:
                self.original_config = {}
                self.config_text.delete(1.0, tk.END)
                self.config_text.insert(1.0, "配置文件不存在\n\n首次运行时将自动创建")
                
        except Exception as e:
            messagebox.showerror("错误", f"加载配置失败: {e}")
            self.add_log(f"加载配置失败: {e}", "ERROR")
    
    def save_config(self):
        """保存配置"""
        try:
            # 获取配置文本框的内容
            config_str = self.config_text.get(1.0, tk.END).strip()
            
            if not config_str:
                messagebox.showerror("错误", "配置内容为空")
                return
            
            # 解析 JSON
            try:
                config = json.loads(config_str)
            except json.JSONDecodeError as e:
                messagebox.showerror("错误", f"配置格式无效:\n{e}")
                return
            
            # 恢复被隐藏的 API Key（如果用户没有修改）
            if 'api_key' in config and '****' in config['api_key']:
                if hasattr(self, 'original_config') and 'api_key' in self.original_config:
                    config['api_key'] = self.original_config['api_key']
                else:
                    messagebox.showerror("错误", "无法恢复 API Key，请重新输入完整的 API Key")
                    return
            
            # 恢复被隐藏的 Agent Token（如果用户没有修改）
            if 'agent_token' in config and config['agent_token'] and '****' in str(config['agent_token']):
                if hasattr(self, 'original_config') and 'agent_token' in self.original_config:
                    config['agent_token'] = self.original_config['agent_token']
            
            # 保存到文件
            config_path = Path("config.json")
            self.logger.info(f"[AgentOracle] 正在保存配置到: {config_path.absolute()}")
            
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            
            # 设置文件权限（Windows 上可能不起作用）
            try:
                import os
                os.chmod(config_path, 0o600)
                self.logger.info("[AgentOracle] 文件权限已设置为 0600")
            except Exception as e:
                self.logger.warning(f"[AgentOracle] 设置文件权限失败（Windows 上正常）: {e}")
            
            messagebox.showinfo("成功", "配置已保存！\n\n如果插件正在运行，需要重启插件才能应用新配置。")
            self.add_log("✅ 配置已保存", "SUCCESS")
            self.logger.info("[AgentOracle] 配置已成功保存")
            
            # 重新加载显示（恢复隐藏的 API Key）
            self.load_config_display()
            
        except Exception as e:
            messagebox.showerror("错误", f"保存配置失败:\n{e}")
            self.add_log(f"❌ 保存配置失败: {e}", "ERROR")
            self.logger.error(f"[AgentOracle] 保存配置失败: {e}", exc_info=True)
    
    def add_task_to_history(self, task_data: Dict[str, Any]):
        """添加任务到历史记录"""
        # 添加到历史列表
        self.task_history.insert(0, task_data)
        
        # 只保留最近 20 条
        if len(self.task_history) > 20:
            self.task_history.pop()
        
        # 更新表格
        self.history_tree.insert(
            "",
            0,
            values=(
                task_data.get('time', ''),
                task_data.get('task_id', task_data.get('id', ''))[:30] + "...",
                task_data.get('title', '')[:30],
                f"{task_data.get('probability', task_data.get('confidence', 0)):.2f}",
                task_data.get('status', '')
            )
        )
        
        # 更新总任务统计
        self.stats['total_tasks'] += 1
        if task_data.get('status') == '成功':
            self.stats['successful'] += 1
        else:
            self.stats['failed'] += 1
        
        # 更新今日任务统计
        self.stats['today_tasks'] += 1
        if task_data.get('status') == '成功':
            self.stats['today_successful'] += 1
        else:
            self.stats['today_failed'] += 1
        
        self.update_stats()
    
    def update_stats(self):
        """更新统计显示"""
        # 检查是否需要重置今日统计（跨天了）
        current_date = datetime.now().date()
        if current_date != self.stats['today_date']:
            # 重置今日统计
            self.stats['today_tasks'] = 0
            self.stats['today_successful'] = 0
            self.stats['today_failed'] = 0
            self.stats['today_date'] = current_date
            self.logger.info("[GUI] 日期变更，重置今日统计")
        
        # 更新今日任务统计
        self.today_tasks_label.config(text=str(self.stats['today_tasks']))
        self.today_successful_label.config(text=str(self.stats['today_successful']))
        self.today_failed_label.config(text=str(self.stats['today_failed']))
        
        # 更新总任务统计
        self.total_tasks_label.config(text=str(self.stats['total_tasks']))
        self.successful_label.config(text=str(self.stats['successful']))
        self.failed_label.config(text=str(self.stats['failed']))
        
        # 计算成功率（基于总任务）
        if self.stats['total_tasks'] > 0:
            success_rate = (self.stats['successful'] / self.stats['total_tasks']) * 100
            self.success_rate_label.config(text=f"{success_rate:.1f}%")
    
    def update_runtime(self):
        """更新运行时间"""
        if self.is_running and self.stats['start_time']:
            elapsed = datetime.now() - self.stats['start_time']
            hours, remainder = divmod(int(elapsed.total_seconds()), 3600)
            minutes, seconds = divmod(remainder, 60)
            self.runtime_label.config(text=f"{hours:02d}:{minutes:02d}:{seconds:02d}")
            
            # 每秒更新一次
            self.root.after(1000, self.update_runtime)
    
    def update_user_stats(self):
        """从后台获取并更新用户统计信息（收益和声望）"""
        if not self.plugin_manager or not self.plugin_manager.daemon or not self.plugin_manager.daemon.api_client:
            return
        
        try:
            # 从 API 获取用户统计信息
            stats_data = self.plugin_manager.daemon.api_client.get_user_stats()
            
            if stats_data:
                # 更新今日收益
                today_earnings = stats_data.get('today_earnings', 0)
                self.today_earnings_label.config(text=f"${today_earnings:.2f}")
                
                # 更新总收益
                total_earnings = stats_data.get('total_earnings', 0)
                self.total_earnings_label.config(text=f"${total_earnings:.2f}")
                
                # 更新声望
                reputation_score = stats_data.get('reputation_score', 0)
                reputation_level = stats_data.get('reputation_level', 'Novice')
                self.reputation_label.config(text=f"{reputation_score} ({reputation_level})")
                
                self.logger.info(f"[GUI] 用户统计更新: 今日${today_earnings:.2f}, 总计${total_earnings:.2f}, 声望{reputation_score}")
            else:
                self.logger.warning("[GUI] 无法获取用户统计信息")
                
        except Exception as e:
            self.logger.error(f"[GUI] 更新用户统计信息时出错: {e}")
        
        # 如果插件正在运行，每30秒更新一次
        if self.is_running:
            self.root.after(30000, self.update_user_stats)
    def initialize_api_client(self):
        """在GUI启动时初始化API客户端并获取用户统计信息"""
        try:
            config_path = Path("config.json")
            if not config_path.exists():
                self.logger.info("[GUI] 配置文件不存在，跳过初始统计信息获取")
                self.add_log("✅ GUI 启动完成", "SUCCESS")
                return
            
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            api_key = config.get('api_key')
            base_url = config.get('base_url', 'https://your-platform-domain.com')
            
            if not api_key:
                self.logger.info("[GUI] API Key 未配置，跳过初始统计信息获取")
                self.add_log("✅ GUI 启动完成", "SUCCESS")
                return
            
            # 创建临时 API 客户端用于获取统计信息
            try:
                from .api_client import AgentOracleClient
            except ImportError:
                from api_client import AgentOracleClient
            
            temp_client = AgentOracleClient(api_key, base_url=base_url)
            
            # 获取用户统计信息
            stats_data = temp_client.get_user_stats()
            
            if stats_data:
                # 更新今日收益
                today_earnings = stats_data.get('today_earnings', 0)
                self.today_earnings_label.config(text=f"${today_earnings:.2f}")
                
                # 更新总收益
                total_earnings = stats_data.get('total_earnings', 0)
                self.total_earnings_label.config(text=f"${total_earnings:.2f}")
                
                # 更新声望
                reputation_score = stats_data.get('reputation_score', 0)
                reputation_level = stats_data.get('reputation_level', 'Novice')
                self.reputation_label.config(text=f"{reputation_score} ({reputation_level})")
                
                self.logger.info(f"[GUI] 初始统计信息加载成功: 今日${today_earnings:.2f}, 总计${total_earnings:.2f}, 声望{reputation_score}")
                self.add_log("✅ GUI 启动完成，统计信息已加载", "SUCCESS")
            else:
                self.logger.warning("[GUI] 无法获取初始统计信息")
                self.add_log("✅ GUI 启动完成（统计信息获取失败）", "SUCCESS")
                
        except Exception as e:
            self.logger.debug(f"[GUI] 获取初始统计信息时出错: {e}")
            # 不显示错误给用户，因为这不是关键功能
            self.add_log("✅ GUI 启动完成", "SUCCESS")

    
    def add_log(self, message: str, level: str = "INFO"):
        """添加日志消息"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_message = f"[{timestamp}] {message}\n"
        
        self.log_text.insert(tk.END, log_message, level)
        self.log_text.see(tk.END)  # 自动滚动到底部
    
    def clear_logs(self):
        """清空日志"""
        self.log_text.delete(1.0, tk.END)
        self.add_log("日志已清空", "INFO")
    
    def export_logs(self):
        """导出日志到文件"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"agentoracle_logs_{timestamp}.txt"
            
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(self.log_text.get(1.0, tk.END))
            
            messagebox.showinfo("成功", f"日志已导出到: {filename}")
            self.add_log(f"日志已导出: {filename}", "SUCCESS")
            
        except Exception as e:
            messagebox.showerror("错误", f"导出日志失败: {e}")
    
    def update_logs(self):
        """从队列更新日志（定期调用）"""
        try:
            while True:
                message, level = self.log_queue.get_nowait()
                self.add_log(message, level)
        except queue.Empty:
            pass
        
        # 每 100ms 检查一次
        self.root.after(100, self.update_logs)
    
    def refresh_submissions(self):
        """刷新提交记录"""
        try:
            # 清空表格
            for item in self.submissions_tree.get_children():
                self.submissions_tree.delete(item)
            
            # 获取所有记录
            submissions = self.submission_logger.get_all_submissions()
            
            # 反转顺序，最新的在前
            submissions.reverse()
            
            # 添加到表格
            for sub in submissions:
                timestamp = sub.get('timestamp', '')
                if timestamp:
                    # 格式化时间戳
                    try:
                        dt = datetime.fromisoformat(timestamp)
                        timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except:
                        pass
                
                # UAP v3.0：从 signals 数组首条取 evidence_type 作为列表展示
                _sanitized = sub.get('sanitized_submission', {}) or {}
                _signals = _sanitized.get('signals', []) or []
                _evidence_type_display = _signals[0].get('evidence_type', 'N/A') if _signals else _sanitized.get('evidence_type', 'N/A')
                _sig_count = sub.get('signal_count', len(_signals))
                _sub_status = sub.get('submission_status', _sanitized.get('status', 'submitted'))
                _status_icon = '✅ 成功' if sub.get('success') else '❌ 失败'
                if _sub_status == 'abstained':
                    _status_icon = '⚪ 弃权'
                
                self.submissions_tree.insert(
                    "",
                    tk.END,
                    values=(
                        sub.get('id', ''),
                        timestamp,
                        sub.get('task_title', '')[:40],
                        _status_icon,
                        '✅ 是' if sub.get('data_sanitized') else '⚠️ 否',
                        f"{_evidence_type_display} (×{_sig_count})"
                    ),
                    tags=(str(sub.get('id', '')),)
                )
            
            # 更新统计信息
            stats = self.submission_logger.get_statistics()
            self.submissions_stats_label.config(
                text=f"总记录: {stats.get('total_submissions', 0)} | "
                     f"成功率: {stats.get('success_rate', 0):.1f}% | "
                     f"脱敏率: {stats.get('sanitization_rate', 0):.1f}%"
            )
            
            self.add_log(f"已加载 {len(submissions)} 条提交记录", "INFO")
            
        except Exception as e:
            messagebox.showerror("错误", f"刷新提交记录失败: {e}")
            self.add_log(f"刷新提交记录失败: {e}", "ERROR")
    
    def show_submission_detail(self, event):
        """显示提交记录详情"""
        try:
            # 获取选中的记录
            selection = self.submissions_tree.selection()
            if not selection:
                messagebox.showwarning("提示", "请先选择一条记录")
                return
            
            # 获取记录 ID
            item = self.submissions_tree.item(selection[0])
            record_id = int(item['values'][0])
            
            # 获取完整记录
            submission = self.submission_logger.get_submission_by_id(record_id)
            if not submission:
                messagebox.showerror("错误", "记录不存在")
                return
            
            # 创建详情窗口
            detail_window = tk.Toplevel(self.root)
            detail_window.title(f"提交记录详情 - #{record_id}")
            detail_window.geometry("800x600")
            
            # 创建选项卡
            detail_notebook = ttk.Notebook(detail_window)
            detail_notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
            
            # 基本信息选项卡
            info_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(info_frame, text="基本信息")
            
            info_text = scrolledtext.ScrolledText(info_frame, wrap=tk.WORD, font=self.mono_font)
            info_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            
            original_sub = submission.get('original_submission', {}) or {}
            sanitized_sub = submission.get('sanitized_submission', {}) or {}
            proto_ver = submission.get('protocol_version', sanitized_sub.get('protocol_version', '3.0'))
            sub_status = submission.get('submission_status', sanitized_sub.get('status', 'submitted'))
            sig_count = submission.get('signal_count', len(sanitized_sub.get('signals', []) or []))
            
            info_content = f"""记录 ID: {submission.get('id')}
时间: {submission.get('timestamp')}
任务 ID: {submission.get('task_id')}
任务标题: {submission.get('task_title')}
提交状态: {'✅ 成功' if submission.get('success') else '❌ 失败'}
协议版本: UAP v{proto_ver}
Submission Status: {sub_status}
信号数量: {sig_count}
数据脱敏: {'✅ 是' if submission.get('data_sanitized') else '⚠️ 否'}

问题:
{submission.get('question', 'N/A')}

推理延迟: {submission.get('telemetry', {}).get('inference_latency_ms', 0):.0f}ms
"""
            info_text.insert(1.0, info_content)
            info_text.config(state=tk.DISABLED)
            
            # ====== UAP v3.0 payload 格式化展示辅助 ======
            import json as _json
            def _format_uap_payload(payload: dict, title: str) -> str:
                if not payload:
                    return f"=== {title} ===\n(空)\n"
                lines = [f"=== {title} (UAP v{payload.get('protocol_version', '3.0')}) ==="]
                lines.append(f"task_id:          {payload.get('task_id', 'N/A')}")
                lines.append(f"status:           {payload.get('status', 'N/A')}")
                lines.append(f"privacy_cleared:  {payload.get('privacy_cleared', False)}")
                lines.append(f"signal_count:     {len(payload.get('signals', []) or [])}")
                if payload.get('user_persona'):
                    lines.append(f"user_persona:     {_json.dumps(payload['user_persona'], ensure_ascii=False)}")
                if payload.get('status') == 'abstained':
                    lines.append(f"abstain_reason:   {payload.get('abstain_reason', 'N/A')}")
                    lines.append(f"abstain_detail:   {payload.get('abstain_detail', 'N/A')}")
                lines.append("")
                lines.append("--- Signals ---")
                for idx, sig in enumerate(payload.get('signals', []) or []):
                    lines.append(f"\n[Signal {idx}] signal_id={sig.get('signal_id', 'N/A')}")
                    lines.append(f"  evidence_type:       {sig.get('evidence_type', 'N/A')}")
                    lines.append(f"  source_type:         {sig.get('source_type', 'N/A')}")
                    lines.append(f"  data_exclusivity:    {sig.get('data_exclusivity', 'N/A')}")
                    lines.append(f"  source_description:  {sig.get('source_description', 'N/A')}")
                    lines.append(f"  observed_at:         {sig.get('observed_at', 'N/A')}")
                    lines.append(f"  relevance_score:     {sig.get('relevance_score', 'N/A')}")
                    lines.append(f"  source_urls:         {sig.get('source_urls', [])}")
                    lines.append(f"  entity_tags:         {_json.dumps(sig.get('entity_tags', []), ensure_ascii=False)}")
                    lines.append(f"  evidence_text:")
                    for l in str(sig.get('evidence_text', '')).split('\n'):
                        lines.append(f"    {l}")
                    lines.append(f"  relevance_reasoning:")
                    for l in str(sig.get('relevance_reasoning', '')).split('\n'):
                        lines.append(f"    {l}")
                lines.append("")
                lines.append("--- Raw JSON ---")
                lines.append(_json.dumps(payload, ensure_ascii=False, indent=2))
                return "\n".join(lines)
            
            # 原始提交选项卡 —— 未脱敏的 UAP v3.0 payload
            original_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(original_frame, text="原始提交 (UAP v3.0)")
            
            original_text = scrolledtext.ScrolledText(original_frame, wrap=tk.WORD, font=self.mono_font)
            original_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            original_text.insert(1.0, _format_uap_payload(original_sub, "原始提交（脱敏前）"))
            original_text.config(state=tk.DISABLED)
            
            # 脱敏提交选项卡 —— 实际发送给平台的 UAP v3.0 payload
            sanitized_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(sanitized_frame, text="实际提交 (UAP v3.0)")
            
            sanitized_text = scrolledtext.ScrolledText(sanitized_frame, wrap=tk.WORD, font=self.mono_font)
            sanitized_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            sanitized_text.insert(1.0, _format_uap_payload(sanitized_sub, "实际提交（脱敏后）"))
            sanitized_text.config(state=tk.DISABLED)
            
            # 对比选项卡 —— 每条信号的 evidence_text / relevance_reasoning 对比
            compare_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(compare_frame, text="对比")
            
            compare_text = scrolledtext.ScrolledText(compare_frame, wrap=tk.WORD, font=self.mono_font)
            compare_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            
            orig_signals = original_sub.get('signals', []) or []
            san_signals = sanitized_sub.get('signals', []) or []
            compare_lines = [f"{'✅ 数据已脱敏' if submission.get('data_sanitized') else '⚠️ 数据未脱敏'}"]
            compare_lines.append(f"原始信号数: {len(orig_signals)} | 脱敏信号数: {len(san_signals)}")
            compare_lines.append("")
            for i in range(max(len(orig_signals), len(san_signals))):
                o = orig_signals[i] if i < len(orig_signals) else {}
                s = san_signals[i] if i < len(san_signals) else {}
                compare_lines.append(f"========== Signal [{i}] ==========")
                compare_lines.append(f"\n--- evidence_text ---")
                compare_lines.append(f"[原始] {o.get('evidence_text', '(无)')}")
                compare_lines.append(f"[脱敏] {s.get('evidence_text', '(无)')}")
                compare_lines.append(f"\n--- relevance_reasoning ---")
                compare_lines.append(f"[原始] {o.get('relevance_reasoning', '(无)')}")
                compare_lines.append(f"[脱敏] {s.get('relevance_reasoning', '(无)')}")
                compare_lines.append(f"\n--- source_description ---")
                compare_lines.append(f"[原始] {o.get('source_description', '(无)')}")
                compare_lines.append(f"[脱敏] {s.get('source_description', '(无)')}")
                compare_lines.append("")
            compare_text.insert(1.0, "\n".join(compare_lines))
            compare_text.config(state=tk.DISABLED)
            
        except Exception as e:
            messagebox.showerror("错误", f"显示详情失败: {e}")
            self.add_log(f"显示详情失败: {e}", "ERROR")
    
    def export_submissions(self):
        """导出提交记录"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"submissions_export_{timestamp}.json"
            
            if self.submission_logger.export_to_file(filename):
                messagebox.showinfo("成功", f"记录已导出到: {filename}")
                self.add_log(f"记录已导出: {filename}", "SUCCESS")
            else:
                messagebox.showerror("错误", "导出记录失败")
                
        except Exception as e:
            messagebox.showerror("错误", f"导出记录失败: {e}")
    
    def clear_submissions(self):
        """清空提交记录"""
        try:
            if messagebox.askyesno("确认", "确定要清空所有提交记录吗？此操作不可恢复。"):
                if self.submission_logger.clear_all_submissions():
                    self.refresh_submissions()
                    messagebox.showinfo("成功", "所有记录已清空")
                    self.add_log("所有提交记录已清空", "INFO")
                else:
                    messagebox.showerror("错误", "清空记录失败")
                    
        except Exception as e:
            messagebox.showerror("错误", f"清空记录失败: {e}")
    
    # ════════════════════════════════════════════════════════════════════
    # 仿真 Tab
    # ════════════════════════════════════════════════════════════════════

    def _get_config_val(self, key: str, default: str = '') -> str:
        """从已加载配置中读取值"""
        try:
            return str(self.original_config.get(key, default))
        except Exception:
            return default

    def _create_sim_tab(self, parent):
        """构建仿真 Tab 内容"""
        # ── 参数设置 ────────────────────────────────────────────────────
        params_frame = ttk.LabelFrame(parent, text="仿真参数", padding=8)
        params_frame.pack(fill=tk.X, padx=8, pady=8)

        # 平台地址
        row = ttk.Frame(params_frame)
        row.pack(fill=tk.X, pady=2)
        ttk.Label(row, text="平台地址:", width=12, font=self.default_font).pack(side=tk.LEFT)
        self._sim_url_var = tk.StringVar(value=self._get_config_val('base_url', 'http://localhost:3000'))
        ttk.Entry(row, textvariable=self._sim_url_var, font=self.mono_font).pack(side=tk.LEFT, fill=tk.X, expand=True)

        # API Keys
        keys_lf = ttk.LabelFrame(params_frame,
            text="API Keys（每行一个；填单个 Key 时由「Agent 数量」决定并发数）", padding=4)
        keys_lf.pack(fill=tk.X, pady=4)
        self._sim_keys_text = scrolledtext.ScrolledText(
            keys_lf, height=4, font=self.mono_font, wrap=tk.NONE)
        self._sim_keys_text.pack(fill=tk.X)
        # 预填当前配置的 api_key
        prefill_key = self._get_config_val('api_key')
        if prefill_key:
            self._sim_keys_text.insert('1.0', prefill_key)

        # 任务 ID
        row = ttk.Frame(params_frame)
        row.pack(fill=tk.X, pady=2)
        ttk.Label(row, text="任务 ID:", width=12, font=self.default_font).pack(side=tk.LEFT)
        self._sim_task_id_var = tk.StringVar()
        ttk.Entry(row, textvariable=self._sim_task_id_var,
                  font=self.mono_font, foreground='#555').pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Label(row, text="（空=自动获取）", font=self.default_font).pack(side=tk.LEFT, padx=4)

        # Agent 数量 + 延迟
        row = ttk.Frame(params_frame)
        row.pack(fill=tk.X, pady=2)
        ttk.Label(row, text="Signal 数量:", width=12, font=self.default_font).pack(side=tk.LEFT)
        self._sim_count_var = tk.IntVar(value=5)
        ttk.Spinbox(row, from_=1, to=200, textvariable=self._sim_count_var,
                    width=6, font=self.default_font).pack(side=tk.LEFT)
        ttk.Label(row, text="  启动延迟:", font=self.default_font).pack(side=tk.LEFT, padx=(20, 0))
        self._sim_delay_var = tk.DoubleVar(value=0.0)
        ttk.Spinbox(row, from_=0.0, to=10.0, increment=0.5,
                    textvariable=self._sim_delay_var, width=6,
                    format="%.1f", font=self.default_font).pack(side=tk.LEFT)
        ttk.Label(row, text="秒（随机上限）", font=self.default_font).pack(side=tk.LEFT, padx=4)

        # 清除历史数据
        row = ttk.Frame(params_frame)
        row.pack(fill=tk.X, pady=2)
        self._sim_clear_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(row,
            text="提交前清除该任务历史数据（调用 /api/test/prepare，需指定任务 ID）",
            variable=self._sim_clear_var).pack(side=tk.LEFT)

        # ── 控制按钮 ──────────────────────────────────────────────────
        ctrl_frame = ttk.Frame(parent)
        ctrl_frame.pack(fill=tk.X, padx=8, pady=4)
        self._sim_start_btn = ttk.Button(
            ctrl_frame, text="▶  启动仿真", command=self._start_simulation)
        self._sim_start_btn.pack(side=tk.LEFT, padx=4)
        self._sim_stop_btn = ttk.Button(
            ctrl_frame, text="⏹  停止", command=self._stop_simulation,
            state=tk.DISABLED)
        self._sim_stop_btn.pack(side=tk.LEFT, padx=4)
        ttk.Button(
            ctrl_frame, text="清空日志",
            command=lambda: (self._sim_log.config(state=tk.NORMAL),
                             self._sim_log.delete('1.0', tk.END),
                             self._sim_log.config(state=tk.DISABLED))
        ).pack(side=tk.LEFT, padx=4)

        # 保存 / 加载仿真配置
        ttk.Separator(ctrl_frame, orient=tk.VERTICAL).pack(
            side=tk.LEFT, fill=tk.Y, padx=8, pady=2)
        ttk.Button(
            ctrl_frame, text="💾 保存配置", command=self._save_sim_config
        ).pack(side=tk.LEFT, padx=4)
        ttk.Button(
            ctrl_frame, text="📂 加载配置", command=self._load_sim_config
        ).pack(side=tk.LEFT, padx=4)

        # 启动时自动加载上次保存的仿真配置
        self._load_sim_config(silent=True)

        # ── 进度条 + 统计 ──────────────────────────────────────────────
        prog_frame = ttk.Frame(parent)
        prog_frame.pack(fill=tk.X, padx=8, pady=(0, 2))
        self._sim_progress = ttk.Progressbar(prog_frame, mode='determinate')
        self._sim_progress.pack(fill=tk.X, pady=2)
        self._sim_stats_label = ttk.Label(
            prog_frame, text="就绪", font=self.default_font)
        self._sim_stats_label.pack(anchor=tk.W)

        # ── 日志 ──────────────────────────────────────────────────────
        log_lf = ttk.LabelFrame(parent, text="仿真日志", padding=4)
        log_lf.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0, 8))
        self._sim_log = scrolledtext.ScrolledText(
            log_lf, font=self.mono_font, height=12, state=tk.DISABLED)
        self._sim_log.pack(fill=tk.BOTH, expand=True)
        self._sim_log.tag_config("success", foreground="#1a7a1a")
        self._sim_log.tag_config("error",   foreground="#cc0000")
        self._sim_log.tag_config("warning", foreground="#cc6600")
        self._sim_log.tag_config("info",    foreground="#333333")

    # ══════════════════════════════════════════════════════════════
    # 仿真配置持久化
    # ══════════════════════════════════════════════════════════════
    _SIM_CONFIG_FILE = 'sim_config.json'

    def _get_sim_config_path(self) -> Path:
        """仿真配置文件路径（与 config.json 同目录）"""
        return Path(os.path.dirname(os.path.abspath(__file__))).parent / self._SIM_CONFIG_FILE

    def _save_sim_config(self):
        """将当前仿真参数保存到 sim_config.json"""
        keys_raw = self._sim_keys_text.get('1.0', tk.END).strip()
        cfg = {
            'base_url':   self._sim_url_var.get().strip(),
            'api_keys':   keys_raw,
            'task_id':    self._sim_task_id_var.get().strip(),
            'agent_count': self._sim_count_var.get(),
            'delay':      self._sim_delay_var.get(),
            'clear_first': self._sim_clear_var.get(),
        }
        path = self._get_sim_config_path()
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
            self._add_sim_log(f"💾 仿真配置已保存 → {path.name}", "success")
        except Exception as e:
            self._add_sim_log(f"❌ 保存配置失败: {e}", "error")
            messagebox.showerror("保存失败", str(e))

    def _load_sim_config(self, silent: bool = False):
        """从 sim_config.json 加载仿真参数
        
        Args:
            silent: True 时静默加载（启动时自动调用），文件不存在不提示
        """
        path = self._get_sim_config_path()
        if not path.exists():
            if not silent:
                messagebox.showinfo("提示", f"配置文件不存在: {path.name}")
            return
        try:
            with open(path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            # 恢复各字段
            if 'base_url' in cfg:
                self._sim_url_var.set(cfg['base_url'])
            if 'api_keys' in cfg:
                self._sim_keys_text.delete('1.0', tk.END)
                self._sim_keys_text.insert('1.0', cfg['api_keys'])
            if 'task_id' in cfg:
                self._sim_task_id_var.set(cfg['task_id'])
            if 'agent_count' in cfg:
                self._sim_count_var.set(int(cfg['agent_count']))
            if 'delay' in cfg:
                self._sim_delay_var.set(float(cfg['delay']))
            if 'clear_first' in cfg:
                self._sim_clear_var.set(bool(cfg['clear_first']))
            if not silent:
                self._add_sim_log(f"📂 仿真配置已加载 ← {path.name}", "success")
        except Exception as e:
            if not silent:
                self._add_sim_log(f"❌ 加载配置失败: {e}", "error")
                messagebox.showerror("加载失败", str(e))

    def _add_sim_log(self, msg: str, level: str = 'info'):
        """线程安全地向仿真日志追加一行"""
        def _update():
            self._sim_log.config(state=tk.NORMAL)
            ts = datetime.now().strftime('%H:%M:%S')
            self._sim_log.insert(tk.END, f"[{ts}] {msg}\n", level)
            self._sim_log.see(tk.END)
            self._sim_log.config(state=tk.DISABLED)
        self.root.after(0, _update)

    def _start_simulation(self):
        """读取参数并启动仿真后台线程"""
        if self._sim_running:
            return

        url       = self._sim_url_var.get().strip()
        keys_raw  = self._sim_keys_text.get('1.0', tk.END).strip()
        task_id   = self._sim_task_id_var.get().strip()
        count     = self._sim_count_var.get()
        delay     = self._sim_delay_var.get()
        clear_first = self._sim_clear_var.get()

        if not url:
            messagebox.showerror("参数错误", "请填写平台地址")
            return

        # 解析 API Keys（换行或逗号分隔）
        api_keys = [k.strip()
                    for k in keys_raw.replace(',', '\n').splitlines()
                    if k.strip()]
        if not api_keys:
            messagebox.showerror("参数错误", "请至少填写一个 API Key")
            return

        # 单 Key 模式：重复 count 次
        if len(api_keys) == 1:
            api_keys = api_keys * count

        self._sim_running = True
        self._sim_abort.clear()
        self._sim_start_btn.config(state=tk.DISABLED)
        self._sim_stop_btn.config(state=tk.NORMAL)
        self._sim_progress.config(maximum=len(api_keys), value=0)
        self._sim_stats_label.config(text=f"准备中... Agent 总数: {len(api_keys)}")

        threading.Thread(
            target=self._sim_worker,
            args=(url, api_keys, task_id or None, delay, clear_first),
            daemon=True
        ).start()

    def _stop_simulation(self):
        """请求停止仿真"""
        self._sim_abort.set()
        self._add_sim_log("⏹ 用户请求停止，等待当前请求完成...", "warning")

    def _sim_build_signal(self, task: dict, agent_index: int) -> dict:
        """构建单条模拟信号 payload（UAP v3.0）
        数据池参考 /api/test/prepare 的 AGENT_TEMPLATES，覆盖金融/科技/政府/学术/能源/军事/医疗/地产等领域。
        """
        # ── 40 种专业画像（对标 prepare/route.ts 的 AGENT_TEMPLATES）──
        _PERSONAS = [
            # 金融类（12）
            {"gender": "male",   "age_range": "35-45", "occupation": "宏观分析师",     "region": "north_america", "interests": ["宏观经济", "债券"],       "expertise": "macro_economics",   "stance": "hawkish",  "info_sources": ["彭博", "路透社"]},
            {"gender": "female", "age_range": "32-42", "occupation": "外汇交易员",     "region": "europe",        "interests": ["外汇", "衍生品"],       "expertise": "quantitative",      "stance": "neutral",  "info_sources": ["彭博外汇", "BIS报告"]},
            {"gender": "male",   "age_range": "30-40", "occupation": "固收策略师",     "region": "north_america", "interests": ["固收", "利率"],         "expertise": "fixed_income",      "stance": "dovish",   "info_sources": ["CME", "美联储公告"]},
            {"gender": "male",   "age_range": "50-60", "occupation": "价值投资人",     "region": "north_america", "interests": ["价值投资", "分红"],     "expertise": "value_investing",   "stance": "dovish",   "info_sources": ["伯克希尔", "巴菲特"]},
            {"gender": "male",   "age_range": "29-39", "occupation": "成长股分析师",   "region": "north_america", "interests": ["成长股", "科技股"],     "expertise": "quantitative",      "stance": "bullish",  "info_sources": ["高盛研报", "摩根士丹利"]},
            {"gender": "female", "age_range": "26-36", "occupation": "量化研究员",     "region": "north_america", "interests": ["量化策略", "因子投资"], "expertise": "quantitative",      "stance": "neutral",  "info_sources": ["Journal of Finance", "SSRN"]},
            {"gender": "male",   "age_range": "38-48", "occupation": "信用分析师",     "region": "north_america", "interests": ["信用市场", "高收益债"], "expertise": "fixed_income",      "stance": "hawkish",  "info_sources": ["穆迪", "标普"]},
            {"gender": "female", "age_range": "34-44", "occupation": "亚洲债券分析师", "region": "east_asia",     "interests": ["亚洲债市", "信用评级"], "expertise": "fixed_income",      "stance": "hawkish",  "info_sources": ["惠誉亚太", "联合资信"]},
            {"gender": "male",   "age_range": "32-42", "occupation": "新兴市场分析师", "region": "south_asia",    "interests": ["印度股市", "新兴市场"], "expertise": "emerging_markets",  "stance": "bullish",  "info_sources": ["经济时报", "BSE数据"]},
            {"gender": "male",   "age_range": "40-50", "occupation": "大宗商品交易员", "region": "latin_america", "interests": ["巴西市场", "大宗商品"], "expertise": "emerging_markets",  "stance": "hawkish",  "info_sources": ["Valor Econômico", "Bovespa"]},
            {"gender": "female", "age_range": "35-45", "occupation": "澳洲宏观分析师", "region": "oceania",       "interests": ["澳元", "大宗商品出口"], "expertise": "macro_economics",   "stance": "neutral",  "info_sources": ["RBA", "ASX数据"]},
            {"gender": "male",   "age_range": "47-57", "occupation": "日本利率策略师", "region": "east_asia",     "interests": ["负利率", "日本化"],     "expertise": "monetary_policy",   "stance": "dovish",   "info_sources": ["日银季报", "大和研究"]},
            # 科技类（5）
            {"gender": "female", "age_range": "28-35", "occupation": "AI研究员",       "region": "east_asia",     "interests": ["AI", "科技股"],         "expertise": "technology",        "stance": "dovish",   "info_sources": ["财新", "科技媒体"]},
            {"gender": "male",   "age_range": "25-35", "occupation": "区块链开发者",   "region": "east_asia",     "interests": ["区块链", "Web3"],       "expertise": "technology",        "stance": "neutral",  "info_sources": ["CoinDesk", "链上数据"]},
            {"gender": "male",   "age_range": "30-40", "occupation": "半导体分析师",   "region": "east_asia",     "interests": ["半导体", "科技供应链"], "expertise": "technology",        "stance": "hawkish",  "info_sources": ["IC Insights", "SEMI"]},
            {"gender": "female", "age_range": "24-34", "occupation": "云计算分析师",   "region": "north_america", "interests": ["云计算", "SaaS"],       "expertise": "technology",        "stance": "bullish",  "info_sources": ["TechCrunch", "a16z"]},
            {"gender": "male",   "age_range": "28-38", "occupation": "NLP工程师",      "region": "north_america", "interests": ["机器学习", "NLP"],     "expertise": "ai_finance",        "stance": "neutral",  "info_sources": ["OpenAI博客", "Google Research"]},
            # 政府/地缘类（5）
            {"gender": "male",   "age_range": "45-55", "occupation": "地缘政治顾问",   "region": "europe",        "interests": ["地缘政治", "能源"],     "expertise": "geopolitics",       "stance": "hawkish",  "info_sources": ["FT", "Economist"]},
            {"gender": "female", "age_range": "40-50", "occupation": "贸易政策研究员", "region": "north_america", "interests": ["国际贸易", "制裁政策"], "expertise": "geopolitics",       "stance": "hawkish",  "info_sources": ["USTR", "WTO"]},
            {"gender": "male",   "age_range": "50-60", "occupation": "央行政策分析师", "region": "east_asia",     "interests": ["央行政策", "汇率管理"], "expertise": "monetary_policy",   "stance": "neutral",  "info_sources": ["央行公告", "BIS"]},
            {"gender": "male",   "age_range": "42-52", "occupation": "产业政策研究员", "region": "east_asia",     "interests": ["半导体政策", "产业补贴"], "expertise": "geopolitics",     "stance": "hawkish",  "info_sources": ["METI", "工信部"]},
            {"gender": "female", "age_range": "48-58", "occupation": "财政政策分析师", "region": "europe",        "interests": ["财政政策", "债务"],     "expertise": "fiscal_policy",     "stance": "dovish",   "info_sources": ["欧央行", "财政部"]},
            # 学术类（4）
            {"gender": "female", "age_range": "38-48", "occupation": "行为经济学教授", "region": "north_america", "interests": ["行为经济学", "市场"],   "expertise": "behavioral",        "stance": "neutral",  "info_sources": ["学术期刊", "NBER"]},
            {"gender": "male",   "age_range": "42-52", "occupation": "国际金融教授",   "region": "europe",        "interests": ["国际金融", "资本流动"], "expertise": "macro_economics",   "stance": "neutral",  "info_sources": ["NBER", "CEPR"]},
            {"gender": "female", "age_range": "30-40", "occupation": "气候经济学家",   "region": "europe",        "interests": ["气候经济学", "转型风险"], "expertise": "esg",             "stance": "dovish",   "info_sources": ["Nature Climate", "IPCC"]},
            {"gender": "male",   "age_range": "55-65", "occupation": "货币理论学者",   "region": "north_america", "interests": ["货币理论", "经济史"],   "expertise": "monetary_policy",   "stance": "neutral",  "info_sources": ["学术期刊", "Fed论文"]},
            # 能源/大宗商品类（4）
            {"gender": "male",   "age_range": "40-50", "occupation": "原油分析师",     "region": "middle_east",   "interests": ["原油", "OPEC"],         "expertise": "commodities",       "stance": "hawkish",  "info_sources": ["OPEC报告", "EIA数据"]},
            {"gender": "female", "age_range": "32-42", "occupation": "可再生能源顾问", "region": "europe",        "interests": ["可再生能源", "碳交易"], "expertise": "esg",               "stance": "dovish",   "info_sources": ["Bloomberg绿能", "IRENA"]},
            {"gender": "male",   "age_range": "45-55", "occupation": "矿业投资人",     "region": "latin_america", "interests": ["金属", "矿业"],         "expertise": "commodities",       "stance": "hawkish",  "info_sources": ["金属通报", "LME"]},
            {"gender": "male",   "age_range": "38-48", "occupation": "主权财富分析师", "region": "middle_east",   "interests": ["主权财富", "石油美元"], "expertise": "commodities",       "stance": "hawkish",  "info_sources": ["Zawya", "Gulf News"]},
            # 军事/安全类（2）
            {"gender": "male",   "age_range": "50-60", "occupation": "防务战略顾问",   "region": "east_asia",     "interests": ["台海局势", "印太战略"], "expertise": "geopolitics",       "stance": "hawkish",  "info_sources": ["RAND", "CSIS"]},
            {"gender": "female", "age_range": "40-50", "occupation": "网络安全分析师", "region": "europe",        "interests": ["网络安全", "关键基础设施"], "expertise": "geopolitics",  "stance": "hawkish",  "info_sources": ["NATO报告", "Cyber Ventures"]},
            # 记者/咨询/医疗/地产（5）
            {"gender": "female", "age_range": "30-40", "occupation": "财经记者",       "region": "east_asia",     "interests": ["宏观叙事", "政策解读"], "expertise": "macro_economics",   "stance": "neutral",  "info_sources": ["财联社", "证券时报"]},
            {"gender": "female", "age_range": "42-52", "occupation": "ESG咨询师",      "region": "europe",        "interests": ["ESG评级", "可持续报告"], "expertise": "esg",             "stance": "dovish",   "info_sources": ["MSCI ESG", "SASB"]},
            {"gender": "female", "age_range": "38-48", "occupation": "生物科技分析师", "region": "north_america", "interests": ["医药股", "生物科技"],   "expertise": "technology",        "stance": "bullish",  "info_sources": ["NEJM", "BioPharma"]},
            {"gender": "male",   "age_range": "42-52", "occupation": "商业地产分析师", "region": "north_america", "interests": ["商业地产", "REITs"],   "expertise": "real_estate",       "stance": "dovish",   "info_sources": ["CoStar", "房地产周刊"]},
            {"gender": "male",   "age_range": "32-42", "occupation": "创业投资人",     "region": "east_asia",     "interests": ["创投", "量化"],         "expertise": "quantitative",      "stance": "neutral",  "info_sources": ["社交媒体", "量化信号"]},
        ]

        # ── 20 种证据模板（含专业视角前缀）──
        _TEMPLATES = [
            "从宏观经济数据来看，{angle}。近期关键指标（PMI、CPI、就业）均指向这一方向。",
            "基于央行政策分析，{angle}。利率路径和前瞻指引暗示这一趋势将持续。",
            "从信用市场信号观察，{angle}。信用利差和违约率变化支持此判断。",
            "结合地缘政治风险评估，{angle}。区域紧张局势与供应链扰动是核心驱动因素。",
            "根据量化因子模型回测，{angle}。动量、价值、波动率因子均发出一致信号。",
            "从技术产业链调研得知，{angle}。上下游库存和订单数据验证了这一趋势。",
            "基于大宗商品供需分析，{angle}。库存周期和产能利用率是关键变量。",
            "从行为金融学角度分析，{angle}。投资者情绪指标和资金流向数据佐证此观点。",
            "结合ESG和气候政策评估，{angle}。碳定价机制和转型投资正在重塑资产定价。",
            "根据卫星和替代数据分析，{angle}。物流流量、工业排放等实时指标提供了独立验证。",
            "从货币政策传导机制来看，{angle}。利率-汇率-资产价格链条正在发挥作用。",
            "基于历史周期类比研究，{angle}。当前阶段与此前特定经济周期高度相似。",
            "从跨资产相关性矩阵观察，{angle}。股债汇商相关性结构正在经历显著变化。",
            "结合全球资本流动追踪，{angle}。新兴市场和发达市场的资金再配置趋势明显。",
            "根据企业财报季数据汇总，{angle}。盈利修正比率和指引变化揭示了微观基本面走向。",
            "从监管政策变化推演，{angle}。新规实施路径和合规成本将影响市场结构。",
            "基于债务周期和杠杆率分析，{angle}。信贷脉冲和偿债压力是前瞻性指标。",
            "从劳动力市场微观结构分析，{angle}。工资增速和职位空缺率是通胀的领先指标。",
            "结合期权市场隐含波动率和偏度，{angle}。尾部风险定价反映了市场的真实预期。",
            "根据供应链压力指数和航运数据，{angle}。全球贸易物流的实时信号验证了此判断。",
        ]

        # ── 15 种分析角度 ──
        _ANGLES = [
            "当前形势更倾向于肯定方向演进，概率约65%-75%",
            "不确定性因素较多，结果难以定论，需要更多数据确认",
            "短期内可能出现反转，但中期趋势未改",
            "长期趋势明显向好，短期波动不改变大方向",
            "外部环境的变化将是关键影响因子，需密切关注",
            "技术和政策双重驱动下，正向结果概率显著提升",
            "多方力量正在博弈，均衡点尚未确立",
            "风险溢价正在重新定价，资产配置需调整",
            "周期性因素和结构性因素叠加，使判断更加复杂",
            "关键变量的边际变化正在加速，拐点可能临近",
            "历史相似场景下该方向的胜率约为70%以上",
            "尽管存在逆风因素，基线情景仍偏正面",
            "尾部风险不容忽视，需要对冲方案",
            "供需两端的非对称信息使预测难度上升",
            "制度性变革正在进行，传统分析框架需要修正",
        ]

        # ── 因果实体标签池 ──
        _ENTITY_POOLS = {
            "macro_economics":   [("美联储利率决议", "cause"), ("CPI通胀率", "indicator"), ("GDP增速", "indicator"), ("失业率", "indicator"), ("PMI制造业", "indicator")],
            "fixed_income":      [("国债收益率曲线", "cause"), ("信用利差", "indicator"), ("久期风险", "cause"), ("违约率", "indicator"), ("回购市场流动性", "indicator")],
            "technology":        [("AI算力扩张", "cause"), ("半导体周期", "indicator"), ("云支出增速", "indicator"), ("科技股估值", "indicator"), ("技术扩散速度", "cause")],
            "geopolitics":       [("地缘紧张升级", "cause"), ("制裁政策", "cause"), ("供应链重构", "indicator"), ("能源安全", "cause"), ("军备竞赛", "indicator")],
            "commodities":       [("OPEC产量政策", "cause"), ("原油库存", "indicator"), ("金属需求周期", "indicator"), ("农产品气候影响", "cause"), ("能源转型", "cause")],
            "esg":               [("碳排放政策", "cause"), ("ESG资金流入", "indicator"), ("气候立法", "cause"), ("绿色溢价", "indicator"), ("转型风险", "indicator")],
            "monetary_policy":   [("央行资产负债表", "cause"), ("量化宽松/紧缩", "cause"), ("通胀预期", "indicator"), ("实际利率", "indicator"), ("前瞻指引", "cause")],
            "quantitative":      [("动量因子", "indicator"), ("波动率聚集", "indicator"), ("流动性冲击", "cause"), ("相关性突变", "indicator"), ("风险平价再平衡", "cause")],
            "behavioral":        [("投资者情绪指标", "indicator"), ("恐慌指数VIX", "indicator"), ("羊群效应", "cause"), ("锚定偏差", "cause"), ("过度自信", "indicator")],
            "emerging_markets":  [("新兴市场资本流出", "cause"), ("美元强势", "cause"), ("人口红利", "indicator"), ("汇率波动", "indicator"), ("政治风险溢价", "cause")],
            "value_investing":   [("PE估值分位", "indicator"), ("自由现金流", "indicator"), ("股息率", "indicator"), ("ROE趋势", "indicator"), ("护城河评估", "cause")],
            "real_estate":       [("房价指数", "indicator"), ("利率敏感性", "cause"), ("空置率", "indicator"), ("REITs折价", "indicator"), ("信贷条件", "cause")],
            "fiscal_policy":     [("财政赤字率", "indicator"), ("政府债务/GDP", "indicator"), ("财政刺激规模", "cause"), ("税收政策变化", "cause"), ("公共投资", "cause")],
            "ai_finance":        [("LLM技术突破", "cause"), ("AI应用渗透率", "indicator"), ("算力成本下降", "cause"), ("监管AI立法", "cause"), ("AI投资热潮", "indicator")],
        }

        persona = _PERSONAS[agent_index % len(_PERSONAS)]
        expertise = persona.get("expertise", "macro_economics")
        stance = persona.get("stance", "neutral")
        info_sources = persona.get("info_sources", [])

        base_evidence = random.choice(_TEMPLATES).format(angle=random.choice(_ANGLES))
        # 附加唯一后缀，避免后端 public 去重把相同模板文本折叠
        unique_suffix = f"（{persona['occupation']}·{random.choice(info_sources) if info_sources else '综合'}" \
                        f"·{agent_index}-{random.randint(10000,99999)}）"
        evidence = base_evidence + unique_suffix

        task_id = task.get("task_id") or task.get("id")
        sig_id  = f"sim_{str(task_id)[:8]}_{int(time.time()*1000) % 1000000}_{agent_index}_{random.randint(0,9999)}"

        # 生成 1~3 个因果实体标签
        entity_pool = _ENTITY_POOLS.get(expertise, _ENTITY_POOLS["macro_economics"])
        n_tags = random.randint(1, min(3, len(entity_pool)))
        chosen_tags = random.sample(entity_pool, n_tags)
        entity_tags = [{"text": t[0], "role": t[1]} for t in chosen_tags]

        # 基于 stance 微调 relevance_score 范围
        if stance in ("hawkish", "bullish"):
            rel_score = round(random.uniform(0.65, 0.95), 2)
        elif stance in ("dovish",):
            rel_score = round(random.uniform(0.55, 0.88), 2)
        else:
            rel_score = round(random.uniform(0.45, 0.85), 2)

        # evidence_type 按 expertise 加权
        if expertise in ("quantitative", "fixed_income", "commodities", "macro_economics"):
            ev_type = random.choices(["hard_fact", "persona_inference"], weights=[0.7, 0.3])[0]
        else:
            ev_type = random.choices(["hard_fact", "persona_inference"], weights=[0.3, 0.7])[0]

        # source_type 按 data_exclusivity 对应
        excl = random.choices(
            ["public", "semi_private", "private"],
            weights=[0.5, 0.3, 0.2],
        )[0]
        source_map = {
            "public":       ["llm_analysis", "web_search", "news_aggregator"],
            "semi_private":  ["local_memory", "user_profile", "behavior_pattern"],
            "private":       ["local_chat", "local_document", "local_transaction"],
        }
        src_type = random.choice(source_map[excl])

        reasoning = (
            f"基于{persona['occupation']}的{expertise}专业视角，"
            f"结合{'、'.join(info_sources)}数据源，"
            f"从{'、'.join(persona['interests'])}领域经验出发进行分析。"
            f"立场倾向: {stance}。"
        )

        return {
            "task_id": task_id,
            "status": "submitted",
            "privacy_cleared": True,
            "protocol_version": "3.0",
            "plugin_version": "gui-sim/1.0",
            "model_name": "simulation",
            "user_persona": {
                "gender":     persona["gender"],
                "age_range":  persona["age_range"],
                "occupation": persona["occupation"],
                "region":     persona["region"],
                "interests":  persona["interests"],
            },
            "signals": [{
                "signal_id":          sig_id,
                "evidence_type":      ev_type,
                "evidence_text":      evidence,
                "relevance_score":    rel_score,
                "relevance_reasoning": reasoning,
                "source_type":        src_type,
                "entity_tags":        entity_tags,
                "source_urls":        [],
                "data_exclusivity":   excl,
            }],
        }

    def _sim_worker(self, url: str, api_keys: list, task_id_override,
                    delay: float, clear_first: bool):
        """仿真后台线程：清除数据 → 为每个 Agent 生成独立 UUID → 并发提交信号
        
        关键设计：不使用 AgentOracleClient（同一 API Key 会映射到同一 user_id，
        导致所有提交归属 1 个 Agent）。改用 /api/test/sim-submit 端点，
        直接指定 user_id，实现多 Agent 独立身份。
        """
        try:
            self._sim_worker_inner(url, api_keys, task_id_override, delay, clear_first)
        except Exception as e:
            import traceback
            self._add_sim_log(f"❌ 仿真线程异常崩溃: {e}", "error")
            self._add_sim_log(traceback.format_exc()[:500], "error")
            self.root.after(0, self._sim_on_done_reset)

    def _sim_worker_inner(self, url: str, api_keys: list, task_id_override,
                          delay: float, clear_first: bool):
        """仿真核心逻辑（由 _sim_worker 包裹异常处理）"""
        import requests as _http

        agent_count = len(api_keys)
        self._add_sim_log(f"🚀 并发仿真启动  Agent 数: {agent_count}", "info")
        self._add_sim_log(f"   平台地址 : {url}")
        self._add_sim_log(f"   目标任务 : {task_id_override or '(需指定任务 ID)'}")
        self._add_sim_log(f"   提交端点 : /api/test/sim-submit")
        if delay > 0:
            self._add_sim_log(f"   启动延迟 : 0 ~ {delay:.1f}s")

        if not task_id_override:
            self._add_sim_log("❌ 仿真模式必须指定任务 ID", "error")
            self.root.after(0, self._sim_on_done_reset)
            return

        # ── 调用 /api/test/prepare：获取 Agent 账号（+ 可选清除历史数据）──
        if clear_first:
            self._add_sim_log("📡 调用 /api/test/prepare（创建 Agent 账号 + 清除历史数据）...")
            prepare_body = {"task_id": task_id_override}
        else:
            self._add_sim_log("📡 调用 /api/test/prepare（仅获取 Agent 账号，保留历史数据）...")
            prepare_body = {}
        try:
            resp = _http.post(
                f"{url}/api/test/prepare",
                json=prepare_body,
                timeout=60,
            )
            if resp.status_code != 200:
                self._add_sim_log(f"  ❌ prepare 失败 HTTP {resp.status_code}: {resp.text[:200]}", "error")
                self.root.after(0, self._sim_on_done_reset)
                return
            prepare_data = resp.json()
            platform_agents = prepare_data.get("agents", [])
            if clear_first:
                self._add_sim_log(
                    f"  🗑 已清除 {prepare_data.get('deletedSignals','?')} 条信号  "
                    f"{prepare_data.get('deletedAnalyses','?')} 条分析", "success")
            self._add_sim_log(
                f"  ✅ 平台返回 {len(platform_agents)} 个 Agent 账号"
                f" ({'复用已有' if prepare_data.get('reused') else '新创建'})", "success")
        except Exception as e:
            self._add_sim_log(f"  ❌ prepare 异常: {e}", "error")
            self.root.after(0, self._sim_on_done_reset)
            return

        if not platform_agents:
            self._add_sim_log("❌ 平台未返回任何 Agent 账号，无法继续", "error")
            self.root.after(0, self._sim_on_done_reset)
            return

        # ── 从平台 Agent 中选取 agent_count 个 ─────────────────────────
        selected = []
        for i in range(agent_count):
            pa = platform_agents[i % len(platform_agents)]
            selected.append({
                "index": i,
                "user_id": pa["id"],
                "username": pa.get("username", f"Agent-{i}"),
            })
        self._add_sim_log(
            f"🆔 已选取 {agent_count} 个 Agent: "
            f"{', '.join(a['username'] for a in selected[:5])}"
            f"{'...' if agent_count > 5 else ''}")

        # ── 并发提交 ──────────────────────────────────────────────────
        t_start = time.time()
        done = success_count = fail_count = 0
        task_obj = {"task_id": task_id_override, "question": "[specified task]"}

        def _run_agent(agent_info):
            idx = agent_info["index"]
            agent_id = agent_info["user_id"]
            agent_name = agent_info.get("username", "")
            if self._sim_abort.is_set():
                return {"agent_index": idx, "status": "aborted",
                        "elapsed_ms": 0, "task_id": None}
            if delay > 0:
                time.sleep(random.uniform(0, delay))
            if self._sim_abort.is_set():
                return {"agent_index": idx, "status": "aborted",
                        "elapsed_ms": 0, "task_id": None}
            t0 = time.time()
            try:
                payload = self._sim_build_signal(task_obj, idx)
                # 使用 /api/test/sim-submit 端点，指定独立 user_id
                # 错开 submitted_at 避免 UNIQUE(task_id, user_id, submitted_at) 冲突
                from datetime import datetime as _dt, timedelta as _td
                staggered_at = (_dt.utcnow() + _td(seconds=idx)).isoformat() + "Z"
                submit_data = {
                    "task_id":          task_id_override,
                    "user_id":          agent_id,
                    "signals":          payload.get("signals", []),
                    "user_persona":     payload.get("user_persona"),
                    "status":           "submitted",
                    "submitted_at":     staggered_at,
                    "plugin_version":   payload.get("plugin_version", "gui-sim/1.0"),
                    "protocol_version": payload.get("protocol_version", "3.0"),
                    "model_name":       payload.get("model_name", "simulation"),
                }
                resp = _http.post(
                    f"{url}/api/test/sim-submit",
                    json=submit_data,
                    timeout=30,
                )
                ok = resp.status_code == 200
                elapsed = int((time.time() - t0) * 1000)
                if not ok:
                    err_text = resp.text[:80] if resp.text else f"HTTP {resp.status_code}"
                    return {"agent_index": idx, "status": "failed",
                            "elapsed_ms": elapsed, "task_id": task_id_override,
                            "error": err_text}
                return {"agent_index": idx, "status": "success",
                        "elapsed_ms": elapsed, "task_id": task_id_override,
                        "username": agent_name}
            except Exception as e:
                return {"agent_index": idx, "status": "error",
                        "elapsed_ms": int((time.time()-t0)*1000),
                        "task_id": None, "error": str(e)[:80]}

        max_workers = min(agent_count, 20)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_run_agent, a): a["index"]
                for a in selected
            }
            for future in as_completed(futures):
                r = future.result()
                done += 1
                if r["status"] == "success":
                    success_count += 1
                    icon, lvl = "✅", "success"
                elif r["status"] in ("error", "failed", "auth_error"):
                    fail_count += 1
                    icon, lvl = "❌", "error"
                elif r["status"] == "aborted":
                    icon, lvl = "⏹", "warning"
                else:
                    icon, lvl = "⚠️", "warning"

                line = (f"  {icon} Agent#{r['agent_index']:02d}"
                        f"  {r.get('username', '')}"
                        f"  {r['elapsed_ms']}ms  [{r['status']}]")
                if r.get("error"):
                    line += f"  {r['error']}"
                self._add_sim_log(line, lvl)

                _d, _s, _f = done, success_count, fail_count
                _total = agent_count
                def _upd(d=_d, s=_s, f=_f, tot=_total):
                    self._sim_progress['value'] = d
                    self._sim_stats_label.config(
                        text=f"进度: {d}/{tot}  ✅ 成功: {s}  ❌ 失败: {f}")
                self.root.after(0, _upd)

        total_ms = (time.time() - t_start) * 1000
        self._add_sim_log(
            f"\n📊 汇总  成功: {success_count}  失败: {fail_count}"
            f"  总耗时: {total_ms:.0f}ms", "info")
        if success_count > 0:
            avg = total_ms / success_count
            self._add_sim_log(f"   平均响应: {avg:.0f}ms / 请求", "info")

        _s, _f, _ms = success_count, fail_count, total_ms
        def _done_upd(s=_s, f=_f, ms=_ms):
            self._sim_stats_label.config(
                text=f"✅ 仿真完成  成功: {s}  失败: {f}  耗时: {ms:.0f}ms")
            self._sim_on_done_reset()
        self.root.after(0, _done_upd)

    def _sim_on_done_reset(self):
        """仿真结束后重置按钮状态"""
        self._sim_running = False
        self._sim_start_btn.config(state=tk.NORMAL)
        self._sim_stop_btn.config(state=tk.DISABLED)

    def on_closing(self):
        """窗口关闭事件"""
        if self.is_running:
            if messagebox.askokcancel("确认", "插件正在运行，确定要退出吗？"):
                self.stop_plugin()
                self.root.destroy()
        else:
            self.root.destroy()


def main():
    """主函数"""
    root = tk.Tk()
    app = AgentOracleGUI(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()
