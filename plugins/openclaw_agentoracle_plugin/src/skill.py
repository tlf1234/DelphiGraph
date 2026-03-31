"""
Main entry point for OpenClaw AgentOracle Plugin

This module contains the PluginManager class that handles plugin lifecycle
and the BackgroundDaemon class that manages the polling loop.
"""

import json
import os
import threading
import time
import random
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# Support both module and direct execution
try:
    # Try relative imports first (when run as module)
    from .logger import setup_logger
    from .api_client import AgentOracleClient
    from .telemetry import TelemetryCollector
    from .sanitizer import Sanitizer
    from .memory_monitor import MemoryMonitor
    from .validators import StringLengthValidator
    from .websocket_client import OpenClawWebSocketClient
    from .agent_manager import AgentManager
    from .submission_logger import SubmissionLogger
    from .env_detector import EnvironmentDetector
except ImportError:
    # Fall back to absolute imports (when run directly)
    from logger import setup_logger
    from api_client import AgentOracleClient
    from telemetry import TelemetryCollector
    from sanitizer import Sanitizer
    from memory_monitor import MemoryMonitor
    from validators import StringLengthValidator
    from websocket_client import OpenClawWebSocketClient
    from agent_manager import AgentManager
    from submission_logger import SubmissionLogger
    from env_detector import EnvironmentDetector


