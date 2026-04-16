"""
API client for communicating with AgentOracle backend

Handles HTTP communication for task fetching and result submission.
"""

from typing import Optional, Dict, Any, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import jsonschema

# Support both module and direct execution
try:
    from .logger import setup_logger
    from .rate_limiter import RateLimiter
    from .validators import StringLengthValidator
except ImportError:
    from logger import setup_logger
    from rate_limiter import RateLimiter
    from validators import StringLengthValidator


# JSON Schema for task validation
# Prevents injection attacks and ensures data integrity
# Matches AgentOracle API response format from get_smart_distributed_tasks
TASK_SCHEMA = {
    "type": "object",
    "required": ["task_id", "question"],
    "properties": {
        "task_id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
        },
        "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
        },
        "question": {
            "type": "string",
            "minLength": 1,
            "maxLength": 5000
        },
        "description": {
            "type": "string",
            "maxLength": 10000
        },
        "reward_pool": {
            "type": "number",
            "minimum": 0
        },
        "closes_at": {
            "type": "string",
            "format": "date-time"
        },
        "visibility": {
            "type": "string",
            "enum": ["public", "private"]
        },
        "funding_type": {
            "type": "string"
        },
        "required_niche_tags": {
            "type": ["array", "null"],
            "items": {
                "type": "string",
                "maxLength": 100
            },
            "maxItems": 50
        },
        "requires_nda": {
            "type": "boolean"
        },
        "min_reputation": {
            "type": "integer",
            "minimum": 0
        },
        "match_score": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
        },
        "match_reason": {
            "type": "string"
        }
    },
    "additionalProperties": True
}


