"""
Logging configuration for OpenClaw AgentOracle Plugin

Provides colored terminal output with [AgentOracle] prefix for all log messages.
Includes security filtering to prevent sensitive data leakage.
"""

import logging
import sys
import re
from typing import Optional

try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True)
    COLORAMA_AVAILABLE = True
except ImportError:
    COLORAMA_AVAILABLE = False
    # Fallback: no colors
    class Fore:
        RED = ""
        CYAN = ""
        YELLOW = ""
        GREEN = ""
    
    class Style:
        RESET_ALL = ""


class SensitiveDataFilter(logging.Filter):
    """Filter that sanitizes sensitive data from log messages.
    
    This filter automatically detects and redacts sensitive information such as
    API keys, email addresses, phone numbers, bearer tokens, and passwords from
    log messages before they are written to output. This prevents accidental
    leakage of sensitive data in log files.
    
    The filter uses regular expressions to identify common patterns of sensitive
    data and replaces them with "[REDACTED]" placeholder text.
    
    Attributes:
        API_KEY_PATTERN: Regex pattern for detecting API keys (32+ alphanumeric chars)
        EMAIL_PATTERN: Regex pattern for detecting email addresses
        PHONE_PATTERN: Regex pattern for detecting phone numbers
        BEARER_TOKEN_PATTERN: Regex pattern for detecting Bearer tokens
        PASSWORD_PATTERN: Regex pattern for detecting password fields
        REDACTED: Replacement text for redacted sensitive data
    
    Example:
        >>> filter = SensitiveDataFilter()
        >>> record = logging.LogRecord(...)
        >>> record.msg = "API key: abc123def456..."
        >>> filter.filter(record)
        >>> print(record.msg)
        "API key: [REDACTED]"
    """
    
    # Patterns for sensitive data
    API_KEY_PATTERN = re.compile(r'\b[A-Za-z0-9]{32,}\b')
    EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    PHONE_PATTERN = re.compile(r'\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')
    BEARER_TOKEN_PATTERN = re.compile(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', re.IGNORECASE)
    PASSWORD_PATTERN = re.compile(r'(password|passwd|pwd)[\s:=]+[^\s]+', re.IGNORECASE)
    
    REDACTED = "[REDACTED]"
    
    def filter(self, record: logging.LogRecord) -> bool:
        """
        Filter log record to sanitize sensitive data
        
        Args:
            record: Log record to filter
            
        Returns:
            True (always allow the record, but sanitize it first)
        """
        # Sanitize the message
        if isinstance(record.msg, str):
            record.msg = self._sanitize(record.msg)
        
        # Sanitize arguments if present
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._sanitize(str(v)) if isinstance(v, str) else v 
                              for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(self._sanitize(str(arg)) if isinstance(arg, str) else arg 
                                   for arg in record.args)
        
        return True
    
    def _sanitize(self, text: str) -> str:
        """Sanitize sensitive data from text.
        
        Applies all configured regex patterns to detect and replace sensitive
        information with the REDACTED placeholder. Patterns are applied in
        sequence: API keys, emails, phone numbers, bearer tokens, and passwords.
        
        Args:
            text: Text to sanitize
            
        Returns:
            Sanitized text with sensitive data replaced by [REDACTED]
            
        Example:
            >>> filter = SensitiveDataFilter()
            >>> text = "Contact: user@example.com, API: sk-abc123..."
            >>> filter._sanitize(text)
            "Contact: [REDACTED], API: [REDACTED]"
        """
        # Replace API keys (but preserve short strings that might not be keys)
        text = self.API_KEY_PATTERN.sub(lambda m: self.REDACTED if len(m.group(0)) >= 32 else m.group(0), text)
        
        # Replace email addresses
        text = self.EMAIL_PATTERN.sub(self.REDACTED, text)
        
        # Replace phone numbers
        text = self.PHONE_PATTERN.sub(self.REDACTED, text)
        
        # Replace Bearer tokens
        text = self.BEARER_TOKEN_PATTERN.sub(f"Bearer {self.REDACTED}", text)
        
        # Replace passwords
        text = self.PASSWORD_PATTERN.sub(lambda m: f"{m.group(1)}: {self.REDACTED}", text)
        
        return text


class ColoredFormatter(logging.Formatter):
    """Custom formatter that adds colors and [AgentOracle] prefix to log messages.
    
    This formatter enhances log output with ANSI color codes (when colorama is available)
    and automatically prepends the [AgentOracle] prefix to all messages for easy
    identification in mixed log streams.
    
    Color mapping:
        - DEBUG/INFO: Cyan
        - WARNING: Yellow
        - ERROR/CRITICAL: Red
    
    Attributes:
        PREFIX: The prefix added to all log messages ("[AgentOracle]")
        COLORS: Dictionary mapping log levels to color codes
    
    Example:
        >>> formatter = ColoredFormatter()
        >>> record = logging.LogRecord(...)
        >>> formatted = formatter.format(record)
        >>> print(formatted)
        "\033[36m2024-01-15 10:30:45 - INFO - [AgentOracle] Plugin started\033[0m"
    """
    
    PREFIX = "[AgentOracle]"
    
    # Color mapping for log levels
    COLORS = {
        logging.DEBUG: Fore.CYAN,
        logging.INFO: Fore.CYAN,
        logging.WARNING: Fore.YELLOW,
        logging.ERROR: Fore.RED,
        logging.CRITICAL: Fore.RED,
    }
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with color and prefix.
        
        Adds the [AgentOracle] prefix to the message, formats it using the parent
        formatter, and applies ANSI color codes based on the log level if colorama
        is available.
        
        Args:
            record: Log record to format
            
        Returns:
            Formatted log message string with color codes and prefix
            
        Note:
            The original record.msg is preserved after formatting to avoid
            side effects on the log record object.
        """
        # Get color for this log level
        color = self.COLORS.get(record.levelno, "")
        
        # Add prefix to message
        original_msg = record.msg
        record.msg = f"{self.PREFIX} {original_msg}"
        
        # Format the message
        formatted = super().format(record)
        
        # Restore original message
        record.msg = original_msg
        
        # Apply color if available
        if COLORAMA_AVAILABLE and color:
            formatted = f"{color}{formatted}{Style.RESET_ALL}"
        
        return formatted


def setup_logger(
    name: str = "openclaw_agentoracle",
    level: int = logging.INFO,
    log_file: Optional[str] = None
) -> logging.Logger:
    """
    Setup and configure logger with colored output and security filtering
    
    Args:
        name: Logger name
        level: Logging level (default: INFO)
        log_file: Optional file path for logging to file
        
    Returns:
        Configured logger instance with sensitive data filtering
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Remove existing handlers to avoid duplicates
    logger.handlers.clear()
    
    # Add sensitive data filter to logger
    sensitive_filter = SensitiveDataFilter()
    logger.addFilter(sensitive_filter)
    
    # Console handler with colored output
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_formatter = ColoredFormatter(
        fmt="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # Optional file handler (without colors)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_formatter = logging.Formatter(
            fmt="%(asctime)s - %(levelname)s - [AgentOracle] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)
    
    return logger


# Create default logger instance
default_logger = setup_logger()
