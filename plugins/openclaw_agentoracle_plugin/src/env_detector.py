"""
Environment Detector for AgentOracle Plugin

This module automatically detects running local LLM services (Ollama, LM Studio, OpenClaw)
and intelligently selects the best available model for prediction tasks.

Goal: Zero-configuration experience - users only need to provide API Key.
"""

import re
import requests
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


@dataclass
class DetectionResult:
    """Result of environment detection"""
    is_ready: bool
    api_base_url: str
    selected_model: str
    provider: str
    all_models: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for easy serialization"""
        return {
            'is_ready': self.is_ready,
            'api_base_url': self.api_base_url,
            'selected_model': self.selected_model,
            'provider': self.provider,
            'all_models': self.all_models
        }


class EnvironmentDetector:
    """Detects and configures local LLM services automatically"""
    
    # Service endpoints to probe
    ENDPOINTS = [
        {
            'name': 'Ollama',
            'probe_url': 'http://127.0.0.1:11434/api/tags',
            'api_base_url': 'http://127.0.0.1:11434',
            'format': 'ollama'
        },
        {
            'name': 'LM Studio',
            'probe_url': 'http://127.0.0.1:1234/v1/models',
            'api_base_url': 'http://127.0.0.1:1234',
            'format': 'openai'
        },
        {
            'name': 'OpenClaw',
            'probe_url': 'http://127.0.0.1:18789/v1/models',
            'api_base_url': 'http://127.0.0.1:18789',
            'format': 'openai'
        }
    ]
    
    # Model selection priority (Tier 1: Best instruction-following models)
    TIER1_PATTERNS = [
        r'llama3',
        r'qwen2\.5',
        r'qwen2',
        r'mistral',
        r'claude'
    ]
    
    # Tier 2: Good models
    TIER2_PATTERNS = [
        r'llama2',
        r'gemma',
        r'mixtral'
    ]
    
    def __init__(self, timeout: int = 2):
        """Initialize detector with timeout setting.
        
        Args:
            timeout: Request timeout in seconds (default: 2)
        """
        self.timeout = timeout
        self.logger = setup_logger()
    
    def auto_detect_environment(self) -> DetectionResult:
        """Main detection function - automatically finds and configures LLM service.
        
        Returns:
            DetectionResult containing configuration information
        """
        self.logger.info("[AgentOracle] 🔍 开始自动探测本地 LLM 服务...")
        
        # Try each endpoint
        for endpoint_config in self.ENDPOINTS:
            result = self._probe_endpoint(endpoint_config)
            if result:
                return result
        
        # No service found
        self.logger.warning("[AgentOracle] ⚠️ 未检测到本地大模型服务")
        self.logger.warning("[AgentOracle] 请确保 Ollama、LM Studio 或 OpenClaw 已启动")
        print("\n" + "="*60)
        print("⚠️  未检测到本地大模型服务")
        print("="*60)
        print("请确保以下服务之一正在运行：")
        print("  • Ollama (http://127.0.0.1:11434)")
        print("  • LM Studio (http://127.0.0.1:1234)")
        print("  • OpenClaw (http://127.0.0.1:18789)")
        print("="*60 + "\n")
        
        return DetectionResult(
            is_ready=False,
            api_base_url='',
            selected_model='',
            provider='',
            all_models=[]
        )
    
    def _probe_endpoint(self, config: Dict[str, str]) -> Optional[DetectionResult]:
        """Probe a single endpoint to check if service is running.
        
        Args:
            config: Endpoint configuration dictionary
            
        Returns:
            DetectionResult if service is found, None otherwise
        """
        try:
            self.logger.debug(f"[AgentOracle] 探测 {config['name']} ({config['probe_url']})...")
            
            response = requests.get(
                config['probe_url'],
                timeout=self.timeout
            )
            
            if response.status_code == 200:
                # Parse models based on format
                models = self._parse_models(response.json(), config['format'])
                
                if not models:
                    self.logger.debug(f"[AgentOracle] {config['name']} 未返回可用模型")
                    return None
                
                # Select best model
                selected_model = self._select_best_model(models)
                
                self.logger.info(f"[AgentOracle] ✅ 检测到 {config['name']}")
                self.logger.info(f"[AgentOracle] 📦 可用模型: {len(models)} 个")
                self.logger.info(f"[AgentOracle] 🎯 已选择: {selected_model}")
                
                print(f"\n✅ 检测到 {config['name']} 服务")
                print(f"📦 发现 {len(models)} 个可用模型")
                print(f"🎯 自动选择: {selected_model}\n")
                
                # Special handling for OpenClaw: check if HTTP API is enabled
                if config['name'] == 'OpenClaw':
                    self._check_openclaw_http_api(config['api_base_url'])
                
                return DetectionResult(
                    is_ready=True,
                    api_base_url=config['api_base_url'],
                    selected_model=selected_model,
                    provider=config['name'],
                    all_models=models
                )
            
        except requests.exceptions.ConnectionError:
            self.logger.debug(f"[AgentOracle] {config['name']} 未运行")
        except requests.exceptions.Timeout:
            self.logger.debug(f"[AgentOracle] {config['name']} 连接超时")
        except Exception as e:
            self.logger.debug(f"[AgentOracle] {config['name']} 探测失败: {e}")
        
        return None
    
    def _parse_models(self, response_data: Dict[str, Any], format_type: str) -> List[str]:
        """Parse model list from API response.
        
        Args:
            response_data: JSON response from API
            format_type: 'ollama' or 'openai'
            
        Returns:
            List of model names
        """
        try:
            if format_type == 'ollama':
                # Ollama format: {"models": [{"name": "llama3:8b"}, ...]}
                if 'models' in response_data:
                    return [model['name'] for model in response_data['models']]
            
            elif format_type == 'openai':
                # OpenAI format: {"data": [{"id": "model-name"}, ...]}
                if 'data' in response_data:
                    return [model['id'] for model in response_data['data']]
            
            self.logger.warning(f"[AgentOracle] 未知的响应格式: {format_type}")
            return []
            
        except (KeyError, TypeError) as e:
            self.logger.error(f"[AgentOracle] 解析模型列表失败: {e}")
            return []
    
    def _select_best_model(self, models: List[str]) -> str:
        """Intelligently select the best model based on instruction-following capability.
        
        Selection priority:
        1. Tier 1: llama3, qwen2.5, qwen2, mistral, claude
        2. Tier 2: llama2, gemma, mixtral
        3. Fallback: First model in list
        
        Args:
            models: List of available model names
            
        Returns:
            Selected model name
        """
        if not models:
            return ''
        
        # Convert all model names to lowercase for matching
        models_lower = [(model, model.lower()) for model in models]
        
        # Try Tier 1 patterns
        for pattern in self.TIER1_PATTERNS:
            for original, lower in models_lower:
                if re.search(pattern, lower):
                    self.logger.debug(f"[AgentOracle] 匹配 Tier 1 模型: {original} (模式: {pattern})")
                    return original
        
        # Try Tier 2 patterns
        for pattern in self.TIER2_PATTERNS:
            for original, lower in models_lower:
                if re.search(pattern, lower):
                    self.logger.debug(f"[AgentOracle] 匹配 Tier 2 模型: {original} (模式: {pattern})")
                    return original
        
        # Fallback to first model
        selected = models[0]
        self.logger.debug(f"[AgentOracle] 使用默认模型（列表第一个）: {selected}")
        return selected
    
    def test_model_connection(self, api_base_url: str, model_name: str) -> bool:
        """Test if the selected model can be accessed.
        
        Args:
            api_base_url: Base URL of the service
            model_name: Model name to test
            
        Returns:
            True if model is accessible, False otherwise
        """
        try:
            # Try a simple test request
            test_url = f"{api_base_url}/v1/chat/completions"
            test_payload = {
                "model": model_name,
                "messages": [{"role": "user", "content": "test"}],
                "max_tokens": 1
            }
            
            response = requests.post(
                test_url,
                json=test_payload,
                timeout=self.timeout
            )
            
            # Accept both 200 and 400 (400 might be due to invalid request format, but service is running)
            if response.status_code in [200, 400]:
                self.logger.info(f"[AgentOracle] ✅ 模型 {model_name} 连接测试成功")
                return True
            
            self.logger.warning(f"[AgentOracle] ⚠️ 模型 {model_name} 连接测试失败: {response.status_code}")
            return False
            
        except Exception as e:
            self.logger.warning(f"[AgentOracle] ⚠️ 模型连接测试异常: {e}")
            return False
    
    def _check_openclaw_http_api(self, api_base_url: str) -> None:
        """Check if OpenClaw HTTP API is enabled and provide guidance if not.
        
        Args:
            api_base_url: OpenClaw API base URL
        """
        try:
            # Try to access the chat completions endpoint
            test_url = f"{api_base_url}/v1/chat/completions"
            test_payload = {
                "model": "openclaw:main",
                "messages": [{"role": "user", "content": "test"}],
                "max_tokens": 1
            }
            
            response = requests.post(
                test_url,
                json=test_payload,
                timeout=self.timeout
            )
            
            # If we get 404, HTTP API is likely disabled
            if response.status_code == 404:
                self._show_openclaw_http_api_warning()
            elif response.status_code in [200, 400, 401]:
                # 200: Success
                # 400: Bad request but API is enabled
                # 401: Auth required but API is enabled
                self.logger.info("[AgentOracle] ✅ OpenClaw HTTP API 已启用")
            
        except requests.exceptions.ConnectionError:
            # Connection error might mean HTTP API is disabled
            self._show_openclaw_http_api_warning()
        except Exception as e:
            self.logger.debug(f"[AgentOracle] OpenClaw HTTP API 检查失败: {e}")
    
    def _show_openclaw_http_api_warning(self) -> None:
        """Show warning message about OpenClaw HTTP API not being enabled."""
        warning_msg = """
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  OpenClaw HTTP API 可能未启用                               ║
╚════════════════════════════════════════════════════════════════╝