class PluginManager:
    """Manages plugin lifecycle and configuration.
    
    The PluginManager is responsible for initializing the plugin, loading and
    validating configuration, managing the API key, and controlling the background
    daemon lifecycle. It handles configuration file I/O with proper error recovery
    and security (file permissions set to 0600).
    
    Configuration flow:
        1. Try to load existing config.json
        2. If missing or corrupted, prompt user for API key
        3. Validate API key format (minimum 32 characters)
        4. Save configuration with secure permissions (0600)
        5. Start background daemon with validated configuration
    
    Attributes:
        config_path: Path to configuration file (default: config.json)
        config: Dictionary containing plugin configuration
        daemon: BackgroundDaemon instance (None if not started)
        logger: Logger instance for status messages
    
    Example:
        >>> manager = PluginManager()
        >>> manager.initialize()  # Load or create config
        >>> manager.start()       # Start background daemon
        >>> # ... plugin runs ...
        >>> manager.stop()        # Graceful shutdown
    """
    
    def __init__(self, config_path: str = "config.json"):
        """Initialize plugin manager with configuration file path.
        
        Creates a new PluginManager instance that handles plugin lifecycle,
        configuration management, and background daemon control. The manager
        initializes with default values and prepares for configuration loading.
        
        Args:
            config_path: Path to configuration file. Defaults to "config.json"
                in the current directory. Can be absolute or relative path.
        
        Example:
            >>> manager = PluginManager()  # Uses default config.json
            >>> manager = PluginManager("/path/to/custom_config.json")
        """
        self.config_path = Path(config_path)
        self.config: Dict[str, Any] = {}
        self.daemon: Optional['BackgroundDaemon'] = None
        self.logger = setup_logger()
    
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from config.json file.
        
        Reads and parses the JSON configuration file from disk. The configuration
        must contain at minimum an 'api_key' field. Additional optional fields
        include 'base_url', 'poll_interval', 'vector_db_path', and 
        'conversation_log_path'.
        
        Returns:
            Configuration dictionary containing plugin settings. Guaranteed to
            have 'api_key' field if validation passes. May contain additional
            optional configuration fields.
            
        Raises:
            FileNotFoundError: Configuration file does not exist at config_path.
            json.JSONDecodeError: Configuration file contains invalid JSON syntax.
                The file may be corrupted or manually edited incorrectly.
            
        Example:
            >>> manager = PluginManager()
            >>> config = manager.load_config()
            >>> print(config['api_key'])
            'your-api-key-here'
        """
        if not self.config_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {self.config_path}")
        
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            self.logger.info(f"[AgentOracle] 从 {self.config_path} 加载配置")  # Configuration loaded from
            return config
        except json.JSONDecodeError as e:
            self.logger.error(f"[AgentOracle] 配置文件解析失败: {e}", exc_info=True)  # Failed to parse configuration file
            raise
        except Exception as e:
            self.logger.error(f"[AgentOracle] 加载配置时发生意外错误: {e}", exc_info=True)  # Unexpected error loading configuration
            raise
    
    def save_config(self, config: Dict[str, Any]) -> None:
        """Save configuration to config.json with secure file permissions.
        
        Writes the configuration dictionary to disk as JSON and sets file
        permissions to 0600 (owner read/write only) to protect the API key.
        This prevents other users on the system from reading sensitive credentials.
        
        The configuration is formatted with 2-space indentation for readability.
        If the file already exists, it will be overwritten.
        
        Args:
            config: Configuration dictionary to save. Must be JSON-serializable.
                Typically contains 'api_key', 'base_url', 'poll_interval', etc.
        
        Raises:
            IOError: Failed to write configuration file due to I/O error.
            OSError: Failed to set file permissions (e.g., permission denied).
            TypeError: Configuration contains non-JSON-serializable objects.
            
        Example:
            >>> manager = PluginManager()
            >>> config = {'api_key': 'abc123...', 'poll_interval': 180}
            >>> manager.save_config(config)
            # File saved with permissions -rw------- (0600)
        """
        try:
            # Write configuration to file with UTF-8 encoding
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            
            # Set file permissions to 0600 (owner read/write only)
            os.chmod(self.config_path, 0o600)
            
            self.logger.info(f"[AgentOracle] 配置已保存到 {self.config_path}，权限为 0600")  # Configuration saved with permissions 0600
        except (IOError, OSError) as e:
            self.logger.error(f"[AgentOracle] 保存配置失败（I/O 错误）: {e}", exc_info=True)  # Failed to save configuration (I/O error)
            raise
        except Exception as e:
            self.logger.error(f"[AgentOracle] 保存配置失败: {e}", exc_info=True)  # Failed to save configuration
            raise
    
    def validate_api_key(self, api_key: str) -> bool:
        """Validate API key format meets minimum security requirements.
        
        Checks that the API key is a string with at least 32 characters.
        This is a format validation only - it does not verify the key is
        valid with the AgentOracle server.
        
        Args:
            api_key: API key string to validate. Should be obtained from
                AgentOracle platform.
            
        Returns:
            True if the API key format is valid (string with 32+ characters).
            False if the key is invalid (wrong type, too short, or empty).
            
        Example:
            >>> manager = PluginManager()
            >>> manager.validate_api_key("abc")
            False
            >>> manager.validate_api_key("a" * 32)
            True
            >>> manager.validate_api_key(12345)
            False
        """
        if not isinstance(api_key, str):
            return False
        
        if len(api_key) < 32:
            return False
        
        return True
    
    def prompt_for_api_key(self) -> str:
        """Prompt user to enter their API key via interactive input.
        
        Displays an interactive prompt asking the user to enter their AgentOracle
        API key. Validates the input and repeats the prompt if validation fails.
        This method blocks until a valid API key is provided.
        
        The prompt will continue looping until the user provides a valid key
        (minimum 32 characters). Invalid attempts display an error message.
        
        Returns:
            Valid API key string entered by the user. Guaranteed to pass
            validate_api_key() check.
            
        Example:
            >>> manager = PluginManager()
            >>> api_key = manager.prompt_for_api_key()
            [AgentOracle] Please enter your API_KEY: abc
            [AgentOracle] Error: Invalid API_KEY format. Please try again.
            [AgentOracle] Please enter your API_KEY: abc123...
            [AgentOracle] API_KEY validated successfully
        """
        while True:
            api_key = input("[AgentOracle] Please enter your API_KEY: ").strip()
            
            if self.validate_api_key(api_key):
                self.logger.info("[AgentOracle] API_KEY 验证成功")  # API_KEY validated successfully
                return api_key
            else:
                self.logger.error("[AgentOracle] API_KEY 格式无效。API_KEY 必须至少 32 个字符。")  # Invalid API_KEY format
                print("[AgentOracle] 错误: API_KEY 格式无效。请重试。")  # Error: Invalid API_KEY format
    
    def prompt_for_agent_token(self) -> Optional[str]:
        """Prompt user to enter their OpenClaw agent token via interactive input.
        
        Displays an interactive prompt asking the user to enter their OpenClaw
        Gateway authentication token. This is optional - user can press Enter
        to skip if not using OpenClaw or if OpenClaw doesn't require authentication.
        
        Returns:
            Agent token string entered by the user, or None if user skipped.
            
        Example:
            >>> manager = PluginManager()
            >>> agent_token = manager.prompt_for_agent_token()
            [AgentOracle] 请输入 OpenClaw Agent Token（可选，直接回车跳过）: abc123...
            [AgentOracle] Agent Token 已设置
        """
        print("\n[AgentOracle] ========================================")
        print("[AgentOracle] OpenClaw 配置（可选）")
        print("[AgentOracle] 如果您使用 OpenClaw Gateway 认证，请输入 Agent Token")
        print("[AgentOracle] 如果不使用 OpenClaw 或无需认证，直接回车跳过")
        print("[AgentOracle] ========================================\n")
        
        agent_token = input("[AgentOracle] 请输入 Agent Token（可选）: ").strip()
        
        if agent_token:
            self.logger.info("[AgentOracle] Agent Token 已设置")
            return agent_token
        else:
            self.logger.info("[AgentOracle] 跳过 Agent Token 配置")
            return None
    
    def initialize(self) -> None:
        """Initialize plugin by loading or creating configuration.
        
        Attempts to load existing configuration from disk. If the configuration
        file doesn't exist or is corrupted, prompts the user to create a new
        configuration by entering their API key.
        
        This method handles three scenarios:
        1. Valid config exists: Loads and validates it
        2. Config missing: Creates new config with user input
        3. Config corrupted: Recreates config with user input
        
        After successful initialization, self.config contains a valid
        configuration dictionary with at least an 'api_key' field.
        
        Raises:
            Exception: Unexpected error during initialization that prevents
                the plugin from starting. This could be due to file system
                permissions, I/O errors, or other system-level issues.
                
        Example:
            >>> manager = PluginManager()
            >>> manager.initialize()
            [AgentOracle] Configuration loaded and validated successfully
            >>> print(manager.config['api_key'])
            'your-api-key-here'
        """
        try:
            # Try to load existing configuration
            self.config = self.load_config()
            
            # Validate API key from loaded config
            api_key = self.config.get('api_key')
            if not api_key or not self.validate_api_key(api_key):
                self.logger.warning("[AgentOracle] 配置中的 API_KEY 无效或缺失")  # Invalid or missing API_KEY in configuration
                api_key = self.prompt_for_api_key()
                self.config['api_key'] = api_key
                self.save_config(self.config)
            else:
                self.logger.info("[AgentOracle] 配置加载并验证成功")  # Configuration loaded and validated successfully
                
        except FileNotFoundError:
            # Configuration file doesn't exist, create new one
            try:
                self.logger.info("[AgentOracle] 未找到配置文件，创建新配置")  # Configuration file not found, creating new configuration
                api_key = self.prompt_for_api_key()
                
                # Auto-detect local LLM environment
                self.logger.info("[AgentOracle] 正在自动探测本地 LLM 环境...")
                detector = EnvironmentDetector(timeout=2)
                detection_result = detector.auto_detect_environment()
                
                # Create default configuration
                self.config = {
                    'api_key': api_key,
                    'base_url': 'https://your-platform-domain.com',
                    'poll_interval': 180,
                    'vector_db_path': '~/.openclaw/vector_db',
                    'conversation_log_path': '~/.openclaw/conversations.log'
                }
                
                # Apply auto-detected configuration if available
                if detection_result.is_ready:
                    self.logger.info(f"[AgentOracle] ✅ 自动配置成功: {detection_result.provider}")
                    
                    # Determine agent_type from provider name
                    agent_type_map = {
                        'Ollama': 'ollama',
                        'LM Studio': 'lmstudio',
                        'OpenClaw': 'openclaw'
                    }
                    agent_type = agent_type_map.get(detection_result.provider, None)
                    
                    self.config.update({
                        'agent_api_url': detection_result.api_base_url,
                        'agent_model': detection_result.selected_model,
                        'agent_token': None,
                        'agent_type': agent_type,
                        'agent_executable': None
                    })
                else:
                    # No service detected, ask user for agent_token (OpenClaw manual config)
                    self.logger.warning("[AgentOracle] 未检测到服务，询问用户是否手动配置")
                    agent_token = self.prompt_for_agent_token()
                    
                    if agent_token:
                        self.config.update({
                            'agent_api_url': 'http://127.0.0.1:18789',
                            'agent_model': 'openclaw:main',
                            'agent_token': agent_token,
                            'agent_type': 'openclaw',
                            'agent_executable': 'openclaw'
                        })
                        self.logger.info("[AgentOracle] OpenClaw 手动配置已添加")
                    else:
                        # Fallback to Ollama defaults
                        self.config.update({
                            'agent_api_url': 'http://127.0.0.1:11434',
                            'agent_model': None,
                            'agent_token': None,
                            'agent_type': None,
                            'agent_executable': None
                        })
                
                self.save_config(self.config)
                self.logger.info("[AgentOracle] 配置创建成功")  # Configuration created successfully
            except Exception as e:
                self.logger.error(f"[AgentOracle] 创建配置失败: {e}", exc_info=True)  # Failed to create configuration
                raise
            
        except json.JSONDecodeError as e:
            # Configuration file is corrupted
            try:
                self.logger.error(f"[AgentOracle] 配置文件已损坏: {e}", exc_info=True)  # Configuration file is corrupted
                print("[AgentOracle] 错误: 配置文件已损坏，无法解析。")  # Error: Configuration file is corrupted
                print("[AgentOracle] 将重新创建配置。")  # The configuration will be recreated
                
                # Prompt user and recreate configuration
                api_key = self.prompt_for_api_key()
                
                # Auto-detect local LLM environment
                self.logger.info("[AgentOracle] 正在自动探测本地 LLM 环境...")
                detector = EnvironmentDetector(timeout=2)
                detection_result = detector.auto_detect_environment()
                
                # Create default configuration
                self.config = {
                    'api_key': api_key,
                    'base_url': 'https://your-platform-domain.com',
                    'poll_interval': 180,
                    'vector_db_path': '~/.openclaw/vector_db',
                    'conversation_log_path': '~/.openclaw/conversations.log'
                }
                
                # Apply auto-detected configuration if available
                if detection_result.is_ready:
                    self.logger.info(f"[AgentOracle] ✅ 自动配置成功: {detection_result.provider}")
                    
                    # Determine agent_type from provider name
                    agent_type_map = {
                        'Ollama': 'ollama',
                        'LM Studio': 'lmstudio',
                        'OpenClaw': 'openclaw'
                    }
                    agent_type = agent_type_map.get(detection_result.provider, None)
                    
                    self.config.update({
                        'agent_api_url': detection_result.api_base_url,
                        'agent_model': detection_result.selected_model,
                        'agent_token': None,
                        'agent_type': agent_type,
                        'agent_executable': None
                    })
                else:
                    # No service detected, ask user for agent_token (OpenClaw manual config)
                    self.logger.warning("[AgentOracle] 未检测到服务，询问用户是否手动配置")
                    agent_token = self.prompt_for_agent_token()
                    
                    if agent_token:
                        self.config.update({
                            'agent_api_url': 'http://127.0.0.1:18789',
                            'agent_model': 'openclaw:main',
                            'agent_token': agent_token,
                            'agent_type': 'openclaw',
                            'agent_executable': 'openclaw'
                        })
                        self.logger.info("[AgentOracle] OpenClaw 手动配置已添加")
                    else:
                        # Fallback to Ollama defaults
                        self.config.update({
                            'agent_api_url': 'http://127.0.0.1:11434',
                            'agent_model': None,
                            'agent_token': None,
                            'agent_type': None,
                            'agent_executable': None
                        })
                
                self.save_config(self.config)
                self.logger.info("[AgentOracle] 配置在损坏后重新创建成功")  # Configuration recreated successfully after corruption
            except Exception as e:
                self.logger.error(f"[AgentOracle] 重新创建配置失败: {e}", exc_info=True)  # Failed to recreate configuration
                raise
        except Exception as e:
            self.logger.error(f"[AgentOracle] 初始化时发生意外错误: {e}", exc_info=True)  # Unexpected error during initialization
            raise
    
    def start(self, on_task_complete=None, gui_tray=None) -> None:
        """Start the background daemon to begin task polling.
        
        Creates and starts a BackgroundDaemon instance using the loaded
        configuration. The daemon runs in a separate thread and polls the
        AgentOracle server for tasks at regular intervals.
        
        This method should only be called after initialize() has successfully
        loaded or created a valid configuration.
        
        Args:
            on_task_complete: Optional callback function called when a task completes.
                Signature: on_task_complete(task_data: Dict[str, Any])
            gui_tray: Optional reference to GUI tray for status updates.
        
        Raises:
            ValueError: API key not found in configuration. Call initialize()
                first to ensure configuration is loaded.
            Exception: Failed to create or start the background daemon due to
                system resource issues or configuration problems.
                
        Example:
            >>> manager = PluginManager()
            >>> manager.initialize()
            >>> manager.start()
            [AgentOracle] Plugin started
            [AgentOracle] Background daemon started
        """
        try:
            # Check if daemon already exists and is running
            if self.daemon is not None and self.daemon.running:
                self.logger.warning("[AgentOracle] 插件已在运行")  # Plugin is already running
                return
            
            # Get configuration values
            api_key = self.config.get('api_key')
            base_url = self.config.get('base_url')
            poll_interval = self.config.get('poll_interval', 180)
            jitter_seconds = self.config.get('jitter_seconds', 30)
            vector_db_path = self.config.get('vector_db_path', '~/.openclaw/vector_db')
            conversation_log_path = self.config.get('conversation_log_path', '~/.openclaw/conversations.log')
            
            # WebSocket configuration (OpenClaw Gateway Protocol v3)
            gateway_ws_url = self.config.get('gateway_ws_url', 'ws://127.0.0.1:18789')
            gateway_token = self.config.get('gateway_token')
            agent_type = self.config.get('agent_type')
            agent_executable = self.config.get('agent_executable')
            
            # Validate API key exists
            if not api_key:
                self.logger.error("[AgentOracle] 无法启动插件: 配置中未找到 API key")  # Cannot start plugin: API key not found
                raise ValueError("配置中未找到 API key")  # API key not found in configuration
            
            # Validate base_url exists
            if not base_url:
                self.logger.error("[AgentOracle] 无法启动插件: 配置中未找到 base_url")  # Cannot start plugin: base_url not found
                raise ValueError("配置中未找到 base_url。请在 config.json 中设置 base_url")  # base_url not found. Please set base_url in config.json
            
            # Create BackgroundDaemon instance with config values
            self.daemon = BackgroundDaemon(
                api_key=api_key,
                base_url=base_url,
                poll_interval=poll_interval,
                jitter_seconds=jitter_seconds,
                vector_db_path=vector_db_path,
                conversation_log_path=conversation_log_path,
                gateway_ws_url=gateway_ws_url,
                gateway_token=gateway_token,
                agent_type=agent_type,
                agent_executable=agent_executable,
                on_task_complete=on_task_complete,
                gui_tray=gui_tray
            )
            
            # Start the daemon
            self.daemon.start()
            
            # Log success
            self.logger.info("[AgentOracle] 插件已启动")  # Plugin started
            
        except Exception as e:
            self.logger.error(f"[AgentOracle] 启动插件失败: {e}", exc_info=True)  # Failed to start plugin
            raise
    
    def stop(self) -> None:
        """Stop the background daemon and perform graceful shutdown.
        
        Signals the background daemon to stop polling and waits up to 5 seconds
        for it to complete any in-progress tasks and shut down cleanly. After
        stopping, the daemon instance is set to None to release resources.
        
        This method is safe to call multiple times. If no daemon is running,
        it logs a warning and returns without error.
        
        Raises:
            Exception: Error occurred during daemon shutdown. The daemon may
                not have stopped cleanly, but resources are still released.
                
        Example:
            >>> manager = PluginManager()
            >>> manager.initialize()
            >>> manager.start()
            >>> # ... plugin runs ...
            >>> manager.stop()
            [AgentOracle] Background daemon stopped
            [AgentOracle] Plugin stopped
        """
        try:
            # Check if daemon exists
            if self.daemon is None:
                self.logger.warning("[AgentOracle] 没有要停止的守护进程")  # No daemon to stop
                return
            
            # Stop the daemon
            self.daemon.stop()
            
            # Set daemon to None to clean up resources
            self.daemon = None
            
            # Log success
            self.logger.info("[AgentOracle] 插件已停止")  # Plugin stopped
            
        except Exception as e:
            self.logger.error(f"[AgentOracle] 停止插件时出错: {e}", exc_info=True)  # Error stopping plugin
            raise


class BackgroundDaemon:
    """Background polling engine that periodically fetches and executes tasks"""
    
    def __init__(self, api_key: str, base_url: str,
                 poll_interval: int = 180,
                 jitter_seconds: int = 30,
                 vector_db_path: str = "~/.openclaw/vector_db",
                 conversation_log_path: str = "~/.openclaw/conversations.log",
                 gateway_ws_url: str = "ws://127.0.0.1:18789",
                 gateway_token: Optional[str] = None,
                 agent_type: Optional[str] = None,
                 agent_executable: Optional[str] = None,
                 on_task_complete=None,
                 gui_tray=None):
        """Initialize background daemon with API credentials and configuration.
        
        Creates a new BackgroundDaemon that polls the AgentOracle server for
        tasks at regular intervals. The daemon initializes all required components
        including API client, telemetry collector, sanitizer, validators, and
        WebSocket client for OpenClaw Gateway communication.
        
        Args:
            api_key: AgentOracle API key for authentication. Must be at least
                32 characters long.
            base_url: API base URL. Required parameter that must be provided
                from configuration file. Should point to the platform domain,
                e.g. "https://your-platform-domain.com".
                Plugins connect through the platform's unified API routes,
                NOT directly to Supabase.
            poll_interval: Base polling interval in seconds. Defaults to 180.
                Actual interval varies randomly within ±30 seconds to prevent
                synchronized request storms across multiple instances.
            vector_db_path: Path to vector database file for telemetry collection.
                Defaults to "~/.openclaw/vector_db". Tilde expansion is supported.
            conversation_log_path: Path to conversation log file for telemetry.
                Defaults to "~/.openclaw/conversations.log". Tilde expansion
                is supported.
            gateway_ws_url: WebSocket URL for OpenClaw Gateway. Defaults to
                "ws://127.0.0.1:18789". This is the standard OpenClaw Gateway port.
            gateway_token: Optional authentication token for OpenClaw Gateway.
                Required if Gateway has authentication enabled.
            agent_type: Optional agent type ("openclaw"). Used for process
                management features. If None, process management is disabled.
            agent_executable: Optional path to agent executable for cold start.
                Required if agent_type is specified and you want auto-restart features.
            on_task_complete: Optional callback function called when a task completes.
                Signature: on_task_complete(task_data: Dict[str, Any])
            gui_tray: Optional reference to GUI tray for status updates.
        
        Example:
            >>> daemon = BackgroundDaemon(
            ...     api_key="abc123...",
            ...     base_url="https://your-platform-domain.com",
            ...     poll_interval=180,
            ...     vector_db_path="/path/to/vector_db",
            ...     conversation_log_path="/path/to/conversations.log",
            ...     gateway_ws_url="ws://127.0.0.1:18789",
            ...     gateway_token="your-token-here",
            ...     agent_type="openclaw",
            ...     agent_executable="openclaw"
            ... )
            >>> daemon.start()
        """
        self.api_key = api_key
        self.base_url = base_url
        self.poll_interval = poll_interval
        self.jitter_seconds = jitter_seconds
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.error_count = 0
        self.logger = setup_logger()
        self.on_task_complete = on_task_complete
        self.gui_tray = gui_tray
        
        # Initialize memory monitor (500MB limit)
        self.memory_monitor = MemoryMonitor(max_memory_mb=500)
        
        # Initialize API client with base_url
        self.api_client = AgentOracleClient(api_key, base_url=base_url)
        
        # Initialize telemetry collector
        self.telemetry_collector = TelemetryCollector(
            vector_db_path=vector_db_path,
            conversation_log_path=conversation_log_path
        )
        
        # Initialize sanitizer
        self.sanitizer = Sanitizer()
        
        # Initialize string length validator
        self.string_validator = StringLengthValidator()
        
        # Initialize WebSocket client for OpenClaw Gateway
        self.logger.info("[AgentOracle] ✅ 使用 WebSocket 集成方式 (OpenClaw Gateway Protocol v3)")
        self.ws_client = OpenClawWebSocketClient(
            gateway_url=gateway_ws_url,
            gateway_token=gateway_token,
            timeout=300,  # 5 minutes for large responses
            max_retries=3,
            connect_timeout=10,
            message_timeout=20
        )
        
        # Initialize agent manager (防弹级进程管理) - optional
        # Only initialize if agent_type is provided
        if agent_type:
            self.agent_manager = AgentManager(
                agent_api_url=gateway_ws_url.replace("ws://", "http://").replace("wss://", "https://"),
                agent_type=agent_type,
                agent_executable=agent_executable,
                health_check_interval=10,
                zombie_timeout=300
            )
        else:
            self.agent_manager = None
            self.logger.info("[AgentOracle] Agent 进程管理已禁用（未配置 agent_type）")
        
        # Initialize submission logger (提交记录管理)
        self.submission_logger = SubmissionLogger(
            log_file="./data/submissions.json",
            max_records=1000
        )
    
    def start(self) -> None:
        """Start the background polling thread.
        
        Creates and starts a daemon thread that runs the main polling loop.
        The thread is marked as a daemon so it won't prevent the program from
        exiting. This method is idempotent - calling it multiple times has no
        additional effect if the daemon is already running.
        
        Before starting the polling loop, validates the API key by making a
        test request to the server. If validation fails, raises an exception
        and does not start the daemon.
        
        The polling loop begins immediately after this method returns. Tasks
        will be fetched and processed according to the configured poll_interval.
        
        Raises:
            Exception: API key validation failed. The key may be invalid,
                expired, or the server may be unreachable.
        
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...")
            >>> daemon.start()
            [AgentOracle] Validating API key...
            [AgentOracle] API key validated successfully
            [AgentOracle] Background daemon started
            >>> # Daemon now polling in background thread
        """
        if self.running:
            self.logger.warning("[AgentOracle] 后台守护进程已在运行")  # Background daemon is already running
            return
        
        # Validate API key before starting daemon
        self.logger.info("[AgentOracle] 正在验证 API key...")  # Validating API key...
        try:
            self._validate_api_key()
            self.logger.info("[AgentOracle] ✅ API key 验证成功")  # API key validated successfully
        except Exception as e:
            self.logger.error(f"[AgentOracle] ❌ API key 验证失败: {e}")  # API key validation failed
            raise
        
        # Start agent manager health check (if enabled)
        if self.agent_manager:
            self.logger.info("[AgentOracle] 启动 Agent 健康检查...")
            self.agent_manager.start_health_check()
        
        # Set running flag to True
        self.running = True
        
        # Create background thread with daemon=True
        self.thread = threading.Thread(target=self.run, daemon=True)
        
        # Start the thread
        self.thread.start()
        
        # Log startup message
        self.logger.info("[AgentOracle] 后台守护进程已启动")  # Background daemon started
    
    def stop(self) -> None:
        """Stop the background thread with graceful shutdown.
        
        Signals the polling loop to stop and waits up to 5 seconds for the
        thread to complete any in-progress task and exit cleanly. If the thread
        doesn't stop within 5 seconds, a warning is logged but the method returns.
        
        This method is safe to call multiple times. If the daemon is not running,
        it logs a warning and returns without error.
        
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...")
            >>> daemon.start()
            >>> # ... daemon runs ...
            >>> daemon.stop()
            [AgentOracle] Background daemon stopped
        """
        if not self.running:
            self.logger.warning("[AgentOracle] 后台守护进程未运行")  # Background daemon is not running
            return
        
        # Stop agent manager health check (if enabled)
        if self.agent_manager:
            self.logger.info("[AgentOracle] 停止 Agent 健康检查...")
            self.agent_manager.stop_health_check()
        
        # Set running flag to False
        self.running = False
        
        # Signal the stop event to wake up the thread if it's waiting
        self.stop_event.set()
        
        # Wait for thread to finish with 5 second timeout
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5)
            
            # Check if thread is still alive after timeout
            if self.thread.is_alive():
                self.logger.warning("[AgentOracle] 后台守护进程在 5 秒内未停止")  # Background daemon did not stop within 5 seconds
            else:
                self.logger.info("[AgentOracle] 后台守护进程已停止")  # Background daemon stopped
        else:
            self.logger.info("[AgentOracle] 后台守护进程已停止")  # Background daemon stopped
    
    def _validate_api_key(self) -> None:
        """Validate API key by making a test request to the server.
        
        Makes a lightweight API call to verify that the API key is valid and
        the server is reachable. This is called during daemon startup to fail
        fast if the configuration is incorrect.
        
        The validation uses the /api/agent/tasks endpoint, which is a lightweight
        operation that only checks authentication without performing heavy
        database queries.
        
        Raises:
            Exception: API key validation failed. Possible reasons:
                - Invalid or expired API key (HTTP 401)
                - Account restricted/purgatory (HTTP 403)
                - Server unreachable (network error)
                - Other server errors (HTTP 5xx)
                
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...")
            >>> daemon._validate_api_key()  # Raises exception if invalid
        """
        try:
            # Make a test request to /api/agent/tasks endpoint
            # This endpoint requires authentication and will return 401 if key is invalid
            status_code, response_data = self.api_client._make_request("GET", "/api/agent/tasks")
            
            # Check status code
            if status_code == 200:
                # Success - API key is valid
                return
            elif status_code == 204:
                # No tasks available, but authentication succeeded
                return
            elif status_code == 401:
                # Authentication failed - invalid API key
                error_msg = "Invalid API key"
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("message", error_msg)
                raise Exception(f"Authentication failed: {error_msg}")
            elif status_code == 403:
                # Account restricted (purgatory) - but key is valid
                self.logger.warning("[AgentOracle] Account is restricted (purgatory mode)")
                return
            else:
                # Other error
                error_msg = f"Server returned status code {status_code}"
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("message", error_msg)
                raise Exception(f"API validation failed: {error_msg}")
                
        except Exception as e:
            # Re-raise with more context
            raise Exception(f"Failed to validate API key: {e}")
    
    def _calculate_next_interval(self) -> float:
        """Calculate next polling interval with random jitter.
        
        Adds random variation to the base poll_interval to prevent synchronized
        request storms when multiple plugin instances are running. The jitter
        range is configurable via jitter_seconds parameter.
        
        Returns:
            Random interval in seconds, uniformly distributed in the range
            [poll_interval - jitter_seconds, poll_interval + jitter_seconds].
            For example, with poll_interval=60 and jitter_seconds=30,
            returns a value between 30 and 90 seconds.
            
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...", poll_interval=60, jitter_seconds=30)
            >>> interval = daemon._calculate_next_interval()
            >>> print(30 <= interval <= 90)
            True
        """
        return random.uniform(self.poll_interval - self.jitter_seconds, self.poll_interval + self.jitter_seconds)
    
    def run(self) -> None:
        """Main polling loop that runs in the background thread.
        
        Continuously polls the AgentOracle server for tasks at randomized intervals.
        For each polling cycle:
        1. Checks memory usage limits
        2. Fetches available tasks from the server
        3. Processes any received tasks
        4. Waits for the next interval (with random jitter)
        
        The loop uses stop_event.wait() instead of time.sleep() to enable
        graceful shutdown - the wait can be interrupted by calling stop().
        
        Error handling:
        - Non-fatal errors are logged and the loop continues
        - After 5 consecutive errors, logs a warning about potential config issues
        - KeyboardInterrupt triggers graceful shutdown
        
        This method should not be called directly - it's invoked automatically
        by the background thread when start() is called.
        
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...")
            >>> daemon.start()  # Calls run() in background thread
            [AgentOracle] Checking for new tasks...
            [AgentOracle] Analyzing task...
            [AgentOracle] Submission successful, metadata health verified
        """
        while self.running:
            try:
                # Check memory usage before processing
                self.memory_monitor.check_memory_limit()
                
                # Log polling start
                self.logger.info("[AgentOracle] 正在检查新任务...")  # Checking for new tasks...
                
                # Fetch task from API
                task = self.api_client.fetch_task()
                
                # Process task if available
                if task is not None:
                    self.process_task(task)
                    # Reset error count on successful task processing
                    self.error_count = 0
                # If no task, continue to next polling cycle
                
            except KeyboardInterrupt:
                # Handle graceful shutdown on Ctrl+C
                self.logger.info("[AgentOracle] 收到中断信号，停止守护进程")  # Received interrupt signal, stopping daemon
                self.running = False
                break
            except Exception as e:
                # Log error with stack trace
                self.logger.error(f"[AgentOracle] 轮询循环错误: {e}", exc_info=True)  # Error in polling loop
                
                # Increment error count
                self.error_count += 1
                
                # Check for consecutive errors
                if self.error_count >= 5:
                    self.logger.warning("[AgentOracle] 检测到 5 个连续错误 - 可能存在配置问题")  # 5 consecutive errors detected - potential configuration issue
            
            # Calculate next interval with random jitter
            try:
                interval = self._calculate_next_interval()
                self.logger.info(f"[AgentOracle] ⏰ 下次检查任务将在 {interval:.0f} 秒后")
            except Exception as e:
                self.logger.error(f"[AgentOracle] 计算间隔时出错: {e}", exc_info=True)  # Error calculating interval
                interval = self.poll_interval  # Use default interval on error
            
            # Wait for the interval or until stop event is set
            # This allows graceful shutdown without waiting for full interval
            try:
                self.stop_event.wait(interval)
            except Exception as e:
                self.logger.error(f"[AgentOracle] 等待期间出错: {e}", exc_info=True)  # Error during wait
    
    def process_task(self, task: Dict[str, Any]) -> None:
        """Process a single task through the complete pipeline.
        
        Executes the full task processing workflow:
        1. Extracts question and keywords from task
        2. Starts timing for latency measurement
        3. Executes inference using local LLM
        4. Stops timing and collects telemetry
        5. Validates prediction string lengths
        6. Sanitizes prediction to remove PII
        7. Assembles complete payload
        8. Submits result to AgentOracle server
        
        Each step includes comprehensive error handling. If any critical step
        fails (e.g., inference, validation), the task is skipped and logged.
        
        Args:
            task: Task object containing at minimum:
                - id: Unique task identifier (required)
                - question: Prediction question text (required)
                - title: Task title (optional)
                
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...")
            >>> task = {
            ...     "id": "task-123",
            ...     "question": "Will it rain tomorrow?",
            ...     "title": "Weather Prediction"
            ... }
            >>> daemon.process_task(task)
            [AgentOracle] Analyzing task...
            [AgentOracle] Submission successful, metadata health verified
        """
        try:
            # Log task details
            task_id = task.get('id')
            title = task.get('title', 'N/A')
            question = task.get('question')
            keywords = task.get('required_niche_tags', [])
            reward_pool = task.get('reward_pool', 0)
            closes_at = task.get('closes_at', 'N/A')
            
            self.logger.info("[AgentOracle] ========================================")
            self.logger.info("[AgentOracle] 📋 收到任务:")  # Task Received
            self.logger.info(f"[AgentOracle]   - 任务 ID: {task_id}")  # Task ID
            self.logger.info(f"[AgentOracle]   - 标题: {title}")  # Title
            self.logger.info(f"[AgentOracle]   - 问题: {question}")  # Question
            self.logger.info(f"[AgentOracle]   - 关键词: {keywords}")  # Keywords
            self.logger.info(f"[AgentOracle]   - 奖励池: ${reward_pool}")  # Reward Pool
            self.logger.info(f"[AgentOracle]   - 截止时间: {closes_at}")  # Closes At
            self.logger.info("[AgentOracle] ========================================")
            
            if not task_id:
                self.logger.error("[AgentOracle] Task missing id field")
                return
            
            if not question:
                self.logger.error("[AgentOracle] Task missing question field")
                return
            
            # Start timing for inference latency measurement
            self.logger.info("[AgentOracle] 🤔 Starting inference...")
            try:
                self.telemetry_collector.start_timing()
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error starting timing: {e}", exc_info=True)
            
            # Execute inference using local LLM
            try:
                prediction_data = self.execute_inference(question, keywords)
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error during inference: {e}", exc_info=True)
                prediction_data = None
            
            # Stop timing
            try:
                self.telemetry_collector.stop_timing()
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error stopping timing: {e}", exc_info=True)
            
            # Check if inference failed
            if prediction_data is None:
                self.logger.error("[AgentOracle] ❌ Inference failed, skipping task submission")
                return
            
            # Log inference results
            self.logger.info("[AgentOracle] ========================================")
            self.logger.info("[AgentOracle] ✅ 推理完成:")  # Inference Complete
            self.logger.info(f"[AgentOracle]   - 概率: {prediction_data.get('probability', prediction_data.get('confidence', 0)):.2f}")  # Probability
            self.logger.info(f"[AgentOracle]   - 理由: {prediction_data.get('rationale', prediction_data.get('prediction', 'N/A'))[:100]}...")  # Rationale
            self.logger.info(f"[AgentOracle]   - 证据类型: {prediction_data.get('evidence_type', 'N/A')}")  # Evidence Type
            self.logger.info("[AgentOracle] ========================================")
            
            # Validate prediction string lengths before sanitization
            try:
                if not self.string_validator.validate_prediction_strings(prediction_data):
                    self.logger.error("[AgentOracle] Prediction data failed string length validation, skipping task submission")
                    return
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error validating prediction strings: {e}", exc_info=True)
                return
            
            # Collect all telemetry data
            try:
                telemetry_data = self.telemetry_collector.collect_all()
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error collecting telemetry: {e}", exc_info=True)
                # Use default telemetry data on error
                telemetry_data = {
                    "memory_entropy": {"db_size_bytes": 0, "total_chunks": 0, "recent_chunks_24h": 0},
                    "interaction_heartbeat": 0,
                    "inference_latency_ms": 0.0
                }
            
            # Sanitize prediction data to remove PII
            try:
                sanitized_prediction = self.sanitizer.sanitize_prediction(prediction_data)
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error sanitizing prediction: {e}", exc_info=True)
                # Use unsanitized data as fallback (better than failing completely)
                sanitized_prediction = prediction_data
            
            # Build prediction payload (platform /api/agent/predictions format)
            try:
                payload = {
                    "taskId": task_id,
                    "probability": sanitized_prediction.get("probability", sanitized_prediction.get("confidence", 0.5)),
                    "rationale": sanitized_prediction.get("rationale", sanitized_prediction.get("reasoning", "")),
                }
                
                # Add optional structured signal fields
                if sanitized_prediction.get("evidence_type"):
                    payload["evidence_type"] = sanitized_prediction["evidence_type"]
                if sanitized_prediction.get("evidence_text"):
                    payload["evidence_text"] = sanitized_prediction["evidence_text"]
                if sanitized_prediction.get("relevance_score") is not None:
                    payload["relevance_score"] = sanitized_prediction["relevance_score"]
                if sanitized_prediction.get("entity_tags"):
                    payload["entity_tags"] = sanitized_prediction["entity_tags"]
                if sanitized_prediction.get("source_urls"):
                    payload["source_url"] = sanitized_prediction["source_urls"][0] if isinstance(sanitized_prediction["source_urls"], list) else sanitized_prediction["source_urls"]
                elif sanitized_prediction.get("source_url"):
                    payload["source_url"] = sanitized_prediction["source_url"]
                
                self.logger.info("[AgentOracle] ========================================")
                self.logger.info("[AgentOracle] 📤 正在提交预测:")  # Submitting Prediction
                self.logger.info(f"[AgentOracle]   - 市场 ID: {task_id}")  # Market ID
                self.logger.info(f"[AgentOracle]   - 概率: {payload['probability']:.2f}")  # Probability
                self.logger.info(f"[AgentOracle]   - 分析理由: {payload['rationale'][:100]}...")  # Rationale
                self.logger.info("[AgentOracle] ========================================")
                
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error building payload: {e}", exc_info=True)
                return
            
            # Submit result to AgentOracle server
            try:
                success = self.api_client.submit_result(payload)
                
                # Log submission to local file
                try:
                    self.submission_logger.log_submission(
                        task_id=task_id,
                        task_title=title,
                        question=question,
                        original_prediction=prediction_data,
                        sanitized_prediction=sanitized_prediction,
                        telemetry_data=telemetry_data,
                        success=success
                    )
                except Exception as e:
                    self.logger.error(f"[AgentOracle] Error logging submission: {e}", exc_info=True)
                
                if success:
                    self.logger.info("[AgentOracle] ========================================")
                    self.logger.info("[AgentOracle] ✅ 提交成功!")  # Submission Successful!
                    self.logger.info("[AgentOracle]   - 元数据健康已验证")  # Metadata health verified
                    self.logger.info("[AgentOracle] ========================================")
                    
                    # Call callback if provided
                    if self.on_task_complete:
                        try:
                            task_data = {
                                'time': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                'task_id': task_id,
                                'id': task_id,
                                'title': title,
                                'probability': prediction_data.get('probability', prediction_data.get('confidence', 0)),
                                'confidence': prediction_data.get('probability', prediction_data.get('confidence', 0)),
                                'status': '成功'
                            }
                            self.on_task_complete(task_data)
                        except Exception as e:
                            self.logger.error(f"[AgentOracle] Error calling task complete callback: {e}", exc_info=True)
                else:
                    self.logger.error("[AgentOracle] ========================================")
                    self.logger.error("[AgentOracle] ❌ 提交失败")  # Submission Failed
                    self.logger.error("[AgentOracle] ========================================")
                    
                    # Call callback if provided (for failed tasks)
                    if self.on_task_complete:
                        try:
                            task_data = {
                                'time': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                'task_id': task_id,
                                'id': task_id,
                                'title': title,
                                'probability': prediction_data.get('probability', prediction_data.get('confidence', 0)),
                                'confidence': prediction_data.get('probability', prediction_data.get('confidence', 0)),
                                'status': '失败'
                            }
                            self.on_task_complete(task_data)
                        except Exception as e:
                            self.logger.error(f"[AgentOracle] Error calling task complete callback: {e}", exc_info=True)
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error submitting result: {e}", exc_info=True)
                
                # Log failed submission
                try:
                    self.submission_logger.log_submission(
                        task_id=task_id,
                        task_title=title,
                        question=question,
                        original_prediction=prediction_data,
                        sanitized_prediction=sanitized_prediction,
                        telemetry_data=telemetry_data,
                        success=False
                    )
                except Exception as e2:
                    self.logger.error(f"[AgentOracle] Error logging failed submission: {e2}", exc_info=True)
                
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error processing task: {e}", exc_info=True)
    
    def execute_inference(self, question: str, keywords: list) -> Optional[Dict[str, Any]]:
        """Execute inference using OpenClaw Gateway via WebSocket.

        Sends a structured prompt to OpenClaw Gateway using WebSocket Protocol v3
        and receives the agent's response. The response is parsed and validated
        to ensure it contains all required fields.

        Args:
            question: Prediction question text. Must be non-empty string.
            keywords: List of keyword strings to provide context. Can be empty.

        Returns:
            Dictionary containing:
            - prediction: Prediction answer text (string)
            - confidence: Confidence score 0.0-1.0 (float)
            - reasoning: Explanation of the prediction (string)

            Returns None if inference fails or validation fails.
        """
        try:
            # Log that we're analyzing the task
            self.logger.info("[AgentOracle] Analyzing task...")

            # Validate inputs
            if not question or not isinstance(question, str):
                self.logger.error("[AgentOracle] Invalid question field in task")
                return None

            if not isinstance(keywords, list):
                self.logger.error("[AgentOracle] Invalid keywords field in task")
                return None

            # Check agent health before inference (if agent manager is enabled)
            if self.agent_manager and not self.agent_manager.is_alive:
                self.logger.warning("[AgentOracle] Agent 未响应，尝试启动...")
                if not self.agent_manager.start_agent():
                    self.logger.error("[AgentOracle] 无法启动 Agent，跳过任务")
                    return None

            # Update GUI tray to thinking state
            if self.gui_tray:
                try:
                    self.gui_tray.set_thinking_state(True)
                except Exception as e:
                    self.logger.debug(f"[AgentOracle] 更新 GUI 状态失败: {e}")

            # Build prediction prompt
            prompt = self._build_prediction_prompt(question, keywords)

            # Log prompt length for debugging
            self.logger.info(f"[AgentOracle] 📝 Prompt 长度: {len(prompt)} 字符")
            self.logger.debug(f"[AgentOracle] Prompt 前 200 字符: {prompt[:200]}")
            
            # Save prompt to file for debugging (optional, can be disabled in production)
            try:
                debug_dir = Path("./debug")
                debug_dir.mkdir(exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                prompt_file = debug_dir / f"prompt_{timestamp}.txt"
                with open(prompt_file, "w", encoding="utf-8") as f:
                    f.write(prompt)
                self.logger.debug(f"[AgentOracle] Prompt 已保存到: {prompt_file}")
            except Exception as e:
                self.logger.debug(f"[AgentOracle] 保存 prompt 失败: {e}")

            # Send message via WebSocket and get response
            self.logger.info("[AgentOracle] 📤 发送预测任务到 OpenClaw Gateway...")
            response_text = self.ws_client.send_message_sync(prompt)

            # Update GUI tray back to idle state
            if self.gui_tray:
                try:
                    self.gui_tray.set_thinking_state(False)
                except Exception as e:
                    self.logger.debug(f"[AgentOracle] 更新 GUI 状态失败: {e}")

            if response_text is None:
                self.logger.error("[AgentOracle] WebSocket 通信失败")
                return None

            # Log response length for debugging
            self.logger.info(f"[AgentOracle] 📥 收到响应长度: {len(response_text)} 字符")
            self.logger.debug(f"[AgentOracle] 响应前 200 字符: {response_text[:200]}")
            
            # Print AI response to console (like daily_elf)
            print("\n" + "="*60)
            print("📝 AI 分析结果:")
            print("="*60)
            print(response_text)
            print("="*60 + "\n")
            
            # Save complete response to predictions folder (like daily_elf)
            try:
                predictions_dir = Path("./predictions")
                predictions_dir.mkdir(exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                prediction_file = predictions_dir / f"prediction_{timestamp}.md"
                
                with open(prediction_file, "w", encoding="utf-8") as f:
                    f.write(f"# AgentOracle 预测分析\n\n")
                    f.write(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                    f.write(f"## 任务问题\n{question}\n\n")
                    if keywords:
                        f.write(f"## 关键词\n{', '.join(keywords)}\n\n")
                    f.write(f"## AI 分析结果\n{response_text}\n")
                
                self.logger.info(f"[AgentOracle] 💾 完整预测已保存到: {prediction_file}")
            except Exception as e:
                self.logger.debug(f"[AgentOracle] 保存预测文件失败: {e}")
            
            # Save response to debug folder for debugging (optional, can be disabled in production)
            try:
                debug_dir = Path("./debug")
                debug_dir.mkdir(exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                response_file = debug_dir / f"response_{timestamp}.txt"
                with open(response_file, "w", encoding="utf-8") as f:
                    f.write(response_text)
                self.logger.debug(f"[AgentOracle] 响应已保存到: {response_file}")
            except Exception as e:
                self.logger.debug(f"[AgentOracle] 保存响应失败: {e}")

            # Parse response to extract prediction data
            prediction_data = self._parse_prediction_response(response_text)

            if prediction_data is None:
                self.logger.error("[AgentOracle] 无法解析 Agent 响应")
                return None

            self.logger.info(f"[AgentOracle] Inference completed successfully (confidence: {prediction_data.get('confidence', 0)})")

            return prediction_data

        except Exception as e:
            # Update GUI tray back to idle state on error
            if self.gui_tray:
                try:
                    self.gui_tray.set_thinking_state(False)
                except Exception as e2:
                    self.logger.debug(f"[AgentOracle] 更新 GUI 状态失败: {e2}")

            # Log error and return None on failure
            self.logger.error(f"[AgentOracle] Inference failed: {e}", exc_info=True)
            return None

    def _build_prediction_prompt(self, question: str, keywords: list) -> str:
        """Build prediction task prompt for OpenClaw Agent (same format as daily_elf)."""
        from datetime import datetime

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        keywords_str = ", ".join(keywords) if keywords else "无"

        prompt = f"""【智能预测任务】{now}

