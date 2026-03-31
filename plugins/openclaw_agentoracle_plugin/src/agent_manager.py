"""
Agent Manager Module - 防弹级 Agent 进程管理

提供对本地 Agent (OpenClaw/Ollama/LM Studio) 的完整生命周期管理：
- 心跳探活 (Health Check)
- 双重唤醒机制 (Dual-Trigger)
- 自我修复 (Self-Healing)
- 进程监控和自动重启
"""

import time
import threading
import subprocess
import requests
import psutil
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class AgentManager:
    """防弹级 Agent 进程管理器
    
    功能:
    1. 心跳探活 - 每 10 秒检查 Agent 存活状态
    2. 双重唤醒 - HTTP API + subprocess 冷启动
    3. 自我修复 - 检测僵死进程并自动重启
    4. 进程监控 - 跟踪 Agent 进程状态
    """
    
    def __init__(self, 
                 agent_api_url: str = "http://127.0.0.1:11434",
                 agent_type: Optional[str] = None,
                 agent_executable: Optional[str] = None,
                 health_check_interval: int = 10,
                 zombie_timeout: int = 300):
        """初始化 Agent 管理器
        
        Args:
            agent_api_url: Agent HTTP API 地址
            agent_type: Optional agent type ("ollama", "openclaw", "lmstudio", "custom").
                If None, some features like process management will be limited.
            agent_executable: Optional path to agent executable for cold start.
                Required if you want auto-restart features.
            health_check_interval: 心跳检查间隔（秒），默认 10
            zombie_timeout: 僵死超时时间（秒），默认 300（5分钟）
        """
        self.agent_api_url = agent_api_url.rstrip('/')
        self.agent_type = agent_type.lower() if agent_type else None
        self.agent_executable = agent_executable
        self.health_check_interval = health_check_interval
        self.zombie_timeout = zombie_timeout
        
        self.logger = setup_logger()
        
        # 状态跟踪
        self.is_alive = False
        self.last_response_time: Optional[datetime] = None
        self.consecutive_failures = 0
        self.agent_process: Optional[subprocess.Popen] = None
        self.agent_pid: Optional[int] = None
        
        # 心跳线程
        self.health_check_thread: Optional[threading.Thread] = None
        self.health_check_running = False
        self.health_check_stop_event = threading.Event()
        
        # 统计信息
        self.total_health_checks = 0
        self.total_failures = 0
        self.total_restarts = 0
        self.start_time = datetime.now()
    
    def start_health_check(self):
        """启动心跳探活线程"""
        if self.health_check_running:
            self.logger.warning("[AgentManager] 心跳检查已在运行")
            return
        
        self.health_check_running = True
        self.health_check_stop_event.clear()
        
        self.health_check_thread = threading.Thread(
            target=self._health_check_loop,
            daemon=True
        )
        self.health_check_thread.start()
        
        self.logger.info(f"[AgentManager] 心跳检查已启动（间隔: {self.health_check_interval}秒）")
    
    def stop_health_check(self):
        """停止心跳探活线程"""
        if not self.health_check_running:
            return
        
        self.health_check_running = False
        self.health_check_stop_event.set()
        
        if self.health_check_thread and self.health_check_thread.is_alive():
            self.health_check_thread.join(timeout=5)
        
        self.logger.info("[AgentManager] 心跳检查已停止")
    
    def _health_check_loop(self):
        """心跳检查循环（后台线程）"""
        while self.health_check_running:
            try:
                # 执行健康检查
                is_healthy = self.check_status()
                
                # 检查是否僵死
                if not is_healthy:
                    self._handle_unhealthy_agent()
                
            except Exception as e:
                self.logger.error(f"[AgentManager] 心跳检查异常: {e}", exc_info=True)
            
            # 等待下次检查
            self.health_check_stop_event.wait(self.health_check_interval)
    
    def check_status(self) -> bool:
        """检查 Agent 存活状态
        
        Returns:
            True if Agent is alive and responding, False otherwise
        """
        self.total_health_checks += 1
        
        try:
            # 尝试多个健康检查端点
            endpoints = self._get_health_check_endpoints()
            
            for endpoint in endpoints:
                try:
                    response = requests.get(
                        endpoint,
                        timeout=5
                    )
                    
                    if response.status_code == 200:
                        # Agent 存活
                        self.is_alive = True
                        self.last_response_time = datetime.now()
                        self.consecutive_failures = 0
                        
                        self.logger.debug(f"[AgentManager] ✅ Agent 存活 (端点: {endpoint})")
                        return True
                        
                except requests.RequestException:
                    continue
            
            # 所有端点都失败
            self.is_alive = False
            self.consecutive_failures += 1
            self.total_failures += 1
            
            self.logger.warning(
                f"[AgentManager] ⚠️ Agent 无响应 "
                f"(连续失败: {self.consecutive_failures})"
            )
            return False
            
        except Exception as e:
            self.logger.error(f"[AgentManager] 健康检查异常: {e}", exc_info=True)
            self.is_alive = False
            self.consecutive_failures += 1
            self.total_failures += 1
            return False
    
    def _get_health_check_endpoints(self) -> list:
        """获取健康检查端点列表"""
        if not self.agent_type:
            # 如果未指定 agent_type，尝试所有常见端点
            return [
                f"{self.agent_api_url}/api/tags",
                f"{self.agent_api_url}/api/version",
                f"{self.agent_api_url}/v1/models",
                f"{self.agent_api_url}/health",
            ]
        elif self.agent_type == "ollama":
            return [
                f"{self.agent_api_url}/api/tags",
                f"{self.agent_api_url}/api/version",
            ]
        elif self.agent_type == "openclaw":
            return [
                f"{self.agent_api_url}/health",
                f"{self.agent_api_url}/v1/models",
            ]
        elif self.agent_type == "lmstudio":
            return [
                f"{self.agent_api_url}/v1/models",
            ]
        else:  # custom
            return [
                f"{self.agent_api_url}/health",
                f"{self.agent_api_url}/api/tags",
                f"{self.agent_api_url}/v1/models",
            ]
    
    def _handle_unhealthy_agent(self):
        """处理不健康的 Agent"""
        # 检查是否僵死
        if self._is_zombie():
            self.logger.error(
                f"[AgentManager] 🚨 检测到 Agent 僵死 "
                f"(超过 {self.zombie_timeout} 秒无响应)"
            )
            
            # 尝试自我修复
            self.reset_agent()
    
    def _is_zombie(self) -> bool:
        """检查 Agent 是否僵死
        
        Returns:
            True if Agent is zombie (no response for zombie_timeout seconds)
        """
        if self.last_response_time is None:
            # 从未响应过，不算僵死
            return False
        
        time_since_last_response = datetime.now() - self.last_response_time
        return time_since_last_response.total_seconds() > self.zombie_timeout
    
    def start_agent(self, force: bool = False) -> bool:
        """启动 Agent（双重唤醒机制）
        
        Args:
            force: 是否强制重启（即使 Agent 已在运行）
            
        Returns:
            True if Agent started successfully, False otherwise
        """
        try:
            # 1. 检查 Agent 是否已在运行
            if not force and self.check_status():
                self.logger.info("[AgentManager] Agent 已在运行，无需启动")
                return True
            
            self.logger.info("[AgentManager] 🚀 启动 Agent...")
            
            # 2. 尝试通过 HTTP API 唤醒（软启动）
            if self._try_wake_via_api():
                self.logger.info("[AgentManager] ✅ Agent 通过 API 唤醒成功")
                return True
            
            # 3. 尝试通过 subprocess 冷启动（硬启动）
            if self._try_cold_start():
                self.logger.info("[AgentManager] ✅ Agent 冷启动成功")
                return True
            
            self.logger.error("[AgentManager] ❌ Agent 启动失败")
            return False
            
        except Exception as e:
            self.logger.error(f"[AgentManager] Agent 启动异常: {e}", exc_info=True)
            return False
    
    def _try_wake_via_api(self) -> bool:
        """尝试通过 HTTP API 唤醒 Agent
        
        Returns:
            True if wake successful, False otherwise
        """
        try:
            self.logger.info("[AgentManager] 尝试通过 API 唤醒 Agent...")
            
            # 等待几秒让 Agent 响应
            for i in range(3):
                time.sleep(2)
                if self.check_status():
                    return True
            
            return False
            
        except Exception as e:
            self.logger.debug(f"[AgentManager] API 唤醒失败: {e}")
            return False
    
    def _try_cold_start(self) -> bool:
        """尝试通过 subprocess 冷启动 Agent
        
        Returns:
            True if cold start successful, False otherwise
        """
        try:
            if not self.agent_executable:
                self.logger.warning(
                    "[AgentManager] 未配置 agent_executable，无法冷启动"
                )
                return False
            
            self.logger.info(
                f"[AgentManager] 尝试冷启动 Agent: {self.agent_executable}"
            )
            
            # 构建启动命令
            command = self._build_start_command()
            
            # 启动进程
            self.agent_process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True  # 独立进程组
            )
            
            self.agent_pid = self.agent_process.pid
            self.logger.info(f"[AgentManager] Agent 进程已启动 (PID: {self.agent_pid})")
            
            # 等待 Agent 启动
            for i in range(10):
                time.sleep(2)
                if self.check_status():
                    self.logger.info("[AgentManager] Agent 启动成功")
                    return True
            
            self.logger.error("[AgentManager] Agent 启动超时")
            return False
            
        except Exception as e:
            self.logger.error(f"[AgentManager] 冷启动失败: {e}", exc_info=True)
            return False
    
    def _build_start_command(self) -> list:
        """构建 Agent 启动命令
        
        Returns:
            Command list for subprocess.Popen
        """
        if not self.agent_type:
            # 如果未指定 agent_type，直接使用可执行文件
            return [self.agent_executable]
        elif self.agent_type == "ollama":
            return [self.agent_executable, "serve"]
        elif self.agent_type == "openclaw":
            # OpenClaw Gateway 启动命令
            return [self.agent_executable, "gateway"]
        else:
            return [self.agent_executable]
    
    def stop_agent(self) -> bool:
        """停止 Agent 进程
        
        Returns:
            True if Agent stopped successfully, False otherwise
        """
        try:
            self.logger.info("[AgentManager] 停止 Agent...")
            
            if self.agent_process:
                # 尝试优雅关闭
                self.agent_process.terminate()
                
                try:
                    self.agent_process.wait(timeout=10)
                    self.logger.info("[AgentManager] Agent 已优雅关闭")
                except subprocess.TimeoutExpired:
                    # 强制杀死
                    self.agent_process.kill()
                    self.logger.warning("[AgentManager] Agent 被强制杀死")
                
                self.agent_process = None
                self.agent_pid = None
            
            return True
            
        except Exception as e:
            self.logger.error(f"[AgentManager] 停止 Agent 失败: {e}", exc_info=True)
            return False
    
    def reset_agent(self) -> bool:
        """重置 Agent（自我修复）
        
        安全地杀死僵死进程并重新初始化
        
        Returns:
            True if reset successful, False otherwise
        """
        try:
            self.logger.info("[AgentManager] 🔄 重置 Agent...")
            self.total_restarts += 1
            
            # 1. 查找并杀死僵死进程
            self._kill_zombie_processes()
            
            # 2. 等待进程完全退出
            time.sleep(2)
            
            # 3. 重新启动 Agent
            success = self.start_agent(force=True)
            
            if success:
                self.logger.info("[AgentManager] ✅ Agent 重置成功")
            else:
                self.logger.error("[AgentManager] ❌ Agent 重置失败")
            
            return success
            
        except Exception as e:
            self.logger.error(f"[AgentManager] Agent 重置异常: {e}", exc_info=True)
            return False
    
    def _kill_zombie_processes(self):
        """查找并杀死僵死的 Agent 进程"""
        try:
            # 根据 Agent 类型查找进程
            process_names = self._get_process_names()
            
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    proc_info = proc.info
                    proc_name = proc_info['name'].lower()
                    
                    # 检查进程名称
                    if any(name in proc_name for name in process_names):
                        self.logger.warning(
                            f"[AgentManager] 杀死僵死进程: "
                            f"{proc_name} (PID: {proc_info['pid']})"
                        )
                        proc.kill()
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
        except Exception as e:
            self.logger.error(f"[AgentManager] 杀死僵死进程失败: {e}", exc_info=True)
    
    def _get_process_names(self) -> list:
        """获取 Agent 进程名称列表"""
        if not self.agent_type:
            # 如果未指定 agent_type，返回空列表（无法自动查找进程）
            return []
        elif self.agent_type == "ollama":
            return ["ollama"]
        elif self.agent_type == "openclaw":
            return ["openclaw"]
        elif self.agent_type == "lmstudio":
            return ["lmstudio", "lm-studio"]
        else:
            return []
    
    def get_status_info(self) -> Dict[str, Any]:
        """获取 Agent 状态信息
        
        Returns:
            Dictionary containing status information
        """
        uptime = datetime.now() - self.start_time
        
        return {
            "is_alive": self.is_alive,
            "agent_type": self.agent_type,
            "agent_api_url": self.agent_api_url,
            "last_response_time": self.last_response_time.isoformat() if self.last_response_time else None,
            "consecutive_failures": self.consecutive_failures,
            "agent_pid": self.agent_pid,
            "total_health_checks": self.total_health_checks,
            "total_failures": self.total_failures,
            "total_restarts": self.total_restarts,
            "uptime_seconds": uptime.total_seconds(),
            "health_check_interval": self.health_check_interval,
            "zombie_timeout": self.zombie_timeout,
        }
    
    def __del__(self):
        """析构函数 - 清理资源"""
        try:
            self.stop_health_check()
        except:
            pass
