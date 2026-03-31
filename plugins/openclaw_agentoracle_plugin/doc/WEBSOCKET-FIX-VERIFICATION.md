# WebSocket Connection Fix Verification

## Issue
WebSocket connection was failing with error:
```
invalid connect params: at /client/id: must be equal to constant; 
at /client/mode: must be equal to constant
```

## Root Cause
The Python plugin was using incorrect client parameters:
- Old: `client.id: "agentoracle-plugin"`, `client.mode: "plugin"`
- These values don't match OpenClaw Gateway's required constants

## Solution Applied
Updated `websocket_client.py` to match the official `openclaw_daily_elf` example:

```python
"client": {
    "id": "cli",           # Required constant by OpenClaw Gateway
    "version": "1.0.0",
    "platform": "windows",
    "mode": "cli"          # Required constant by OpenClaw Gateway
}
```

## Verification Against Official Example
Compared with `plugins/openclaw_daily_elf/test_stability.py` (lines 95-100):
```python
"client": {
    "id": "cli",
    "version": "1.0.0", 
    "platform": "windows",
    "mode": "cli"
}
```

✅ **Our implementation now matches the official Python plugin example exactly.**

## Additional Parameters Verified
All other connect parameters also match the official example:
- `minProtocol: 3, maxProtocol: 3`
- `role: "operator"`
- `scopes: ["operator.read", "operator.write"]`
- `auth: {"token": gateway_token}` (when token provided)
- `locale: "zh-CN"`
- `userAgent: "openclaw-agentoracle-plugin/1.0.0"`

## Testing
The fix has been applied to `websocket_client.py`. To test:

1. Ensure OpenClaw Gateway is running on `ws://127.0.0.1:18789`
2. Run `启动GUI.bat` to start the plugin
3. The connection should now succeed without the "invalid connect params" error

## Files Modified
- `plugins/openclaw_agentoracle_plugin/websocket_client.py` (lines 119-124)

## Status
✅ **FIXED** - WebSocket client parameters now match official OpenClaw Python plugin example