OpenClaw 的 HTTP API 默认是禁用的，需要手动启用才能使用。

📝 启用步骤：

1. 打开 OpenClaw 配置文件：
   ~/.openclaw/openclaw.json

2. 添加或修改以下配置：
   {
     "gateway": {
       "http": {
         "endpoints": {
           "chatCompletions": { "enabled": true }
         }
       }
     }
   }

3. 重启 OpenClaw Gateway：
   openclaw gateway

4. 重新运行本插件

📚 详细文档：https://claw-tw.jackle.pro/gateway/openai-http-api

════════════════════════════════════════════════════════════════
"""
        print(warning_msg)
        self.logger.warning("[AgentOracle] ⚠️ OpenClaw HTTP API 可能未启用，请查看上方提示")


def auto_detect_environment() -> DetectionResult:
    """Convenience function for quick detection.
    
    Returns:
        DetectionResult containing configuration
    """
    detector = EnvironmentDetector(timeout=2)
    return detector.auto_detect_environment()


# Test code
if __name__ == '__main__':
    print("="*60)
    print("AgentOracle 环境自动探测测试")
    print("="*60)
    
    result = auto_detect_environment()
    
    print("\n探测结果:")
    print(f"  就绪状态: {result.is_ready}")
    print(f"  服务提供商: {result.provider}")
    print(f"  API 地址: {result.api_base_url}")
    print(f"  选择的模型: {result.selected_model}")
    print(f"  所有可用模型: {result.all_models}")
    print("="*60)
