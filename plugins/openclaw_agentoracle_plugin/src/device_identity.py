"""
OpenClaw 4.x Device Identity Implementation

Implements the official device pairing protocol required by OpenClaw 4.x.
This is the "proper" way to authenticate with Gateway.

Based on OpenClaw's device-identity.ts and device-pairing.ts
"""

import json
import base64
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class DeviceIdentity:
    """Manages device identity for OpenClaw Gateway authentication"""
    
    def __init__(self, identity_file: str = "device_identity.json"):
        """Initialize device identity manager.
        
        Args:
            identity_file: Path to store device identity (private key + device ID)
        """
        self.identity_file = Path(identity_file)
        self.logger = setup_logger()
        self.private_key: Optional[Ed25519PrivateKey] = None
        self.device_id: Optional[str] = None
        self.public_key_b64: Optional[str] = None
        
    def load_or_create_identity(self) -> Dict[str, str]:
        """Load existing identity or create new one.
        
        Returns:
            dict with 'deviceId', 'publicKey', 'privateKey' (for internal use)
        """
        if self.identity_file.exists():
            self.logger.info(f"[DeviceIdentity] 加载现有设备身份: {self.identity_file}")
            return self._load_identity()
        else:
            self.logger.info("[DeviceIdentity] 创建新设备身份...")
            return self._create_identity()
    
    def _create_identity(self) -> Dict[str, str]:
        """Create new Ed25519 key pair and device ID"""
        # Generate Ed25519 key pair
        self.private_key = Ed25519PrivateKey.generate()
        public_key = self.private_key.public_key()
        
        # Serialize public key to raw bytes
        public_key_bytes = public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
        
        # Base64url encode (OpenClaw format)
        self.public_key_b64 = base64.urlsafe_b64encode(public_key_bytes).decode('ascii').rstrip('=')
        
        # Derive device ID: SHA-256 hex digest of raw 32-byte public key
        self.device_id = hashlib.sha256(public_key_bytes).hexdigest()
        
        # Serialize private key for storage
        private_key_bytes = self.private_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption()
        )
        private_key_b64 = base64.urlsafe_b64encode(private_key_bytes).decode('ascii').rstrip('=')
        
        # Save to file
        identity_data = {
            "deviceId": self.device_id,
            "publicKey": self.public_key_b64,
            "privateKey": private_key_b64
        }
        
        self.identity_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.identity_file, 'w') as f:
            json.dump(identity_data, f, indent=2)
        
        self.logger.info(f"[DeviceIdentity] ✅ 设备身份已创建: {self.device_id[:16]}...")
        
        return identity_data
    
    def _load_identity(self) -> Dict[str, str]:
        """Load existing identity from file"""
        with open(self.identity_file, 'r') as f:
            identity_data = json.load(f)
        
        self.public_key_b64 = identity_data["publicKey"]
        
        # Restore private key
        private_key_b64 = identity_data["privateKey"]
        # Add padding if needed
        padding = 4 - (len(private_key_b64) % 4)
        if padding != 4:
            private_key_b64 += '=' * padding
        
        private_key_bytes = base64.urlsafe_b64decode(private_key_b64)
        self.private_key = Ed25519PrivateKey.from_private_bytes(private_key_bytes)
        
        # Always recompute device_id from public key to ensure correct hex format
        pub_key_padding = 4 - (len(self.public_key_b64) % 4)
        pub_key_b64_padded = self.public_key_b64 + ('=' * (pub_key_padding if pub_key_padding != 4 else 0))
        pub_key_bytes = base64.urlsafe_b64decode(pub_key_b64_padded)
        correct_device_id = hashlib.sha256(pub_key_bytes).hexdigest()
        
        stored_device_id = identity_data.get("deviceId", "")
        if stored_device_id != correct_device_id:
            self.logger.info(f"[DeviceIdentity] 🔧 修正 device_id 格式: {stored_device_id[:16]}... → {correct_device_id[:16]}...")
            identity_data["deviceId"] = correct_device_id
            with open(self.identity_file, 'w') as f:
                json.dump(identity_data, f, indent=2)
        
        self.device_id = correct_device_id
        self.logger.info(f"[DeviceIdentity] ✅ 设备身份已加载: {self.device_id[:16]}...")
        
        return identity_data
    
    def _normalize_metadata(self, value) -> str:
        """Normalize platform/deviceFamily for auth payload (ASCII lowercase, trimmed)."""
        if not value or not isinstance(value, str):
            return ""
        trimmed = value.strip()
        if not trimmed:
            return ""
        return trimmed.lower()

    def sign_connect_request(self, params: Dict[str, Any]) -> str:
        """Sign connect request parameters.
        
        Args:
            params: Connect request parameters including:
                - role: str
                - scopes: list[str]
                - signedAtMs: int (timestamp in MILLISECONDS)
                - token: Optional[str] (gateway_token)
                - nonce: str (from challenge)
                - clientId: str
                - clientMode: str
                - platform: str
                - deviceFamily: Optional[str]
        
        Returns:
            Base64url-encoded signature
        """
        if not self.private_key:
            raise ValueError("Device identity not loaded")
        
        # Build pipe-delimited payload matching OpenClaw's buildDeviceAuthPayloadV3:
        # "v3|deviceId|clientId|clientMode|role|scope1,scope2|signedAtMs|token|nonce|platform|deviceFamily"
        scopes_str = ",".join(params["scopes"])
        token_str = params.get("token") or ""
        platform_str = self._normalize_metadata(params.get("platform"))
        device_family_str = self._normalize_metadata(params.get("deviceFamily"))
        signed_at_ms = params["signedAtMs"]
        
        payload_parts = [
            "v3",
            self.device_id,
            params["clientId"],
            params["clientMode"],
            params["role"],
            scopes_str,
            str(signed_at_ms),
            token_str,
            params["nonce"],
            platform_str,
            device_family_str,
        ]
        payload_str = "|".join(payload_parts)
        payload_bytes = payload_str.encode('utf-8')
        
        # Sign with Ed25519
        signature_bytes = self.private_key.sign(payload_bytes)
        
        # Base64url encode (no padding)
        signature_b64 = base64.urlsafe_b64encode(signature_bytes).decode('ascii').rstrip('=')
        
        self.logger.debug(f"[DeviceIdentity] 签名 payload: {payload_str[:120]}...")
        
        return signature_b64
    
    def get_device_params(self, role: str, scopes: list, nonce: str, 
                         client_id: str, client_mode: str, platform: str,
                         gateway_token: Optional[str] = None,
                         device_family: Optional[str] = None) -> Dict[str, Any]:
        """Generate device authentication parameters for connect request.
        
        Returns:
            dict with 'device' field ready to include in connect params
        """
        import time
        
        # signedAt MUST be in milliseconds (Gateway uses Date.now() for comparison)
        signed_at_ms = int(time.time() * 1000)
        
        signature = self.sign_connect_request({
            "role": role,
            "scopes": scopes,
            "signedAtMs": signed_at_ms,
            "token": gateway_token,
            "nonce": nonce,
            "clientId": client_id,
            "clientMode": client_mode,
            "platform": platform,
            "deviceFamily": device_family
        })
        
        return {
            "device": {
                "id": self.device_id,
                "publicKey": self.public_key_b64,
                "signature": signature,
                "signedAt": signed_at_ms,
                "nonce": nonce
            }
        }


# Example usage
if __name__ == "__main__":
    # Create or load device identity
    device = DeviceIdentity("device_identity.json")
    identity = device.load_or_create_identity()
    
    print(f"Device ID: {identity['deviceId']}")
    print(f"Public Key: {identity['publicKey']}")
    
    # Generate device params for connect request
    device_params = device.get_device_params(
        role="operator",
        scopes=["operator.read", "operator.write"],
        nonce="test-nonce-12345",
        client_id="cli",
        client_mode="cli",
        platform="windows",
        gateway_token="your-gateway-token-here"
    )
    
    print(f"\nDevice params for connect request:")
    print(json.dumps(device_params, indent=2))
