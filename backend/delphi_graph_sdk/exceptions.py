"""
Custom exception classes for DelphiGraph SDK
"""


class DelphiGraphError(Exception):
    """Base exception for all DelphiGraph SDK errors"""
    pass


class AuthenticationError(DelphiGraphError):
    """Raised when API Key authentication fails"""
    pass


class ValidationError(DelphiGraphError):
    """Raised when input validation fails"""
    pass


class MarketClosedError(DelphiGraphError):
    """Raised when attempting to submit prediction to a closed market"""
    pass


class APIError(DelphiGraphError):
    """Raised when API returns an error response"""
    def __init__(self, message: str, status_code: int = None, response_data: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data