你是一位资深的预测分析专家。请充分利用你的所有工具和能力来完成以下预测任务。

**重要：请使用中文进行分析和回复。**

## 任务描述
{question}

## 关键词
{keywords_str}

## 信息收集要求（请使用你的所有工具）

### 1. 本地信息获取
- 自行查找创建的所有建立的记忆相关文件或者内容
- 使用**记忆检索工具**查找所有相关的历史记忆和交互记录
- 检索与任务相关的本地知识库、文档、笔记
- 查找历史对话中的相关讨论和结论

### 2. 用户画像分析
- 分析用户的历史行为模式和偏好
- 总结用户的专业领域和兴趣方向
- 识别用户的决策风格和关注重点

### 3. 互联网信息检索
- 使用**网络搜索工具**查找最新的行业动态和趋势
- 搜索相关的新闻、报告、研究成果
- 获取市场数据、统计信息、专家观点

### 4. 历史数据分析
- 检索相关的历史数据和时间序列信息
- 分析过去的趋势和模式
- 识别周期性规律和异常事件

### 5. 综合信息整合
- 整合所有来源的信息（本地记忆 + 用户画像 + 公网信息 + 历史数据）
- 交叉验证不同来源的信息
- 识别信息的可靠性和时效性

## 分析要求

1. **数据收集**: 使用你的所有工具全面收集相关信息
2. **趋势分析**: 基于收集的信息识别关键趋势和模式
3. **风险评估**: 评估潜在风险、不确定性和机会
4. **预测结论**: 给出明确的预测结论和置信度（基于信息质量和数量）
5. **行动建议**: 提供可执行的、个性化的行动建议

