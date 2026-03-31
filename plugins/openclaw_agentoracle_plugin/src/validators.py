"""
String length validation for security hardening

Prevents resource exhaustion attacks by limiting string lengths.
"""

from typing import Dict, Any, Optional

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


# Maximum length limits for various fields
# These limits prevent resource exhaustion attacks
MAX_LENGTHS = {
    "question": 5000,
    "keyword": 100,
    "prediction": 10000,  # Increased to accommodate full analysis reports
    "reasoning": 10000,   # Increased to accommodate detailed reasoning
    "rationale": 10000,   # New structured field for prediction rationale
    "evidence_text": 5000, # New structured field for evidence text
    "api_key": 128,
    "task_id": 100,
    "id": 100,            # Task ID (UUID format from get-tasks)
}


class StringLengthValidator:
    """Validates string lengths to prevent resource exhaustion.
    
    Enforces maximum length limits on various string fields to prevent
    resource exhaustion attacks and ensure data integrity. Each field type
    has a predefined maximum length based on security and practical considerations.
    
    Maximum length limits:
        - question: 5000 characters
        - keyword: 100 characters
        - prediction: 10000 characters
        - reasoning: 10000 characters
        - rationale: 10000 characters
        - evidence_text: 5000 characters
        - api_key: 128 characters
        - id/task_id: 100 characters
        - default: 1000 characters (for unlisted fields)
    
    Attributes:
        logger: Logger instance for validation warnings
    
    Example:
        >>> validator = StringLengthValidator()
        >>> task = {"id": "a1b2c3d4-...", "question": "What is...?"}
        >>> if validator.validate_task_strings(task):
        ...     process_task(task)
        ... else:
        ...     logger.error("Task validation failed")
    """
    
    def __init__(self):
        """Initialize string length validator with predefined limits.
        
        Creates a validator that enforces maximum length limits on various
        string fields to prevent resource exhaustion attacks and ensure
        data integrity.
        
        Example:
            >>> validator = StringLengthValidator()
            >>> task = {"id": "a1b2c3d4-...", "question": "What is...?"}
            >>> if validator.validate_task_strings(task):
            ...     process_task(task)
        """
        self.logger = setup_logger()
    
    def validate_string_length(self, value: str, field: str) -> bool:
        """Validate that a string's length is within the safe range for its field type.
        
        Checks the string length against the maximum limit defined for the field
        type. Different fields have different limits based on their expected use:
        - question: 5000 chars (long-form questions)
        - keyword: 100 chars (short keywords)
        - prediction: 2000 chars (prediction answers)
        - reasoning: 5000 chars (detailed explanations)
        - api_key: 128 chars (authentication tokens)
        - task_id: 100 chars (identifiers)
        - default: 1000 chars (unlisted fields)
        
        Args:
            value: String value to validate. Must be a string type.
            field: Field name used to lookup the appropriate maximum length
                limit. Should match one of the predefined field types.
            
        Returns:
            True if the string length is within the allowed limit.
            False if the string exceeds the limit or if value is not a string.
            Failures are logged with the field name and actual length.
            
        Example:
            >>> validator = StringLengthValidator()
            >>> validator.validate_string_length("short", "question")
            True
            >>> validator.validate_string_length("x" * 6000, "question")
            False  # Exceeds 5000 char limit
            >>> validator.validate_string_length(123, "question")
            False  # Not a string
        """
        try:
            # Check if value is a string
            if not isinstance(value, str):
                self.logger.warning(f"[AgentOracle] Field '{field}' is not a string: {type(value)}")
                return False
            
            # Get max length for this field (default to 1000 if not specified)
            max_length = MAX_LENGTHS.get(field, 1000)
            
            # Check if value exceeds max length
            if len(value) > max_length:
                self.logger.warning(
                    f"[AgentOracle] Field '{field}' exceeds max length {max_length} "
                    f"(actual: {len(value)})"
                )
                return False
            
            return True
            
        except Exception as e:
            self.logger.error(
                f"[AgentOracle] Error validating string length for field '{field}': {e}",
                exc_info=True
            )
            return False
    
    def validate_task_strings(self, task: Dict[str, Any]) -> bool:
        """Validate all string fields in a task object.
        
        Checks the length of id, question, and each tag in required_niche_tags.
        All strings must be within their respective length limits.
        
        Validated fields:
        - id: Max 100 characters (UUID from /api/agent/tasks)
        - question: Max 5000 characters
        - required_niche_tags: Each tag max 100 characters
        
        Args:
            task: Task dictionary containing id, question, and optionally
                required_niche_tags fields. Other fields are ignored.
            
        Returns:
            True if all string fields pass validation.
            False if any field exceeds its length limit. The first failure
            is logged and causes immediate return.
            
        Example:
            >>> validator = StringLengthValidator()
            >>> task = {
            ...     "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            ...     "question": "Will it rain tomorrow?",
            ...     "required_niche_tags": ["weather", "forecast"]
            ... }
            >>> validator.validate_task_strings(task)
            True
        """
        try:
            # Validate id (from /api/agent/tasks response)
            if "id" in task:
                if not self.validate_string_length(task["id"], "id"):
                    return False
            
            # Backward compat: also validate task_id if present
            if "task_id" in task:
                if not self.validate_string_length(task["task_id"], "task_id"):
                    return False
            
            # Validate question
            if "question" in task:
                if not self.validate_string_length(task["question"], "question"):
                    return False
            
            # Validate required_niche_tags (from /api/agent/tasks response)
            for tag_field in ["required_niche_tags", "keywords"]:
                if tag_field in task and isinstance(task[tag_field], list):
                    for i, keyword in enumerate(task[tag_field]):
                        if isinstance(keyword, str):
                            if not self.validate_string_length(keyword, "keyword"):
                                self.logger.warning(
                                    f"[AgentOracle] Tag at index {i} in '{tag_field}' exceeds max length"
                                )
                                return False
            
            return True
            
        except Exception as e:
            self.logger.error(
                f"[AgentOracle] Error validating task strings: {e}",
                exc_info=True
            )
            return False
    
    def validate_prediction_strings(self, prediction_data: Dict[str, Any]) -> bool:
        """Validate all string fields in a prediction data object.
        
        Checks the length of prediction/rationale/reasoning/evidence_text fields.
        All must be within their respective length limits.
        
        Validated fields:
        - prediction: Max 10000 characters (backward compat)
        - reasoning: Max 10000 characters (backward compat)
        - rationale: Max 10000 characters (new structured field)
        - evidence_text: Max 5000 characters (new structured field)
        
        Numeric fields (probability, confidence, relevance_score) are not validated.
        
        Args:
            prediction_data: Prediction dictionary containing text fields.
            
        Returns:
            True if all string fields pass validation.
            False if any field exceeds its length limit.
            
        Example:
            >>> validator = StringLengthValidator()
            >>> prediction = {
            ...     "probability": 0.75,
            ...     "rationale": "Based on weather patterns...",
            ...     "evidence_type": "hard_fact"
            ... }
            >>> validator.validate_prediction_strings(prediction)
            True
        """
        try:
            # Validate all text fields that have length limits
            text_fields = ["prediction", "reasoning", "rationale", "evidence_text"]
            for field in text_fields:
                if field in prediction_data and isinstance(prediction_data[field], str):
                    if not self.validate_string_length(prediction_data[field], field):
                        return False
            
            return True
            
        except Exception as e:
            self.logger.error(
                f"[AgentOracle] Error validating prediction strings: {e}",
                exc_info=True
            )
            return False
