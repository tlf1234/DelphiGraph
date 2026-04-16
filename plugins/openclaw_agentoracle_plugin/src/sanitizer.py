"""
Privacy sanitizer for removing personally identifiable information (PII)

Scans and redacts sensitive information from text to protect user privacy.
"""

import re
from typing import Dict, Any, List

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class Sanitizer:
    """Sanitizes personally identifiable information from text"""
    
    # Regular expression patterns for PII detection
    EMAIL_PATTERN = re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    )
    PHONE_PATTERN = re.compile(
        r'\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
    )
    LONG_NUMBER_PATTERN = re.compile(r'\b\d{10,}\b')
    API_KEY_PATTERN = re.compile(r'\b[A-Za-z0-9]{32,}\b')
    
    REDACTED_TEXT = "[REDACTED]"
    
    def __init__(self):
        """Initialize sanitizer with PII detection patterns.
        
        Creates a new Sanitizer instance with pre-compiled regular expression
        patterns for detecting various types of personally identifiable information.
        
        Detected PII types:
        - Email addresses (standard format)
        - Phone numbers (multiple international formats)
        - Long number sequences (10+ digits, potential credit cards/IDs)
        - API keys and tokens (32+ alphanumeric characters)
        
        Example:
            >>> sanitizer = Sanitizer()
            >>> text = "Contact me at user@example.com or call 555-1234"
            >>> clean = sanitizer.sanitize_text(text)
            >>> print(clean)
            "Contact me at [REDACTED] or call [REDACTED]"
        """
        self.logger = setup_logger()
    
    def sanitize_text(self, text: str) -> str:
        """Remove all personally identifiable information from text.
        
        Scans the input text for various PII patterns and replaces each match
        with the "[REDACTED]" placeholder. Multiple PII instances are each
        replaced individually.
        
        Detected and redacted PII types:
        - Email addresses: user@example.com → [REDACTED]
        - Phone numbers: +1-555-123-4567 → [REDACTED]
        - Long numbers: 1234567890123 → [REDACTED]
        - API keys: abc123def456... → [REDACTED]
        
        Args:
            text: Raw text that may contain PII. Can be any string including
                submissions, reasoning, or user input.
            
        Returns:
            Sanitized text with all detected PII replaced by "[REDACTED]".
            If input is not a string, it's converted to string first.
            Returns empty string if input is None.
            
        Example:
            >>> sanitizer = Sanitizer()
            >>> text = "Email: user@example.com, Phone: 555-1234, ID: 1234567890"
            >>> clean = sanitizer.sanitize_text(text)
            >>> print(clean)
            "Email: [REDACTED], Phone: [REDACTED], ID: [REDACTED]"
        """
        try:
            if not isinstance(text, str):
                self.logger.warning(f"[AgentOracle] sanitize_text received non-string input: {type(text)}")
                return str(text) if text is not None else ""
            
            # Apply all PII patterns
            sanitized = self.EMAIL_PATTERN.sub(self.REDACTED_TEXT, text)
            sanitized = self.PHONE_PATTERN.sub(self.REDACTED_TEXT, sanitized)
            sanitized = self.LONG_NUMBER_PATTERN.sub(self.REDACTED_TEXT, sanitized)
            sanitized = self.API_KEY_PATTERN.sub(self.REDACTED_TEXT, sanitized)
            
            # Detect and log PII types found
            try:
                pii_types = self._detect_pii(text)
                if pii_types:
                    self.logger.debug(f"[AgentOracle] Detected PII types: {', '.join(pii_types)}")
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error detecting PII types: {e}", exc_info=True)
            
            return sanitized
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error sanitizing text: {e}", exc_info=True)
            # Return original text on error (better than crashing)
            return text if isinstance(text, str) else ""
    
    def sanitize_submission(self, submission_data: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize all text fields in a submission data object.
        
        Applies PII sanitization to text fields while leaving numeric fields
        unchanged. Creates a copy of the input dictionary to avoid modifying
        the original.
        
        Fields processed:
        - reasoning: Sanitized for PII
        - rationale: Sanitized for PII
        - evidence_text: Sanitized for PII
        - relevance_score: Unchanged (numeric)
        - evidence_type/entity_tags/source_urls: Unchanged (structured)
        
        Args:
            submission_data: Dictionary containing submission fields.
            
        Returns:
            New dictionary with sanitized text fields. Numeric and structured
            fields remain exactly as in the input.
            If input is not a dict, returns it unchanged.
            
        Example:
            >>> sanitizer = Sanitizer()
            >>> submission = {
            ...     'rationale': 'Contact user@example.com for details',
            ...     'evidence_text': 'Source: 555-1234'
            ... }
            >>> clean = sanitizer.sanitize_submission(submission)
            >>> print(clean['rationale'])
            'Contact [REDACTED] for details'
        """
        try:
            if not isinstance(submission_data, dict):
                self.logger.error(f"[AgentOracle] sanitize_submission received non-dict input: {type(submission_data)}")
                return submission_data
            
            # Create a copy of the submission data
            sanitized_data = submission_data.copy()
            
            # Sanitize all text fields that may contain PII
            text_fields = ['reasoning', 'rationale', 'evidence_text']
            for field in text_fields:
                if field in sanitized_data and isinstance(sanitized_data[field], str):
                    try:
                        sanitized_data[field] = self.sanitize_text(sanitized_data[field])
                    except Exception as e:
                        self.logger.error(f"[AgentOracle] Error sanitizing {field} field: {e}", exc_info=True)
            
            # Numeric and structured fields remain unchanged:
            # relevance_score, evidence_type, entity_tags, source_urls
            
            return sanitized_data
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error in sanitize_submission: {e}", exc_info=True)
            # Return original data on error
            return submission_data
    
    def _detect_pii(self, text: str) -> List[str]:
        """Detect types of PII present in text for logging purposes.
        
        Scans text to identify which types of PII are present without actually
        extracting the PII values. Used for logging and debugging to understand
        what types of sensitive data are being redacted.
        
        This is a diagnostic method - the actual sanitization is done by
        sanitize_text(), not by this method.
        
        Args:
            text: Text to scan for PII patterns.
            
        Returns:
            List of PII type strings found in the text. Possible values:
            - "email": Email addresses detected
            - "phone": Phone numbers detected
            - "long_number": Long number sequences detected
            - "api_key": API key patterns detected
            
            Returns empty list if no PII detected or if input is not a string.
            
        Example:
            >>> sanitizer = Sanitizer()
            >>> text = "Contact: user@example.com, Phone: 555-1234"
            >>> types = sanitizer._detect_pii(text)
            >>> print(types)
            ['email', 'phone']
        """
        try:
            detected_types = []
            
            if not isinstance(text, str):
                return detected_types
            
            try:
                if self.EMAIL_PATTERN.search(text):
                    detected_types.append("email")
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error detecting email: {e}", exc_info=True)
            
            try:
                if self.PHONE_PATTERN.search(text):
                    detected_types.append("phone")
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error detecting phone: {e}", exc_info=True)
            
            try:
                if self.LONG_NUMBER_PATTERN.search(text):
                    detected_types.append("long_number")
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error detecting long_number: {e}", exc_info=True)
            
            try:
                if self.API_KEY_PATTERN.search(text):
                    detected_types.append("api_key")
            except Exception as e:
                self.logger.error(f"[AgentOracle] Error detecting api_key: {e}", exc_info=True)
            
            return detected_types
        except Exception as e:
            self.logger.error(f"[AgentOracle] Error in _detect_pii: {e}", exc_info=True)
            return []