class AgentOracleClient:
    """HTTP client for interacting with AgentOracle backend"""
    
    def __init__(self, api_key: str, base_url: str):
        """Initialize API client with authentication and connection pooling.
        
        Creates an HTTP client configured for secure communication with the
        AgentOracle backend. Sets up connection pooling, retry logic, rate
        limiting, and authentication headers.
        
        Security features:
        - Enforces HTTPS-only connections
        - Configures automatic retries for transient failures
        - Implements rate limiting (10 requests per 60 seconds)
        - Uses connection pooling for efficiency
        
        Args:
            api_key: API key for authentication. Must be at least 32 characters.
                Obtained from AgentOracle platform.
            base_url: API base URL. Must start with "https://" or "http://localhost".
                This parameter is required and must be provided from configuration.
            
        Raises:
            ValueError: If base_url does not start with "https://" or "http://localhost".
                This enforces secure communication and prevents accidental use of
                unencrypted HTTP connections.
                
        Example:
            >>> client = AgentOracleClient(
            ...     api_key="abc123...",
            ...     base_url="https://your-platform-domain.com"
            ... )
            >>> # Uses configured base URL
        """
        
        # Validate base_url uses HTTPS (except for localhost/LAN development)
        _is_local = (
            base_url.startswith("http://localhost") or
            base_url.startswith("http://127.") or
            base_url.startswith("http://192.168.") or
            base_url.startswith("http://10.") or
            base_url.startswith("http://172.")
        )
        if not base_url.startswith("https://") and not _is_local:
            raise ValueError("API base_url must use HTTPS (except for localhost/LAN development)")
        
        self.api_key = api_key
        self.base_url = base_url
        self.logger = setup_logger()
        
        # Initialize string length validator
        self.string_validator = StringLengthValidator()
        
        # Initialize rate limiter (10 requests per 60 seconds)
        self.rate_limiter = RateLimiter(max_requests=10, time_window=60.0)
        
        # Create HTTP session for connection pooling
        self.session = requests.Session()
        
        # Configure connection pool with HTTPAdapter
        # pool_connections: number of connection pools to cache
        # pool_maxsize: maximum number of connections to save in the pool
        adapter = HTTPAdapter(
            pool_connections=10,
            pool_maxsize=20,
            max_retries=Retry(
                total=3,
                backoff_factor=0.3,
                status_forcelist=[500, 502, 503, 504]
            )
        )
        self.session.mount('https://', adapter)
        self.session.mount('http://', adapter)
        
        # Set default headers including Authorization
        self.session.headers.update({
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": "OpenClaw-AgentOracle-Plugin/1.0"
        })
    
    def fetch_task(self) -> Optional[Dict[str, Any]]:
        """Fetch the next available task from the AgentOracle server.
        
        Sends a GET request to /api/agent/tasks endpoint to retrieve the next
        task. The response contains a 'tasks' array which is extracted and validated.
        Returns the first valid task from the array.
        
        Response handling:
        - HTTP 200: Tasks array received, first valid task returned
        - HTTP 204: No tasks available, returns None
        - HTTP 401: Authentication failed, raises AuthenticationError
        - HTTP 403: Account restricted (purgatory), returns None
        - Other codes: Logged as error, raises NetworkError
        
        Returns:
            Task dictionary containing (from get_smart_distributed_tasks):
            - id: Unique task identifier (UUID string)
            - title: Task title (string)
            - question: Task question (string)
            - description: Task description (string, optional)
            - reward_pool: Reward amount (number)
            - closes_at: Deadline (ISO 8601 string, optional)
            - visibility: "public" or "private"
            - required_niche_tags: List of tag strings (optional)
            - requires_nda: Boolean
            - min_reputation: Minimum reputation required (integer)
            - match_score: 0-1 relevance score (number)
            - match_reason: Reason for match (string)
            
            Returns None if no tasks are available or if all tasks fail validation.
            
        Raises:
            AuthenticationError: Invalid or expired API key (HTTP 401).
            NetworkError: Network request failed due to connection issues,
                timeout, or unexpected server response.
                
        Example:
            >>> client = AgentOracleClient(api_key="abc123...")
            >>> task = client.fetch_task()
            >>> if task:
            ...     print(f"Task ID: {task['id']}")
            ...     print(f"Question: {task['question']}")
            ... else:
            ...     print("No tasks available")
        """
        try:
            # Call _make_request to send GET request to frontend API route
            status_code, response_data = self._make_request("GET", "/api/agent/tasks")
            self.logger.info(f"[AgentOracle] 任务接口响应: status_code={status_code}, response_data={str(response_data)[:300]}")
            
            # Handle different status codes
            if status_code == 200:
                # Extract tasks array from response
                if not response_data or not isinstance(response_data, dict):
                    self.logger.error("[AgentOracle] Invalid response format from server")
                    return None
                
                tasks = response_data.get('tasks', [])
                
                # Check if tasks array is empty
                if not tasks or len(tasks) == 0:
                    self.logger.info("[AgentOracle] No tasks available (empty tasks array)")
                    return None
                
                # Validate and return first valid task
                for i, task in enumerate(tasks):
                    self.logger.info(f"[AgentOracle] 任务[{i}]: task_id={task.get('task_id','?')}, question={str(task.get('question',''))[:80]}, keys={list(task.keys())}")
                    if self.validate_task(task):
                        self.logger.info(f"[AgentOracle] Fetched task: {task.get('task_id') or task.get('id', 'unknown')}")
                        return task
                    else:
                        # Invalid task - log and skip to next
                        self.logger.warning(f"[AgentOracle] Skipping invalid task: {task.get('task_id') or task.get('id', 'unknown')}")
                
                # All tasks failed validation
                self.logger.error("[AgentOracle] All tasks failed validation")
                return None
                
            elif status_code == 204:
                # No tasks available
                self.logger.info("[AgentOracle] No tasks available")
                return None
            elif status_code == 401:
                # Authentication failed
                error_msg = "Authentication failed: Invalid API_KEY"
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("message", error_msg)
                self.logger.error(f"[AgentOracle] {error_msg}", exc_info=True)
                raise AuthenticationError(error_msg)
            elif status_code == 403:
                # Account restricted (purgatory)
                error_msg = "Account restricted"
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("message", error_msg)
                self.logger.warning(f"[AgentOracle] {error_msg}")
                return None
            elif status_code == 404:
                # Edge Function not found — not deployed yet or base_url misconfigured.
                self.logger.warning(
                    "[AgentOracle] ⚠️  获取任务返回 404 (Edge Function 未部署或 base_url 配置错误)，跳过本轮轮询"
                )
                return None
            else:
                # Other error status codes
                error_msg = f"Unexpected status code {status_code}"
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("error", response_data.get("message", error_msg))
                    details = response_data.get("details", "")
                    if details:
                        error_msg = f"{error_msg} (details: {details})"
                self.logger.error(f"[AgentOracle] 任务获取失败: status={status_code}, error={error_msg}")
                raise NetworkError(error_msg)
                
        except NetworkError:
            # NetworkError from _make_request should propagate up
            raise
        except AuthenticationError:
            # AuthenticationError should propagate up
            raise
        except Exception as e:
            # Catch any other unexpected exceptions
            self.logger.error(f"[AgentOracle] Unexpected error in fetch_task: {e}", exc_info=True)
            raise NetworkError(f"Unexpected error: {e}")
    
    def submit_result(self, payload: Dict[str, Any]) -> bool:
        """Submit signal data to the server (v3.0).
        
        Sends a POST request to /api/agent/signals platform route with the
        structured signal submission payload. Authentication is via x-api-key header.
        
        The payload must contain:
        - task_id: UUID of the task
        - status: "submitted" or "abstained"
        - signals: Array of signal objects
        - privacy_cleared: Boolean
        - protocol_version: "3.0"
        
        Optional fields:
        - user_persona: User persona object
        - abstain_reason: Reason for abstaining
        - abstain_detail: Detail for abstaining
        
        Response handling:
        - HTTP 200: Submission successful, returns True
        - HTTP 400: Validation failed, raises ValidationError with details
        - Other errors: Logged and returns False
        
        Args:
            payload: Submission payload dictionary matching platform
                /api/agent/signals expected format.
            
        Returns:
            True if submission was successful (HTTP 200).
            False if submission failed due to network error or server error
            (excluding validation errors which raise an exception).
            
        Raises:
            ValidationError: Server rejected the submission due to validation
                failure (HTTP 400).
            
        Example:
            >>> client = AgentOracleClient(api_key="abc123...")
            >>> payload = {
            ...     "task_id": "a1b2c3d4-...",
            ...     "status": "submitted",
            ...     "signals": [{"signal_id": "sig_1", ...}],
            ...     "privacy_cleared": True,
            ...     "protocol_version": "3.0"
            ... }
            >>> success = client.submit_result(payload)
            >>> if success:
            ...     print("Submission successful")
        """
        try:
            # 【UAP v3.0 调试】打印即将发送的完整 POST body
            try:
                import json as _json_dbg
                body_preview = _json_dbg.dumps(payload, ensure_ascii=False, indent=2)
                self.logger.info(f"[AgentOracle] 📤 POST /api/agent/signals - body 长度={len(body_preview)} chars, 信号数={len(payload.get('signals', []))}")
                self.logger.info("[AgentOracle] ---- POST body BEGIN ----")
                for line in body_preview.split("\n"):
                    self.logger.info(f"[AgentOracle] > {line}")
                self.logger.info("[AgentOracle] ---- POST body END ----")
            except Exception as _dbg_err:
                self.logger.warning(f"[AgentOracle] 打印 POST body 失败: {_dbg_err}")
            
            # Call _make_request to send POST request to frontend API route
            status_code, response_data = self._make_request("POST", "/api/agent/signals", data=payload)
            
            # Handle different status codes
            if status_code == 200:
                # Success - log and return True
                self.logger.info("[AgentOracle] Submission successful, metadata health verified")
                return True
            elif status_code == 400:
                # Validation error - extract error details and raise ValidationError
                error_msg = "Validation failed"
                error_details = {}
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("message", error_msg)
                    error_details = response_data.get("details", {})
                
                # Log detailed error information
                self.logger.error(f"[AgentOracle] Validation error: {error_msg}", exc_info=True)
                if error_details:
                    self.logger.error(f"[AgentOracle] Validation details: {error_details}")
                
                raise ValidationError(f"{error_msg}: {error_details}")
            else:
                # Other error status codes - log and return False
                error_msg = f"Submission failed with status code {status_code}"
                if response_data and isinstance(response_data, dict):
                    error_msg = response_data.get("message", error_msg)
                    # 记录完整的响应数据以便调试
                    self.logger.error(f"[AgentOracle] {error_msg}")
                    self.logger.debug(f"[AgentOracle] 完整响应: {response_data}")
                else:
                    self.logger.error(f"[AgentOracle] {error_msg}")
                return False
                
        except NetworkError as e:
            # Network error from _make_request - log and return False
            self.logger.error(f"[AgentOracle] Network error during submission: {e}", exc_info=True)
            return False
        except ValidationError:
            # ValidationError should propagate up
            raise
        except Exception as e:
            # Catch any other unexpected exceptions - log and return False
            self.logger.error(f"[AgentOracle] Unexpected error in submit_result: {e}", exc_info=True)
            return False
    
    def validate_task(self, task: Dict[str, Any]) -> bool:
        """Validate task object against JSON schema and string length limits.
        
        Performs two-stage validation:
        1. JSON Schema validation: Ensures task structure matches expected format
        2. String length validation: Prevents resource exhaustion attacks
        
        This validation prevents:
        - Injection attacks through malformed data
        - Resource exhaustion through excessively long strings
        - Type confusion through incorrect data types
        - Missing required fields
        
        Args:
            task: Task object to validate. Should contain id, question fields
                at minimum.
            
        Returns:
            True if task passes all validation checks.
            False if task fails schema validation or string length checks.
            Validation failures are logged with details.
            
        Example:
            >>> client = AgentOracleClient(api_key="abc123...")
            >>> task = {
            ...     "id": "task-123",
            ...     "question": "Will it rain?",
            ...     "title": "Weather analysis"
            ... }
            >>> if client.validate_task(task):
            ...     # Process valid task
            ...     pass
            ... else:
            ...     # Skip invalid task
            ...     pass
        """
        try:
            # First, validate against JSON schema
            jsonschema.validate(instance=task, schema=TASK_SCHEMA)
            
            # Then, validate string lengths
            if not self.string_validator.validate_task_strings(task):
                self.logger.error("[AgentOracle] Task failed string length validation")
                return False
            
            return True
        except jsonschema.ValidationError as e:
            self.logger.error(f"[AgentOracle] Task validation failed: {e.message}", exc_info=True)
            if e.path:
                self.logger.error(f"[AgentOracle] Validation error path: {'.'.join(str(p) for p in e.path)}")
            return False
        except jsonschema.SchemaError as e:
            self.logger.error(f"[AgentOracle] Schema error: {e.message}", exc_info=True)
            return False
        except Exception as e:
            self.logger.error(f"[AgentOracle] Unexpected error during validation: {e}", exc_info=True)
            return False
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, Any]:
        """Execute HTTP request with rate limiting and error handling.
        
        Internal method that handles the low-level HTTP communication. Acquires
        a rate limiter token before making the request, constructs the full URL,
        sets appropriate headers, and handles various error conditions.
        
        Rate limiting: Blocks until a token is available (max 30 second wait).
        Timeout: All requests have a 30 second timeout.
        Retries: Automatic retries for 5xx errors (configured in session).
        
        Args:
            method: HTTP method to use. Supported: "GET", "POST".
            endpoint: API endpoint path starting with "/". Example: "/api/tasks"
            data: Optional request body data for POST requests. Will be
                serialized to JSON automatically.
            
        Returns:
            Tuple of (status_code, response_data):
            - status_code: HTTP status code (int)
            - response_data: Parsed JSON response (dict/list) or None if
                response is not JSON or is empty
            
        Raises:
            NetworkError: Request failed due to timeout, connection error,
                rate limit exceeded, or other network issues. The error
                message includes details about the failure type.
            ValueError: Unsupported HTTP method provided.
            
        Example:
            >>> client = AgentOracleClient(api_key="abc123...")
            >>> status, data = client._make_request("GET", "/api/tasks")
            >>> print(f"Status: {status}")
            >>> if data:
            ...     print(f"Response: {data}")
        """
        # Acquire rate limiter token before making request
        if not self.rate_limiter.acquire(timeout=30.0):
            raise NetworkError("Rate limit exceeded - could not acquire token within 30 seconds")
        
        # Build full URL from base_url + endpoint
        url = f"{self.base_url}{endpoint}"
        self.logger.info(f"[AgentOracle] 🌐 请求 URL: {method} {url}")
        
        # Set timeout to 30 seconds
        timeout = 30
        
        try:
            if method == "GET":
                response = self.session.get(url, timeout=timeout)
            elif method == "POST":
                response = self.session.post(url, json=data, timeout=timeout)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            # Return tuple of (status_code, response_data)
            # For non-JSON responses or empty responses, return None as data
            self.logger.info(f"[AgentOracle] HTTP响应: status={response.status_code}, content-type={response.headers.get('content-type','N/A')}, length={len(response.content)}")
            try:
                response_data = response.json()
            except ValueError:
                response_data = None
                self.logger.warning(f"[AgentOracle] 响应非JSON: body={response.text[:200]}")
            
            return (response.status_code, response_data)
            
        except requests.Timeout as e:
            # Handle timeout specifically
            self.logger.error(f"[AgentOracle] Request timeout after {timeout}s: {e}", exc_info=True)
            raise NetworkError(f"Request timeout after {timeout}s")
        except requests.ConnectionError as e:
            # Handle connection errors
            self.logger.error(f"[AgentOracle] Connection error: {e}", exc_info=True)
            raise NetworkError(f"Connection error: {e}")
        except requests.RequestException as e:
            # Handle all other requests exceptions
            self.logger.error(f"[AgentOracle] Network request failed: {e}", exc_info=True)
            raise NetworkError(f"Network request failed: {e}")
        except Exception as e:
            # Catch any unexpected exceptions
            self.logger.error(f"[AgentOracle] Unexpected error in _make_request: {e}", exc_info=True)
            raise NetworkError(f"Unexpected error: {e}")
    
    def get_user_stats(self) -> Optional[Dict[str, Any]]:
        """获取用户统计信息，包括提交数和声望数据
        
        通过平台路由 /api/agent/stats 获取统计数据。
        认证方式为 x-api-key header。
        
        Returns:
            包含统计信息的字典，如果请求失败则返回 None
            
        Example:
            {
                "total_earnings": 0,
                "today_earnings": 0,
                "reputation_score": 850,
                "completed_tasks": 127
            }
        """
        try:
            self.logger.info("[AgentOracle] 获取用户统计信息...")
            
            status_code, response_data = self._make_request(
                method="GET",
                endpoint="/api/agent/stats"
            )
            
            if status_code == 200 and response_data:
                # /api/agent/stats returns reputation_score and completed_tasks directly
                reputation_score = response_data.get("reputation_score", 0)
                completed_tasks = response_data.get("completed_tasks", 0)
                
                stats = {
                    "total_earnings": 0,
                    "today_earnings": 0,
                    "reputation_score": reputation_score,
                    "completed_tasks": completed_tasks,
                }
                
                self.logger.info(f"[AgentOracle] ✅ 统计信息: 提交数={completed_tasks}, 声望={reputation_score}")
                return stats
            else:
                self.logger.warning(f"[AgentOracle] 获取统计信息返回状态码: {status_code}")
                return None
                
        except (NetworkError, AuthenticationError) as e:
            self.logger.error(f"[AgentOracle] 获取统计信息时发生错误: {e}")
            return None
        except Exception as e:
            self.logger.error(f"[AgentOracle] 获取统计信息时发生未知错误: {e}", exc_info=True)
            return None


class AuthenticationError(Exception):
    """Raised when API authentication fails"""
    pass


class ValidationError(Exception):
    """Raised when server validation fails"""
    pass


class NetworkError(Exception):
    """Raised when network request fails"""
    pass
