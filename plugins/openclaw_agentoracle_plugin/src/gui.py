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
                
                self.submissions_tree.insert(
                    "",
                    tk.END,
                    values=(
                        sub.get('id', ''),
                        timestamp,
                        sub.get('task_title', '')[:40],
                        '✅ 成功' if sub.get('success') else '❌ 失败',
                        '✅ 是' if sub.get('data_sanitized') else '⚠️ 否',
                        f"{sub.get('sanitized_prediction', {}).get('probability', sub.get('sanitized_prediction', {}).get('confidence', 0)):.2f}"
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
            
            info_content = f"""记录 ID: {submission.get('id')}
时间: {submission.get('timestamp')}
任务 ID: {submission.get('task_id')}
任务标题: {submission.get('task_title')}
提交状态: {'✅ 成功' if submission.get('success') else '❌ 失败'}
数据脱敏: {'✅ 是' if submission.get('data_sanitized') else '⚠️ 否'}

问题:
{submission.get('question', 'N/A')}

推理延迟: {submission.get('telemetry', {}).get('inference_latency_ms', 0):.0f}ms
"""
            info_text.insert(1.0, info_content)
            info_text.config(state=tk.DISABLED)
            
            # 原始预测选项卡
            original_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(original_frame, text="原始预测")
            
            original_text = scrolledtext.ScrolledText(original_frame, wrap=tk.WORD, font=self.mono_font)
            original_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            
            original_pred = submission.get('original_prediction', {})
            original_content = f"""概率: {original_pred.get('probability', original_pred.get('confidence', 0)):.2f}

理由:
{original_pred.get('rationale', original_pred.get('prediction', 'N/A'))}

证据类型: {original_pred.get('evidence_type', 'N/A')}

完整推理:
{original_pred.get('reasoning', original_pred.get('prediction', 'N/A'))}
"""
            original_text.insert(1.0, original_content)
            original_text.config(state=tk.DISABLED)
            
            # 脱敏预测选项卡
            sanitized_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(sanitized_frame, text="脱敏预测")
            
            sanitized_text = scrolledtext.ScrolledText(sanitized_frame, wrap=tk.WORD, font=self.mono_font)
            sanitized_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            
            sanitized_pred = submission.get('sanitized_prediction', {})
            sanitized_content = f"""概率: {sanitized_pred.get('probability', sanitized_pred.get('confidence', 0)):.2f}

理由:
{sanitized_pred.get('rationale', sanitized_pred.get('prediction', 'N/A'))}

证据类型: {sanitized_pred.get('evidence_type', 'N/A')}

完整推理:
{sanitized_pred.get('reasoning', sanitized_pred.get('prediction', 'N/A'))}
"""
            sanitized_text.insert(1.0, sanitized_content)
            sanitized_text.config(state=tk.DISABLED)
            
            # 对比选项卡
            compare_frame = ttk.Frame(detail_notebook)
            detail_notebook.add(compare_frame, text="对比")
            
            compare_text = scrolledtext.ScrolledText(compare_frame, wrap=tk.WORD, font=self.mono_font)
            compare_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            
            compare_content = f"""=== 概率对比 ===
原始: {original_pred.get('probability', original_pred.get('confidence', 0)):.2f}
脱敏: {sanitized_pred.get('probability', sanitized_pred.get('confidence', 0)):.2f}

=== 理由对比 ===

原始理由:
{original_pred.get('rationale', original_pred.get('prediction', 'N/A'))}

脱敏理由:
{sanitized_pred.get('rationale', sanitized_pred.get('prediction', 'N/A'))}

{'✅ 数据已脱敏' if submission.get('data_sanitized') else '⚠️ 数据未脱敏'}

=== 完整推理对比 ===

原始推理:
{original_pred.get('reasoning', original_pred.get('prediction', 'N/A'))}

脱敏推理:
{sanitized_pred.get('reasoning', sanitized_pred.get('prediction', 'N/A'))}
"""
            compare_text.insert(1.0, compare_content)
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
