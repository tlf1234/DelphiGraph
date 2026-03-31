"""
Memory usage monitor for plugin

Monitors memory usage and logs warnings when limits are exceeded.
"""

import psutil
import os
from typing import Dict, Any

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class MemoryMonitor:
    """Monitors memory usage of the plugin process.
    
    Tracks the Resident Set Size (RSS) memory usage of the current process
    and logs warnings when usage exceeds configured limits. This helps prevent
    memory leaks and resource exhaustion.
    
    Uses the psutil library to access process memory information. Memory
    statistics include both process-specific usage and system-wide availability.
    
    Attributes:
        max_memory_bytes: Maximum allowed memory in bytes
        max_memory_mb: Maximum allowed memory in MB (for display)
        logger: Logger instance for warnings and debug info
        process: psutil.Process instance for current process
    
    Example:
        >>> monitor = MemoryMonitor(max_memory_mb=500)
        >>> if monitor.check_memory_limit():
        ...     # Memory usage is within limits
        ...     process_task()
        ... else:
        ...     # Memory limit exceeded
        ...     logger.warning("Memory limit exceeded, skipping task")
    """
    
    def __init__(self, max_memory_mb: int = 500):
        """Initialize memory monitor with maximum memory limit.
        
        Creates a monitor that tracks the Resident Set Size (RSS) memory usage
        of the current process and logs warnings when the limit is exceeded.
        
        RSS (Resident Set Size) represents the portion of memory occupied by
        the process that is held in RAM. This is the actual physical memory
        used, not including swapped memory.
        
        Args:
            max_memory_mb: Maximum allowed memory usage in megabytes. Defaults
                to 500 MB. When this limit is exceeded, a warning is logged
                but the process continues running.
                
        Example:
            >>> monitor = MemoryMonitor(max_memory_mb=500)
            >>> if monitor.check_memory_limit():
            ...     process_task()
            ... else:
            ...     print("Memory limit exceeded, skipping task")
            >>> 
            >>> monitor.log_memory_stats()
            # Logs current memory usage statistics
        """
        self.max_memory_bytes = max_memory_mb * 1024 * 1024
        self.max_memory_mb = max_memory_mb
        self.logger = setup_logger()
        self.process = psutil.Process(os.getpid())
    
    def get_memory_usage(self) -> Dict[str, Any]:
        """Get comprehensive memory usage statistics for the current process.
        
        Collects detailed memory information including process-specific usage
        and system-wide availability. Uses psutil to access process memory
        information.
        
        Returns:
            Dictionary containing memory statistics:
            - rss_bytes: Resident Set Size in bytes (int) - physical memory used
            - rss_mb: Resident Set Size in megabytes (float) - for readability
            - percent: Memory usage as percentage of total system memory (float)
            - available_system_mb: Available system memory in MB (float)
            
            Returns zeros for all fields if an error occurs during collection.
            
        Example:
            >>> monitor = MemoryMonitor(max_memory_mb=500)
            >>> usage = monitor.get_memory_usage()
            >>> print(usage)
            {
                'rss_bytes': 47185920,
                'rss_mb': 45.0,
                'percent': 0.56,
                'available_system_mb': 8192.0
            }
            >>> print(f"Using {usage['rss_mb']:.2f} MB")
            Using 45.00 MB
        """
        try:
            memory_info = self.process.memory_info()
            system_memory = psutil.virtual_memory()
            
            return {
                "rss_bytes": memory_info.rss,
                "rss_mb": memory_info.rss / (1024 * 1024),
                "percent": self.process.memory_percent(),
                "available_system_mb": system_memory.available / (1024 * 1024)
            }
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error getting memory usage: {e}", exc_info=True)
            return {
                "rss_bytes": 0,
                "rss_mb": 0.0,
                "percent": 0.0,
                "available_system_mb": 0.0
            }
    
    def check_memory_limit(self) -> bool:
        """Check if current memory usage is within the configured limit.
        
        Compares the current RSS memory usage against the maximum limit set
        during initialization. If the limit is exceeded, logs a warning with
        detailed memory statistics.
        
        This method is designed to be called before resource-intensive operations
        to prevent memory exhaustion. It does not terminate the process, only
        logs warnings.
        
        Returns:
            True if memory usage is within the limit (safe to proceed).
            False if memory usage exceeds the limit (warning logged).
            Returns True on error to avoid false alarms.
            
        Example:
            >>> monitor = MemoryMonitor(max_memory_mb=500)
            >>> if monitor.check_memory_limit():
            ...     # Safe to process task
            ...     process_large_task()
            ... else:
            ...     # Memory limit exceeded
            ...     logger.warning("Skipping task due to memory limit")
            ...     skip_task()
        """
        try:
            memory_usage = self.get_memory_usage()
            rss_bytes = memory_usage["rss_bytes"]
            rss_mb = memory_usage["rss_mb"]
            
            if rss_bytes > self.max_memory_bytes:
                self.logger.warning(
                    f"[AgentOracle] Memory limit exceeded: {rss_mb:.2f}MB / {self.max_memory_mb}MB "
                    f"({memory_usage['percent']:.2f}% of system memory)"
                )
                return False
            
            self.logger.debug(
                f"[AgentOracle] Memory usage: {rss_mb:.2f}MB / {self.max_memory_mb}MB "
                f"({memory_usage['percent']:.2f}% of system memory)"
            )
            return True
            
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error checking memory limit: {e}", exc_info=True)
            return True  # Return True on error to avoid false alarms
    
    def log_memory_stats(self) -> None:
        """Log current memory statistics.
        
        Logs detailed memory information including RSS (Resident Set Size),
        process memory percentage, and available system memory. Useful for
        debugging memory issues and monitoring plugin resource usage.
        
        The logged information includes:
            - RSS: Resident Set Size in MB (physical memory used)
            - Process: Memory usage as percentage of total system memory
            - System Available: Available system memory in MB
        
        Example:
            >>> monitor = MemoryMonitor()
            >>> monitor.log_memory_stats()
            # Logs: "Memory stats: RSS=45.23MB, Process=0.56%, System Available=8192.00MB"
        """
        try:
            memory_usage = self.get_memory_usage()
            self.logger.info(
                f"[AgentOracle] Memory stats: "
                f"RSS={memory_usage['rss_mb']:.2f}MB, "
                f"Process={memory_usage['percent']:.2f}%, "
                f"System Available={memory_usage['available_system_mb']:.2f}MB"
            )
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error logging memory stats: {e}", exc_info=True)
