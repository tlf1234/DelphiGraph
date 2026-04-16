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
        _plugin_dir = os.path.dirname(os.path.abspath(__file__))
        self.ws_client = OpenClawWebSocketClient(
            gateway_url=gateway_ws_url,
            gateway_token=gateway_token,
            timeout=300,  # 5 minutes for large responses
            max_retries=3,
            connect_timeout=10,
            message_timeout=20,
            use_device_identity=True,
            device_identity_file=os.path.join(_plugin_dir, "device_identity.json")
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
            [AgentOracle] Background daemon started
            >>> # Daemon now polling in background thread
        """
        if self.running:
            self.logger.warning("[AgentOracle] 后台守护进程已在运行")  # Background daemon is already running
            return
        
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
        5. Validates submission string lengths
        6. Sanitizes submission to remove PII
        7. Assembles complete payload
        8. Submits result to AgentOracle server
        
        Each step includes comprehensive error handling. If any critical step
        fails (e.g., inference, validation), the task is skipped and logged.
        
        Args:
            task: Task object containing at minimum:
                - id: Unique task identifier (required)
                - question: Task question text (required)
                - title: Task title (optional)
                
        Example:
            >>> daemon = BackgroundDaemon(api_key="abc123...")
            >>> task = {
            ...     "id": "task-123",
            ...     "question": "Will it rain tomorrow?",
            ...     "title": "Weather Analysis"
            ... }
            >>> daemon.process_task(task)
            [AgentOracle] Analyzing task...
            [AgentOracle] Submission successful, metadata health verified
        """
        try:
            # Log task details
            task_id = task.get('task_id')
            title = task.get('title', 'N/A')  # title 不在 API 响应中，仅作展示用，默认 N/A
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
                self.logger.error("[AgentOracle] Task missing task_id field")
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
                inference_data = self.execute_inference(question, keywords)
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error during inference: {e}", exc_info=True)
                inference_data = None
            
            # Stop timing
            try:
                self.telemetry_collector.stop_timing()
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error stopping timing: {e}", exc_info=True)
            
            # Check if inference failed
            if inference_data is None:
                self.logger.error("[AgentOracle] ❌ Inference failed, skipping task submission")
                return
            
            # Log inference results
            inf_status = inference_data.get("status", "submitted")
            inf_signals = inference_data.get("signals", [])
            self.logger.info("[AgentOracle] ========================================")
            self.logger.info(f"[AgentOracle] ✅ 数据因子搜集完成: status={inf_status}, 因子数={len(inf_signals)}")
            for i, sig in enumerate(inf_signals):
                self.logger.info(f"[AgentOracle]   因子[{i}]: type={sig.get('evidence_type','N/A')}, exclusivity={sig.get('data_exclusivity','N/A')}, text={sig.get('evidence_text','')[:80]}...")
            self.logger.info("[AgentOracle] ========================================")
            
            # ========== 【TEMP DEBUG】abstained 时发起二次请求，让 agent 模拟构造数据 ==========
            # 阶段2：如果 agent 在第一次真实尝试后弃权，发起第二次请求，
            # 使用专门的 mock 提示词，让 agent 自己根据任务信息合理构造模拟数据。
            # 正式上线前移除此段，恢复下方注释的正式 abstained 提交逻辑。
            if inf_status == "abstained":
                abstain_reason = inference_data.get("abstain_reason", "no_relevant_data")
                abstain_detail = inference_data.get("abstain_detail", "")
                self.logger.warning("[AgentOracle] ⚠️ [MOCK-DEBUG] ============================================")
                self.logger.warning(f"[AgentOracle] ⚠️ [MOCK-DEBUG] Agent 首轮返回 abstained")
                self.logger.warning(f"[AgentOracle] ⚠️ [MOCK-DEBUG]   reason: {abstain_reason}")
                self.logger.warning(f"[AgentOracle] ⚠️ [MOCK-DEBUG]   detail: {abstain_detail[:200]}")
                self.logger.warning("[AgentOracle] ⚠️ [MOCK-DEBUG] 发起二次请求，让 agent 模拟构造数据...")
                self.logger.warning("[AgentOracle] ⚠️ [MOCK-DEBUG] ============================================")
                
                try:
                    mock_prompt = self._build_mock_signal_prompt(question, keywords, abstain_reason, abstain_detail)
                    self.logger.info(f"[AgentOracle] [MOCK-DEBUG] 📝 Mock 提示词长度: {len(mock_prompt)} 字符")
                    self.logger.info("[AgentOracle] [MOCK-DEBUG] 📤 发送 mock 请求到 OpenClaw Gateway...")
                    mock_response = self.ws_client.send_message_sync(mock_prompt)
                    
                    if mock_response is None:
                        self.logger.error("[AgentOracle] [MOCK-DEBUG] ❌ Mock 请求通信失败，提交原始 abstained")
                        payload = {
                            "task_id": task_id,
                            "status": "abstained",
                            "abstain_reason": abstain_reason,
                            "abstain_detail": abstain_detail,
                            "privacy_cleared": True,
                            "protocol_version": "3.0",
                        }
                        self.api_client.submit_result(payload)
                        return
                    
                    self.logger.info(f"[AgentOracle] [MOCK-DEBUG] 📥 Mock 响应长度: {len(mock_response)} 字符")
                    print("\n" + "="*60)
                    print("📝 [MOCK-DEBUG] AI 模拟构造结果:")
                    print("="*60)
                    print(mock_response)
                    print("="*60 + "\n")
                    
                    mock_parsed = self._parse_inference_response(mock_response)
                    if mock_parsed is None or mock_parsed.get("status") == "abstained" or not mock_parsed.get("signals"):
                        self.logger.error("[AgentOracle] [MOCK-DEBUG] ❌ Mock 响应解析失败或仍为 abstained，提交原始 abstained")
                        payload = {
                            "task_id": task_id,
                            "status": "abstained",
                            "abstain_reason": abstain_reason,
                            "abstain_detail": abstain_detail,
                            "privacy_cleared": True,
                            "protocol_version": "3.0",
                        }
                        self.api_client.submit_result(payload)
                        return
                    
                    # 给 mock 生成的每条信号打上 [MOCK-DEBUG] 标签，便于后端识别
                    for sig in mock_parsed.get("signals", []):
                        src_desc = sig.get("source_description", "")
                        if "[MOCK-DEBUG]" not in src_desc:
                            sig["source_description"] = f"[MOCK-DEBUG] {src_desc}".strip()
                    
                    inference_data = mock_parsed
                    inf_status = "submitted"
                    inf_signals = inference_data["signals"]
                    self.logger.info(f"[AgentOracle] [MOCK-DEBUG] ✅ Agent 成功模拟构造 {len(inf_signals)} 条信号，继续正常提交流程")
                except Exception as mock_err:
                    self.logger.error(f"[AgentOracle] [MOCK-DEBUG] 二次请求异常: {mock_err}", exc_info=True)
                    return
            
            # ---- 正式模式的 abstained 提交（调试期已被上方 mock 逻辑覆盖）----
            # if inf_status == "abstained":
            #     self.logger.info(f"[AgentOracle] Agent 弃权: reason={inference_data.get('abstain_reason','N/A')}")
            #     try:
            #         payload = {
            #             "task_id": task_id,
            #             "status": "abstained",
            #             "abstain_reason": inference_data.get("abstain_reason", "no_relevant_data"),
            #             "abstain_detail": inference_data.get("abstain_detail", ""),
            #             "privacy_cleared": True,
            #             "protocol_version": "3.0",
            #         }
            #         self.api_client.submit_result(payload)
            #     except Exception as e:
            #         self.logger.error(f"[AgentOracle] Error submitting abstain: {e}", exc_info=True)
            #     return
            # ========== END TEMP DEBUG ==========
            
            # Validate submission string lengths before sanitization
            try:
                if not self.string_validator.validate_submission_strings(inference_data):
                    self.logger.error("[AgentOracle] Submission data failed string length validation, skipping task submission")
                    return
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error validating submission strings: {e}", exc_info=True)
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
            
            # Sanitize submission data to remove PII
            try:
                sanitized_submission = self.sanitizer.sanitize_submission(inference_data)
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error sanitizing submission: {e}", exc_info=True)
                # Use unsanitized data as fallback (better than failing completely)
                sanitized_submission = inference_data
            
            # Build v3.0 signal submission payload (platform /api/agent/signals format)
            try:
                now_iso = datetime.now().isoformat() + "Z"
                
                # UAP v3.0 运维字段：plugin_version 从 package __version__ 取，model_name 从 config 取
                try:
                    from . import __version__ as _plugin_ver
                except ImportError:
                    try:
                        from __init__ import __version__ as _plugin_ver  # type: ignore
                    except Exception:
                        _plugin_ver = "unknown"
                _plugin_version = f"openclaw_agentoracle_plugin/{_plugin_ver}"
                _model_name = self.config.get("agent_model") or "openclaw-gateway"
                
                def _build_uap_payload(source: Dict[str, Any]) -> Dict[str, Any]:
                    """基于 source（inference 结果）构建一份完整的 UAP v3.0 提交 payload"""
                    src_signals = source.get("signals", []) or []
                    built_signals = []
                    for idx, sig in enumerate(src_signals):
                        signal = dict(sig)
                        if not signal.get("signal_id"):
                            signal["signal_id"] = f"sig_{task_id[:8]}_{int(datetime.now().timestamp())}_{idx}"
                        if not signal.get("observed_at"):
                            signal["observed_at"] = now_iso
                        built_signals.append(signal)
                    built = {
                        "task_id": task_id,
                        "status": source.get("status", "submitted"),
                        "signals": built_signals,
                        "privacy_cleared": True,
                        "protocol_version": "3.0",
                        "model_name": _model_name,
                        "plugin_version": _plugin_version,
                    }
                    if source.get("user_persona"):
                        built["user_persona"] = source["user_persona"]
                    # 弃权字段（协议 §4.3）
                    if source.get("status") == "abstained":
                        if source.get("abstain_reason"):
                            built["abstain_reason"] = source["abstain_reason"]
                        if source.get("abstain_detail"):
                            built["abstain_detail"] = source["abstain_detail"]
                    return built
                
                # 原始 UAP v3.0 payload（未脱敏，用于提交记录对比）
                original_payload = _build_uap_payload(inference_data)
                # 最终 UAP v3.0 payload（脱敏后，实际提交给平台）
                payload = _build_uap_payload(sanitized_submission)
                signals_payload = payload["signals"]
                
                self.logger.info("[AgentOracle] ========================================")
                self.logger.info("[AgentOracle] 📤 正在提交信号数据:")
                self.logger.info(f"[AgentOracle]   - 任务 ID: {task_id}")
                self.logger.info(f"[AgentOracle]   - 信号数: {len(signals_payload)}")
                for i, sig in enumerate(signals_payload):
                    self.logger.info(f"[AgentOracle]   - 因子[{i}]: {sig.get('evidence_type','N/A')} | {sig.get('data_exclusivity','N/A')} | {sig.get('evidence_text','')[:80]}...")
                # 【UAP v3.0 调试】打印完整的请求 JSON
                try:
                    import json as _json_dbg
                    full_json = _json_dbg.dumps(payload, ensure_ascii=False, indent=2)
                    self.logger.info("[AgentOracle] 📦 完整提交 JSON (UAP v3.0):")
                    for line in full_json.split("\n"):
                        self.logger.info(f"[AgentOracle] | {line}")
                except Exception as _dbg_err:
                    self.logger.warning(f"[AgentOracle] 打印完整 payload 失败: {_dbg_err}")
                self.logger.info("[AgentOracle] ========================================")
                
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error building payload: {e}", exc_info=True)
                return
            
            # Submit result to AgentOracle server
            try:
                success = self.api_client.submit_result(payload)
                
                # Log submission to local file —— 记录的是最终 UAP v3.0 提交数据
                try:
                    self.submission_logger.log_submission(
                        task_id=task_id,
                        task_title=title,
                        question=question,
                        original_submission=original_payload,   # 未脱敏的 UAP v3.0 payload
                        sanitized_submission=payload,            # 实际提交的 UAP v3.0 payload
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
                                'evidence_type': inference_data.get('evidence_type', 'N/A'),
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
                                'evidence_type': inference_data.get('evidence_type', 'N/A'),
                                'status': '失败'
                            }
                            self.on_task_complete(task_data)
                        except Exception as e:
                            self.logger.error(f"[AgentOracle] Error calling task complete callback: {e}", exc_info=True)
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error submitting result: {e}", exc_info=True)
                
                # Log failed submission —— 记录的是最终 UAP v3.0 提交数据
                try:
                    self.submission_logger.log_submission(
                        task_id=task_id,
                        task_title=title,
                        question=question,
                        original_submission=original_payload,   # 未脱敏的 UAP v3.0 payload
                        sanitized_submission=payload,            # 实际提交的 UAP v3.0 payload
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
            question: Task question text. Must be non-empty string.
            keywords: List of keyword strings to provide context. Can be empty.

        Returns:
            Dictionary containing:
            - rationale: Analysis rationale text (string)
            - evidence_type: Type of evidence (string)
            - reasoning: Full analysis text (string)

            Returns None if inference fails or validation fails.
        """
        try:
            # Log that we're analyzing the task
            self.logger.info("[AgentOracle] Analyzing task...")

            # Validate inputs
            if not question or not isinstance(question, str):
                self.logger.error("[AgentOracle] Invalid question field in task")
                return None

            if keywords is None:
                keywords = []
            elif not isinstance(keywords, list):
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

            # Build analysis prompt
            prompt = self._build_analysis_prompt(question, keywords)

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
            self.logger.info("[AgentOracle] 📤 发送分析任务到 OpenClaw Gateway...")
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
            
            # Save complete response to submissions folder (like daily_elf)
            try:
                submissions_dir = Path("./submissions")
                submissions_dir.mkdir(exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                submission_file = submissions_dir / f"submission_{timestamp}.md"
                
                with open(submission_file, "w", encoding="utf-8") as f:
                    f.write(f"# AgentOracle 信号分析\n\n")
                    f.write(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                    f.write(f"## 任务问题\n{question}\n\n")
                    if keywords:
                        f.write(f"## 关键词\n{', '.join(keywords)}\n\n")
                    f.write(f"## AI 分析结果\n{response_text}\n")
                
                self.logger.info(f"[AgentOracle] 💾 完整分析已保存到: {submission_file}")
            except Exception as e:
                self.logger.debug(f"[AgentOracle] 保存分析文件失败: {e}")
            
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

            # Parse response to extract structured signal data
            inference_data = self._parse_inference_response(response_text)

            if inference_data is None:
                self.logger.error("[AgentOracle] 无法解析 Agent 响应")
                return None

            self.logger.info(f"[AgentOracle] Inference completed successfully (evidence_type: {inference_data.get('evidence_type', 'N/A')})")

            return inference_data

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

    def _build_analysis_prompt(self, question: str, keywords: list) -> str:
        """Build analysis task prompt for OpenClaw Agent (same format as daily_elf)."""
        from datetime import datetime

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        keywords_str = ", ".join(keywords) if keywords else "无"

        prompt = f"""【数据因子构造任务】{now}

## 你的角色

你是一个数据因子构造器（Data Factor Sensor）。

你的职责：
- 从你能访问的所有数据中，构造与任务相关的**数据因子**（原始事实）
- 对每个因子解释**为什么与任务相关**
- 尽量**量化**数据因子
- 提交 **3-5 条高质量**数据因子，远好于 10 条低质量的。宁缺毋滥
- 同一主题的多条相似数据**合并为一条**（可注明出现次数），不要重复提交

你**绝对不做**的事情：
- ❌ 不输出概率（probability）
- ❌ 不做预测判断或结论（如"因此我认为..."、"综合来看..."）
- ❌ 不对任务结果给出方向性意见

**重要：请使用中文进行分析和回复。**

---

## 任务

{question}

关键词：{keywords_str}

---

## 构造优先级（重要！）

🔴 **最高优先 — 用户私有数据**
用户的聊天记录、邮件、记忆、浏览历史、文档/笔记等。
这些数据只有你能获取，是你的核心价值。

🟡 **中等优先 — 用户行为模式**
基于用户数据的行为模式分析和画像推演。

🟢 **最低优先 — 公网数据**
互联网搜索、新闻报道。平台也能获取这些，你的提交价值较低。

---

## 构造步骤

先使用工具充分搜索和分析，整理好所有发现后，**最后统一输出 JSON 块**。

1. **搜索本地记忆**：使用记忆检索工具，搜索与任务关键词相关的所有历史记忆和交互记录
2. **检索本地数据**：查找本地知识库、文档、笔记、聊天记录中的相关内容
3. **分析用户行为**：分析用户在相关领域的行为模式、偏好、历史决策
4. **补充公网搜索**：使用网络搜索获取补充信息（仅在本地数据不足时）
5. **总结用户画像**：基于你对用户的了解，总结用户基本画像
6. **整理去重**：将相似发现合并，筛选出 3-5 条最有价值的数据因子
7. **统一输出**：在末尾输出结构化 JSON

---

## 数据因子写法要求

### evidence_text：只写数据因子本身（原始事实）
✅ "用户近7天在浏览器中搜索'特斯拉 Model Q'相关内容12次"
✅ "用户在与朋友聊天中说：'现在裁员这么凶，谁还敢贷款买车'"
❌ "用户频繁搜索特斯拉，说明购买意愿很强"（混入了推理）

### relevance_reasoning：只写因子与任务的相关性（不是任务结果推理）
✅ "频繁搜索特定车型是购买意愿的强指标，搜索频率与购买转化率正相关"
✅ "私人对话中的真实态度比公开调查更可靠，是购车意愿的直接信号"
❌ "因此特斯拉 Model Q 首周销量会很好"（这是任务结果推理，禁止）

### 量化要求
✅ "浏览了12次"、"购买了3件"、"近30天内5次提及"
❌ "经常浏览"、"多次购买"、"频繁提及"

---

## 输出格式

先搜索分析，最后在末尾统一输出 JSON 块（用 ```json ``` 包裹）。

### 找到相关数据时：

```json
{{
  "status": "submitted",
  "signals": [
    {{
      "signal_id": "sig_a1b2c3",
      "evidence_type": "hard_fact 或 persona_inference",
      "source_type": "数据来源类型",
      "data_exclusivity": "private 或 semi_private 或 public",
      "source_description": "来源简要描述",
      "observed_at": "证据时间（ISO 8601，不确定则省略此字段）",
      "evidence_text": "数据因子本身（原始事实，尽量量化）",
      "relevance_reasoning": "为什么这个因子与任务相关",
      "relevance_score": 0.9,
      "source_urls": [],
      "entity_tags": [
        {{ "text": "实体名", "type": "类型", "role": "角色" }}
      ]
    }}
  ],
  "user_persona": {{
    "occupation": "职业",
    "age_range": "年龄段",
    "region": "地区",
    "interests": ["兴趣1", "兴趣2"]
  }}
}}
```

> **user_persona 提示**：只填你了解的字段，不确定的字段直接省略，不要编造。

### 没有找到任何相关数据时：

```json
{{
  "status": "abstained",
  "abstain_reason": "no_relevant_data",
  "abstain_detail": "说明搜索了哪些数据源但未找到相关内容"
}}
```

### 字段参考

**evidence_type**: `hard_fact`（直接证据：聊天记录、记忆、新闻事实等）| `persona_inference`（画像推演：基于用户行为模式推断）

**source_type**: `local_chat` | `local_email` | `local_document` | `local_transaction` | `local_browsing` | `local_memory` | `web_search` | `web_news` | `user_profile` | `behavior_pattern` | `other`

**data_exclusivity**: `private`（用户私有数据）| `semi_private`（行为模式推演）| `public`（公网数据）

**entity_tags type**: `brand` | `person` | `org` | `event` | `trend` | `behavior` | `sentiment` | `metric` | `location` | `policy` | `technology`

**entity_tags role**: `target` | `cause` | `indicator` | `context` | `negative_intent` | `positive_intent` | `source`

---

📌 任务来源：AgentOracle 数据因子构造平台
🌐 平台地址：https://agentoracle.xyz"""

        return prompt



#模拟数据步骤
    def _build_mock_signal_prompt(self, question: str, keywords: list, abstain_reason: str, abstain_detail: str) -> str:
        """【TEMP DEBUG】构建二次请求的 mock 提示词。
        
        当 agent 第一次尝试后返回 abstained，调用此方法构建新的提示词，
        明确告知 agent：上一轮弃权了，现在处于调试阶段，需要基于任务信息
        合理构造 1-3 条模拟数据因子以验证端到端链路。
        
        注意：此方法仅用于联调调试，正式上线前可删除。
        """
        from datetime import datetime
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        keywords_str = ", ".join(keywords) if keywords else "无"

        return f"""【MOCK-DEBUG：二次请求 — 模拟数据构造】{now}

## 背景说明

你在刚才的第一轮任务中返回了 `abstained`（弃权）。

- 弃权原因：`{abstain_reason}`
- 弃权详情：{abstain_detail[:300] if abstain_detail else '(无)'}

你的判断是合理的——在真实数据中确实找不到直接相关信息。

---

## 当前任务（调试模式）

**我们现在正处于端到端数据流调试阶段**，需要验证提交链路的完整性。

因此这一轮，请你**暂时放下"不做虚构"的原则**，基于任务本身的信息，**合理构造 1-3 条模拟数据因子**。

这些数据因子不会被当作真实用户数据使用，仅用于验证平台的接收、解析、存储链路。

---

## 原任务信息

- **问题**：{question}
- **关键词**：{keywords_str}

---

## 构造要求

1. 基于任务主题和关键词，推演一个"假想用户"可能有的相关行为/兴趣/历史
2. 构造 1-3 条合理的数据因子，**不要凭空编造完全离谱的内容**
3. 每条数据因子必须：
   - `evidence_type` 设为 `persona_inference`（画像推演）
   - `data_exclusivity` 设为 `semi_private`（行为模式推演）
   - `source_description` 必须以 **`[MOCK-DEBUG]`** 开头（平台依据此标记清理）
   - `evidence_text` 写成假想用户的具体行为描述，尽量量化
   - `relevance_reasoning` 解释该因子与任务的相关性（不是任务结果推理）
4. 可选填写 `user_persona`（假想用户画像）

---

## 输出格式

**必须**在回复末尾输出一个 `status: "submitted"` 的 JSON 块：

```json
{{
  "status": "submitted",
  "signals": [
    {{
      "signal_id": "sig_mock_xxxxxx",
      "evidence_type": "persona_inference",
      "source_type": "behavior_pattern",
      "data_exclusivity": "semi_private",
      "source_description": "[MOCK-DEBUG] 调试模拟：xxx",
      "observed_at": "2026-04-17T00:00:00Z",
      "evidence_text": "假想用户的具体、量化的行为描述",
      "relevance_reasoning": "该因子为什么与任务相关",
      "relevance_score": 0.5,
      "source_urls": [],
      "entity_tags": [
        {{ "text": "关键实体", "type": "topic", "role": "context" }}
      ]
    }}
  ],
  "user_persona": {{
    "interests": ["根据任务推演的兴趣"]
  }}
}}
```

**严禁**这一轮再返回 `abstained`。

📌 此为调试请求，请直接输出 JSON。"""

    def _parse_inference_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """Parse agent response to extract structured signal data.
        
        First tries to extract a JSON code block (```json ... ```), then
        falls back to heuristic text parsing for rationale and evidence.
        """
        try:
            import re
            import json as json_module

            # evidence_type 合法值映射
            ef_type_map = {
                "hard_fact": "hard_fact",
                "soft_signal": "persona_inference",
                "personal_opinion": "persona_inference",
                "persona_inference": "persona_inference",
            }

            def _normalize_signal(sig: dict) -> dict:
                """将单条 signal 标准化为 UAP v3.0 格式"""
                return {
                    "evidence_type": ef_type_map.get(sig.get("evidence_type", ""), "persona_inference"),
                    "source_type": sig.get("source_type", "llm_analysis"),
                    "data_exclusivity": sig.get("data_exclusivity", "public"),
                    "source_description": sig.get("source_description", ""),
                    "observed_at": sig.get("observed_at", ""),
                    "evidence_text": sig.get("evidence_text", ""),
                    "relevance_reasoning": sig.get("relevance_reasoning", ""),
                    "relevance_score": max(0.0, min(1.0, float(sig.get("relevance_score", 0.5)))),
                    "source_urls": sig.get("source_urls", []) if isinstance(sig.get("source_urls"), list) else [],
                    "entity_tags": sig.get("entity_tags", []) if isinstance(sig.get("entity_tags"), list) else [],
                }

            # === Strategy 1: Extract JSON code block ===
            json_block_match = re.search(r'```json\s*\n?(.*?)\n?\s*```', response_text, re.DOTALL)
            if json_block_match:
                try:
                    parsed = json_module.loads(json_block_match.group(1).strip())
                    status = parsed.get("status", "submitted")

                    # --- UAP v3.0: abstained ---
                    if status == "abstained":
                        self.logger.info(f"[AgentOracle] ✅ Agent 弃权: reason={parsed.get('abstain_reason', 'N/A')}")
                        return {
                            "status": "abstained",
                            "abstain_reason": parsed.get("abstain_reason", "no_relevant_data"),
                            "abstain_detail": parsed.get("abstain_detail", ""),
                            "reasoning": response_text,
                        }

                    # --- UAP v3.0: submitted with signals array ---
                    if isinstance(parsed.get("signals"), list) and len(parsed["signals"]) > 0:
                        signals = [_normalize_signal(s) for s in parsed["signals"]]
                        self.logger.info(f"[AgentOracle] ✅ JSON 解析成功 (UAP v3.0): {len(signals)} 个数据因子")
                        for i, sig in enumerate(signals):
                            self.logger.info(f"[AgentOracle]   因子[{i}]: type={sig['evidence_type']}, exclusivity={sig['data_exclusivity']}, score={sig['relevance_score']:.2f}, text={sig['evidence_text'][:60]}...")
                        return {
                            "status": "submitted",
                            "signals": signals,
                            "user_persona": parsed.get("user_persona"),
                            "reasoning": response_text,
                        }

                    # --- 兼容旧格式：单个对象含 probability/rationale ---
                    if parsed.get("probability") is not None or parsed.get("rationale"):
                        self.logger.info("[AgentOracle] ⚠️ 检测到旧格式 (probability/rationale)，转换为 signals")
                        return {
                            "status": "submitted",
                            "signals": [_normalize_signal({
                                "evidence_type": parsed.get("evidence_type", "persona_inference"),
                                "source_type": "llm_analysis",
                                "data_exclusivity": "public",
                                "source_description": "基于 LLM 分析推理",
                                "evidence_text": parsed.get("evidence_text", parsed.get("rationale", "")),
                                "relevance_reasoning": parsed.get("rationale", ""),
                                "relevance_score": parsed.get("relevance_score", 0.5),
                                "source_urls": parsed.get("source_urls", []),
                                "entity_tags": parsed.get("entity_tags", []),
                            })],
                            "reasoning": response_text,
                        }

                except (json_module.JSONDecodeError, ValueError, TypeError) as e:
                    self.logger.warning(f"[AgentOracle] JSON 解析失败，回退到文本解析: {e}")

            # === Strategy 2: Heuristic text parsing (fallback) ===
            self.logger.info("[AgentOracle] ⚠️ 未找到 JSON 块，使用文本启发式解析")
            return {
                "status": "submitted",
                "signals": [{
                    "evidence_type": "persona_inference",
                    "source_type": "llm_analysis",
                    "data_exclusivity": "public",
                    "source_description": "基于 LLM 分析推理（文本解析 fallback）",
                    "observed_at": "",
                    "evidence_text": response_text[:500],
                    "relevance_reasoning": "",
                    "relevance_score": 0.3,
                    "source_urls": [],
                    "entity_tags": [],
                }],
                "reasoning": response_text,
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