## 输出格式

请按以下结构输出你的分析：

### 📋 信息来源总结
- 本地记忆：[列出使用的记忆和知识]
- 用户画像：[总结相关的用户特征]
- 公网信息：[列出搜索到的关键信息来源]
- 历史数据：[说明使用的历史数据]

### 📊 数据分析
[基于收集的信息进行深度分析]

### 📈 趋势判断
[识别的关键趋势和模式]

### ⚠️ 风险因素
[潜在风险和不确定性]

### 🎯 预测结论
[明确的预测结论，包含置信度百分比和依据]

### 💡 行动建议
[可执行的、个性化的行动建议]

---

## 结构化预测 JSON（必须）

在分析完成后，你**必须**在回复末尾输出一个 JSON 代码块，格式如下：

```json
{{
  "probability": 0.75,
  "rationale": "简要总结你的预测理由（1-3句话）",
  "evidence_type": "hard_fact",
  "evidence_text": "支持预测的关键证据摘要",
  "relevance_score": 0.8,
  "source_urls": ["https://example.com/source1"],
  "entity_tags": [{{"text": "关键实体", "type": "topic", "role": "subject"}}]
}}
```

字段说明：
- **probability**: 0.0-1.0 之间的概率值，表示预测为"是/正面"的可能性
- **rationale**: 预测理由的简要总结
- **evidence_type**: "hard_fact"（硬事实）、"soft_signal"（软信号）或 "personal_opinion"（个人观点）
- **evidence_text**: 关键证据的简要描述（可选）
- **relevance_score**: 0.0-1.0 之间的相关性评分
- **source_urls**: 信息来源 URL 列表（可选）
- **entity_tags**: 关键实体标签数组（可选）

