"""
Telemetry collector for gathering non-sensitive behavioral and runtime metadata

Collects statistics without accessing actual content to protect user privacy.
"""

import time
from pathlib import Path
from typing import Dict, Any, Optional

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class TelemetryCollector:
    """Collects telemetry data for anti-sybil detection"""
    
    def __init__(self, vector_db_path: Optional[str], conversation_log_path: Optional[str]):
        """Initialize telemetry collector with file paths.
        
        Creates a telemetry collector that gathers non-sensitive behavioral
        and runtime metadata for anti-sybil detection. The collector accesses
        only metadata and statistics, never actual content, to protect privacy.
        
        Args:
            vector_db_path: Path to vector database file. Used to collect
                database size and chunk count statistics without reading
                actual vector embeddings or text content. Supports tilde
                expansion (e.g., "~/.openclaw/vector_db"). Can be None if
                OpenClaw is not installed.
            conversation_log_path: Path to conversation log file. Used to
                count user-initiated interactions without reading message
                content. Supports tilde expansion. Can be None if OpenClaw
                is not installed.
                
        Example:
            >>> collector = TelemetryCollector(
            ...     vector_db_path="~/.openclaw/vector_db",
            ...     conversation_log_path="~/.openclaw/conversations.log"
            ... )
            >>> collector.start_timing()
            >>> # ... perform inference ...
            >>> latency = collector.stop_timing()
            >>> telemetry = collector.collect_all()
        """
        # Handle None values for paths (when OpenClaw is not installed)
        self.vector_db_path = Path(vector_db_path) if vector_db_path else None
        self.conversation_log_path = Path(conversation_log_path) if conversation_log_path else None
        self.start_time: Optional[float] = None
        self.logger = setup_logger()
    
    def start_timing(self) -> None:
        """Start timing for inference latency measurement.
        
        Records the current timestamp in milliseconds as the start time for
        inference latency calculation. Should be called immediately before
        starting the LLM inference operation.
        
        Must be paired with stop_timing() to calculate the actual latency.
        
        Example:
            >>> collector = TelemetryCollector(...)
            >>> collector.start_timing()
            >>> result = llm.generate(prompt)  # Inference operation
            >>> latency = collector.stop_timing()
            >>> print(f"Inference took {latency:.2f}ms")
        """
        try:
            self.start_time = time.time() * 1000  # Convert to milliseconds
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error starting timing: {e}", exc_info=True)
            self.start_time = None
    
    def stop_timing(self) -> float:
        """Stop timing and calculate inference latency.
        
        Records the current timestamp and calculates the elapsed time since
        start_timing() was called. The latency is stored internally for use
        by collect_all().
        
        Returns:
            Inference latency in milliseconds. Returns 0.0 if start_timing()
            was not called first or if an error occurred.
            
        Example:
            >>> collector = TelemetryCollector(...)
            >>> collector.start_timing()
            >>> # ... inference operation ...
            >>> latency = collector.stop_timing()
            >>> print(f"Latency: {latency:.2f}ms")
            Latency: 1234.56ms
        """
        try:
            if self.start_time is None:
                self.logger.warning("[AgentOracle] stop_timing called without start_timing")
                return 0.0
            
            current_time = time.time() * 1000  # Convert to milliseconds
            latency = current_time - self.start_time
            self._last_latency = latency  # Store for collect_all()
            self.start_time = None  # Reset start time
            return latency
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error stopping timing: {e}", exc_info=True)
            self._last_latency = 0.0
            self.start_time = None
            return 0.0
    
    def collect_memory_entropy(self) -> Dict[str, Any]:
        """Collect vector database statistics without accessing content.
        
        Gathers metadata about the vector database for anti-sybil detection:
        - File size in bytes
        - Total number of chunks/embeddings
        - Number of recently created chunks (last 24 hours)
        
        Privacy guarantee: This method NEVER reads or transmits:
        - Actual text content
        - Vector embedding values
        - Document titles or paths
        - Any personally identifiable information
        
        Only statistical metadata is collected to distinguish real users from
        synthetic/bot-generated agents.
        
        Returns:
            Dictionary containing:
            - db_size_bytes: Database file size in bytes (int)
            - total_chunks: Total number of chunks in database (int)
            - recent_chunks_24h: Chunks created in last 24 hours (int)
            
            Returns zeros for all fields if database file doesn't exist or
            if an error occurs during collection.
            
        Example:
            >>> collector = TelemetryCollector(
            ...     vector_db_path="~/.openclaw/vector_db",
            ...     conversation_log_path="~/.openclaw/conversations.log"
            ... )
            >>> entropy = collector.collect_memory_entropy()
            >>> print(entropy)
            {
                'db_size_bytes': 1048576,
                'total_chunks': 150,
                'recent_chunks_24h': 12
            }
        """
        try:
            # Return zeros if path is None (OpenClaw not installed)
            if self.vector_db_path is None:
                self.logger.info("[AgentOracle] Vector database path not configured, returning zero telemetry")
                return {
                    "db_size_bytes": 0,
                    "total_chunks": 0,
                    "recent_chunks_24h": 0
                }
            
            self.logger.info("[AgentOracle] Collecting memory entropy (metadata only, no content)")
            
            # Check if vector database file exists
            if not self.vector_db_path.exists():
                self.logger.warning(f"[AgentOracle] Vector database not found at {self.vector_db_path}")
                return {
                    "db_size_bytes": 0,
                    "total_chunks": 0,
                    "recent_chunks_24h": 0
                }
            
            try:
                # Get file size in bytes
                import os
                db_size_bytes = os.path.getsize(self.vector_db_path)
                
                # For MVP: Return mock statistics since we don't know the actual DB format
                # In production, these would be read from the actual vector database metadata
                # without accessing the actual text content
                total_chunks = 0
                recent_chunks_24h = 0
                
                self.logger.info(f"[AgentOracle] Memory entropy collected: {db_size_bytes} bytes")
                
                return {
                    "db_size_bytes": db_size_bytes,
                    "total_chunks": total_chunks,
                    "recent_chunks_24h": recent_chunks_24h
                }
            except (IOError, OSError) as e:
                self.logger.error(f"[AgentOracle] I/O error collecting memory entropy: {e}", exc_info=True)
                return {
                    "db_size_bytes": 0,
                    "total_chunks": 0,
                    "recent_chunks_24h": 0
                }
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error collecting memory entropy: {e}", exc_info=True)
                return {
                    "db_size_bytes": 0,
                    "total_chunks": 0,
                    "recent_chunks_24h": 0
                }
        except Exception as e:
            self.logger.error(f"[AgentOracle] Unexpected error in collect_memory_entropy: {e}", exc_info=True)
            return {
                "db_size_bytes": 0,
                "total_chunks": 0,
                "recent_chunks_24h": 0
            }
    
    def collect_interaction_heartbeat(self) -> int:
        """Collect user interaction count without accessing message content.
        
        Counts the number of user-initiated conversation turns in the last 7 days
        by reading only metadata from the conversation log. This metric helps
        distinguish active users from automated bots.
        
        Privacy guarantee: This method NEVER reads or transmits:
        - Message text content
        - User input text
        - AI response content
        - Any personally identifiable information
        
        Only interaction counts and timestamps are processed. The actual message
        content is skipped entirely.
        
        Returns:
            Count of user-initiated conversation turns in the last 7 days (int).
            Returns 0 if the conversation log is not accessible or if an error
            occurs during collection.
            
        Example:
            >>> collector = TelemetryCollector(
            ...     vector_db_path="~/.openclaw/vector_db",
            ...     conversation_log_path="~/.openclaw/conversations.log"
            ... )
            >>> heartbeat = collector.collect_interaction_heartbeat()
            >>> print(f"User interactions in last 7 days: {heartbeat}")
            User interactions in last 7 days: 42
        """
        try:
            # Return 0 if path is None (OpenClaw not installed)
            if self.conversation_log_path is None:
                self.logger.info("[AgentOracle] Conversation log path not configured, returning zero telemetry")
                return 0
            
            self.logger.info("[AgentOracle] Collecting interaction heartbeat (metadata only, no message content)")
            
            # Check if conversation log file exists
            if not self.conversation_log_path.exists():
                self.logger.warning(f"[AgentOracle] Conversation log not accessible at {self.conversation_log_path}")
                return 0
            
            try:
                # For MVP: Return mock count since we don't know the actual log format
                # In production, this would:
                # 1. Read only metadata lines (timestamps, user-initiated markers)
                # 2. Count user-initiated turns in last 7 days
                # 3. Never read or transmit actual message content
                
                # Calculate cutoff time (7 days ago)
                cutoff_time = time.time() - (7 * 24 * 3600)
                
                # Mock count for MVP - in production this would parse the log file
                # looking for user-initiated interaction markers without reading content
                interaction_count = 0
                
                self.logger.info(f"[AgentOracle] Interaction heartbeat collected: {interaction_count} turns in last 7 days")
                
                return interaction_count
                
            except (IOError, OSError) as e:
                self.logger.error(f"[AgentOracle] I/O error collecting interaction heartbeat: {e}", exc_info=True)
                return 0
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error collecting interaction heartbeat: {e}", exc_info=True)
                return 0
        except Exception as e:
            self.logger.error(f"[AgentOracle] Unexpected error in collect_interaction_heartbeat: {e}", exc_info=True)
            return 0
    
    def collect_all(self) -> Dict[str, Any]:
        """Collect all telemetry data in a single call.
        
        Gathers all telemetry metrics and packages them into a single dictionary
        for submission to the AgentOracle server. This includes:
        - Memory entropy statistics from vector database
        - Interaction heartbeat count from conversation log
        - Inference latency from the last timing measurement
        
        Each metric is collected with comprehensive error handling. If any
        individual metric fails to collect, default values are used to ensure
        the telemetry data structure is always complete.
        
        Returns:
            Complete telemetry data dictionary containing:
            - memory_entropy: Dict with db_size_bytes, total_chunks, recent_chunks_24h
            - interaction_heartbeat: Int count of recent user interactions
            - inference_latency_ms: Float latency in milliseconds
            
            All fields are guaranteed to be present with valid types, even if
            collection errors occur (defaults to zeros).
            
        Example:
            >>> collector = TelemetryCollector(
            ...     vector_db_path="~/.openclaw/vector_db",
            ...     conversation_log_path="~/.openclaw/conversations.log"
            ... )
            >>> collector.start_timing()
            >>> # ... perform inference ...
            >>> collector.stop_timing()
            >>> telemetry = collector.collect_all()
            >>> print(telemetry)
            {
                'memory_entropy': {
                    'db_size_bytes': 1048576,
                    'total_chunks': 150,
                    'recent_chunks_24h': 12
                },
                'interaction_heartbeat': 42,
                'inference_latency_ms': 1234.56
            }
        """
        try:
            self.logger.info("[AgentOracle] Collecting all telemetry data")
            
            # Collect memory entropy statistics
            try:
                memory_entropy = self.collect_memory_entropy()
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error in collect_memory_entropy: {e}", exc_info=True)
                memory_entropy = {"db_size_bytes": 0, "total_chunks": 0, "recent_chunks_24h": 0}
            
            # Collect interaction heartbeat count
            try:
                interaction_heartbeat = self.collect_interaction_heartbeat()
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error in collect_interaction_heartbeat: {e}", exc_info=True)
                interaction_heartbeat = 0
            
            # Get inference latency from the last stop_timing() call
            # If timing was not started/stopped, use 0 as default
            inference_latency_ms = 0.0
            if hasattr(self, '_last_latency'):
                inference_latency_ms = self._last_latency
            
            # Package all telemetry data into a dictionary
            telemetry_data = {
                "memory_entropy": memory_entropy,
                "interaction_heartbeat": interaction_heartbeat,
                "inference_latency_ms": inference_latency_ms
            }
            
            self.logger.info(f"[AgentOracle] Telemetry collection complete: {len(telemetry_data)} metrics")
            
            return telemetry_data
        except Exception as e:
            self.logger.error(f"[AgentOracle] Unexpected error in collect_all: {e}", exc_info=True)
            # Return default telemetry data on error
            return {
                "memory_entropy": {"db_size_bytes": 0, "total_chunks": 0, "recent_chunks_24h": 0},
                "interaction_heartbeat": 0,
                "inference_latency_ms": 0.0
            }
