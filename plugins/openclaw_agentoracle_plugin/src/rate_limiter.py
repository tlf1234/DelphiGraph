"""
Rate limiter for API requests

Implements token bucket algorithm to limit request rate and prevent request storms.
"""

import time
import threading
from typing import Optional

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class RateLimiter:
    """Token bucket rate limiter for API requests.
    
    Implements the token bucket algorithm to limit the rate of API requests
    and prevent request storms. Tokens are refilled at a constant rate, and
    each request consumes one token. If no tokens are available, requests
    must wait until tokens are refilled.
    
    The refill rate is calculated as: max_requests / time_window tokens per second.
    For example, with max_requests=10 and time_window=60, tokens refill at
    0.167 tokens/second (10 tokens per 60 seconds).
    
    This implementation is thread-safe and can be used across multiple threads.
    
    Attributes:
        max_requests: Maximum number of requests allowed in the time window
        time_window: Time window in seconds for rate limiting
        tokens: Current number of available tokens (can be fractional)
        last_update: Timestamp of last token refill
        lock: Threading lock for thread-safe operations
        logger: Logger instance for debugging
    
    Example:
        >>> limiter = RateLimiter(max_requests=10, time_window=60.0)
        >>> if limiter.acquire(timeout=5.0):
        ...     # Make API request
        ...     response = api_client.fetch_task()
        ... else:
        ...     print("Rate limit exceeded")
    """
    
    def __init__(self, max_requests: int = 10, time_window: float = 60.0):
        """Initialize rate limiter with token bucket parameters.
        
        Creates a token bucket rate limiter that allows a maximum number of
        requests within a sliding time window. Tokens are refilled continuously
        at a constant rate.
        
        Refill rate calculation:
        - Rate = max_requests / time_window tokens per second
        - Example: 10 requests / 60 seconds = 0.167 tokens/second
        
        Args:
            max_requests: Maximum number of requests allowed in the time window.
                This is also the initial token count and the maximum bucket
                capacity. Defaults to 10.
            time_window: Time window in seconds for rate limiting. Defaults to
                60.0 seconds (1 minute).
                
        Example:
            >>> limiter = RateLimiter(max_requests=10, time_window=60.0)
            >>> # Allows 10 requests per minute
            >>> if limiter.acquire(timeout=5.0):
            ...     make_api_request()
            ... else:
            ...     print("Rate limit exceeded")
        """
        self.max_requests = max_requests
        self.time_window = time_window
        self.tokens = max_requests
        self.last_update = time.time()
        self.lock = threading.Lock()
        self.logger = setup_logger()
    
    def _refill_tokens(self) -> None:
        """Refill tokens based on elapsed time.
        
        Calculates the number of tokens to add based on the time elapsed since
        the last update. Tokens are refilled at a constant rate determined by
        max_requests / time_window. The token count is capped at max_requests.
        
        This method should be called with the lock held to ensure thread safety.
        
        Note:
            This is an internal method and should not be called directly.
            Use acquire() to get tokens, which handles refilling automatically.
        """
        now = time.time()
        elapsed = now - self.last_update
        
        # Calculate tokens to add based on elapsed time
        tokens_to_add = elapsed * (self.max_requests / self.time_window)
        
        # Update tokens (capped at max_requests)
        self.tokens = min(self.max_requests, self.tokens + tokens_to_add)
        self.last_update = now
    
    def acquire(self, timeout: Optional[float] = None) -> bool:
        """Acquire a token to make a request, blocking if necessary.
        
        Attempts to consume one token from the bucket. If no tokens are available,
        waits for tokens to be refilled. The wait time is calculated based on
        the refill rate.
        
        Behavior:
        - If token available: Consumes it immediately and returns True
        - If no token: Waits for refill (up to timeout duration)
        - Tokens refill continuously at rate: max_requests / time_window per second
        
        This method is thread-safe and can be called from multiple threads.
        
        Args:
            timeout: Maximum time to wait for a token in seconds. If None,
                waits indefinitely until a token becomes available. If a
                positive number, returns False if timeout is exceeded.
            
        Returns:
            True if a token was successfully acquired.
            False if the timeout was exceeded before a token became available.
            
        Example:
            >>> limiter = RateLimiter(max_requests=10, time_window=60.0)
            >>> 
            >>> # Wait up to 5 seconds for a token
            >>> if limiter.acquire(timeout=5.0):
            ...     response = api_client.fetch_task()
            ... else:
            ...     print("Rate limit exceeded, try again later")
            >>> 
            >>> # Wait indefinitely
            >>> limiter.acquire(timeout=None)
            >>> response = api_client.fetch_task()
        """
        start_time = time.time()
        
        while True:
            with self.lock:
                self._refill_tokens()
                
                if self.tokens >= 1.0:
                    # Token available - consume it
                    self.tokens -= 1.0
                    self.logger.debug(f"[AgentOracle] Rate limiter: token acquired ({self.tokens:.2f} remaining)")
                    return True
                
                # Calculate wait time until next token available
                time_until_token = (1.0 - self.tokens) * (self.time_window / self.max_requests)
            
            # Check timeout
            if timeout is not None:
                elapsed = time.time() - start_time
                if elapsed >= timeout:
                    self.logger.warning("[AgentOracle] Rate limiter: timeout exceeded")
                    return False
                
                # Wait for shorter of: time_until_token or remaining timeout
                wait_time = min(time_until_token, timeout - elapsed)
            else:
                wait_time = time_until_token
            
            # Wait before retrying
            self.logger.debug(f"[AgentOracle] Rate limiter: waiting {wait_time:.2f}s for token")
            time.sleep(wait_time)
    
    def get_available_tokens(self) -> float:
        """Get number of available tokens.
        
        Returns the current number of tokens available for consumption after
        refilling based on elapsed time. This method is thread-safe.
        
        Returns:
            Number of available tokens (can be fractional, e.g., 3.7 tokens)
            
        Example:
            >>> limiter = RateLimiter(max_requests=10, time_window=60.0)
            >>> tokens = limiter.get_available_tokens()
            >>> print(f"Available tokens: {tokens:.2f}")
            Available tokens: 10.00
        """
        with self.lock:
            self._refill_tokens()
            return self.tokens