**重要提示**: 
1. 请充分使用你的所有工具和能力，不要局限于已有知识。主动搜索、检索、分析，提供最全面和准确的预测。
2. 请使用中文输出所有分析内容。
3. **必须**在回复末尾输出上述 JSON 代码块，这是提交预测到平台所必需的。

请开始你的专业分析。"""

        return prompt

    def _parse_prediction_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """Parse agent response to extract structured prediction data.
        
        First tries to extract a JSON code block (```json ... ```), then
        falls back to heuristic text parsing for probability and rationale.
        """
        try:
            import re
            import json as json_module
            
            # === Strategy 1: Extract JSON code block ===
            json_block_match = re.search(r'```json\s*\n?(.*?)\n?\s*```', response_text, re.DOTALL)
            if json_block_match:
                try:
                    parsed = json_module.loads(json_block_match.group(1).strip())
                    
                    # Validate required fields
                    probability = float(parsed.get("probability", 0.5))
                    probability = max(0.0, min(1.0, probability))
                    
                    rationale = parsed.get("rationale", "")
                    if not rationale:
                        # Try to extract from 预测结论 section as fallback
                        conclusion_match = re.search(r'###\s*🎯\s*预测结论\s*\n(.*?)(?=\n###|\n---|\Z)', response_text, re.DOTALL)
                        rationale = conclusion_match.group(1).strip() if conclusion_match else response_text[:500]
                    
                    result = {
                        "probability": probability,
                        "rationale": rationale,
                        "confidence": probability,  # backward compat
                        "prediction": rationale,     # backward compat
                        "reasoning": response_text,  # full text for logging
                    }
                    
                    # Optional structured signal fields
                    # Map LLM evidence_type to valid platform API types: 'hard_fact' | 'persona_inference'
                    if parsed.get("evidence_type"):
                        ef_type_map = {
                            "hard_fact": "hard_fact",
                            "soft_signal": "persona_inference",
                            "personal_opinion": "persona_inference",
                            "persona_inference": "persona_inference",
                        }
                        mapped = ef_type_map.get(parsed["evidence_type"])
                        if mapped:
                            result["evidence_type"] = mapped
                    if parsed.get("evidence_text"):
                        result["evidence_text"] = str(parsed["evidence_text"])
                    if parsed.get("relevance_score") is not None:
                        result["relevance_score"] = max(0.0, min(1.0, float(parsed["relevance_score"])))
                    if parsed.get("source_urls"):
                        result["source_urls"] = parsed["source_urls"] if isinstance(parsed["source_urls"], list) else [parsed["source_urls"]]
                    if parsed.get("entity_tags"):
                        result["entity_tags"] = parsed["entity_tags"] if isinstance(parsed["entity_tags"], list) else []
                    
                    self.logger.info(f"[AgentOracle] ✅ JSON 解析成功: probability={probability:.2f}")
                    return result
                    
                except (json_module.JSONDecodeError, ValueError, TypeError) as e:
                    self.logger.warning(f"[AgentOracle] JSON 解析失败，回退到文本解析: {e}")
            
            # === Strategy 2: Heuristic text parsing (fallback) ===
            probability = 0.5
            
            confidence_patterns = [
                r'probability["\s:]+\s*(\d+(?:\.\d+)?)',
                r'置信度[：:]\s*(\d+(?:\.\d+)?)\s*%',
                r'confidence[：:]\s*(\d+(?:\.\d+)?)\s*%',
                r'置信度[：:]\s*(\d+(?:\.\d+)?)',
                r'confidence[：:]\s*(\d+(?:\.\d+)?)',
                r'(\d+(?:\.\d+)?)\s*%\s*(?:的概率|可能性|置信度)',
            ]

            for pattern in confidence_patterns:
                match = re.search(pattern, response_text, re.IGNORECASE)
                if match:
                    conf_value = float(match.group(1))
                    if conf_value > 1:
                        probability = conf_value / 100.0
                    else:
                        probability = conf_value
                    break

            probability = max(0.0, min(1.0, probability))

            # Extract prediction conclusion as rationale
            rationale = response_text[:500]
            prediction_match = re.search(r'###\s*🎯\s*预测结论\s*\n(.*?)(?=\n###|\n---|\Z)', response_text, re.DOTALL)
            if prediction_match:
                rationale = prediction_match.group(1).strip()

            self.logger.info(f"[AgentOracle] ⚠️ 使用文本启发式解析: probability={probability:.2f}")
            
            return {
                "probability": probability,
                "rationale": rationale,
                "confidence": probability,  # backward compat
                "prediction": rationale,     # backward compat
                "reasoning": response_text,  # full text for logging
                "evidence_type": "personal_opinion",  # default for heuristic
            }

        except Exception as e:
            self.logger.error(f"[AgentOracle] 解析响应时出错: {e}", exc_info=True)
            return None



def main() -> None:
    """Main entry point for OpenClaw AgentOracle Plugin.
    
    Initializes the plugin manager, loads configuration, starts the background
    daemon, and keeps the main thread alive until interrupted. Handles graceful
    shutdown on SIGINT (Ctrl+C) and SIGTERM signals.
    
    The function registers cleanup handlers to ensure the daemon stops cleanly
    when the program exits, either normally or due to signals.
    
    Execution flow:
    1. Create PluginManager instance
    2. Register cleanup handlers (atexit, signal handlers)
    3. Initialize configuration (load or create)
    4. Start background daemon
    5. Keep main thread alive
    6. Handle shutdown signals gracefully
    
    Raises:
        Exception: Fatal error during initialization or startup that prevents
            the plugin from running. The daemon is stopped before re-raising.
            
    Example:
        $ python -m openclaw_agentoracle_plugin.skill
        [AgentOracle] Configuration loaded and validated successfully
        [AgentOracle] Plugin started
        [AgentOracle] Background daemon started
        [AgentOracle] Plugin is running. Press Ctrl+C to stop.
        [AgentOracle] Checking for new tasks...
        ^C
        [AgentOracle] Received interrupt signal, shutting down...
        [AgentOracle] Background daemon stopped
        [AgentOracle] Plugin stopped
    """
    import atexit
    import signal
    
    # Create plugin manager instance
    manager = PluginManager()
    
    # Register cleanup handler for graceful shutdown
    def cleanup():
        """Cleanup handler called on exit"""
        try:
            manager.stop()
        except Exception as e:
            print(f"[AgentOracle] Error during cleanup: {e}")
    
    # Register atexit handler
    atexit.register(cleanup)
    
    # Register signal handlers for graceful shutdown
    def signal_handler(signum, frame):
        """Handle interrupt signals"""
        print("\n[AgentOracle] Received interrupt signal, shutting down...")
        manager.stop()
        exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Initialize plugin (load or create configuration)
        manager.initialize()
        
        # Start background daemon
        manager.start()
        
        print("[AgentOracle] 插件正在运行。按 Ctrl+C 停止。")  # Plugin is running. Press Ctrl+C to stop.
        
        # Keep main thread alive
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully
        print("\n[AgentOracle] 收到键盘中断，正在关闭...")  # Received keyboard interrupt, shutting down...
        manager.stop()
    except Exception as e:
        # Handle any other exceptions
        print(f"[AgentOracle] 致命错误: {e}")  # Fatal error
        manager.stop()
        raise


if __name__ == "__main__":
    main()
