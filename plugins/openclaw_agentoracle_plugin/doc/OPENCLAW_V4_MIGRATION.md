# OpenClaw Gateway 4.x WebSocket 接入完整指南

> **适用版本：** OpenClaw Gateway 4.x（Protocol v3）
> **适用插件：** `openclaw_agentoracle_plugin`（Python）

---

## 一、旧版为何失效

旧版插件（3.x 兼容写法）仅发送 token 认证，不携带 device identity：

```python
# 旧版核心写法（3.x 可用，4.x 失效）
connect_request["params"] = {
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "auth": {"token": GATEWAY_TOKEN}
    # ← 无 device 字段
}
# 现象：connect 握手成功，但 chat.send 报 missing scope: operator.write
```

**根本原因**：OpenClaw 4.x 在 `connect-policy.ts` 中引入了
`shouldClearUnboundScopesForMissingDeviceIdentity`，对所有使用
`token`/`password` 认证但**不携带 device identity 的客户端**，无条件清空 scopes：

```typescript
// Gateway 4.x 源码（connect-policy.ts）
return (
  decision.kind !== "allow" ||
  (!allowBypass &&
    !preserveInsecureLocalControlUiScopes &&
    (authMethod === "token" || authMethod === "password"))  // ← 始终命中
);
```

- 这是**架构设计**，不是配置问题
- `dangerouslyDisableDeviceAuth: true` 仅对 Control UI 客户端有效，对后端 WebSocket 客户端**无效**
- token 认证仍然需要，但单独依靠 token **永远无法**获得 scopes

---

## 二、唯一正确方案：Device Identity

这是 OpenClaw 4.x 官方设计的标准接入路径，与官方 native TypeScript 插件走相同代码逻辑，不会随版本更新被废弃。

---

## 三、插件安装与配置

### 1. 安装依赖

```bash
pip install cryptography>=41.0.0 websockets>=12.0
```

### 2. 配置文件（`config.json`）

复制 `config.json.example` 为 `config.json` 并填写以下字段：

```json
{
  "api_key": "your-api-key-from-settings-page",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "gateway_ws_url": "ws://127.0.0.1:18789",
  "gateway_token": "your-openclaw-gateway-token"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `api_key` | ✅ | 平台 API Key |
| `base_url` | ✅ | 平台后端地址 |
| `gateway_ws_url` | ✅ | OpenClaw Gateway WebSocket 地址，默认 `ws://127.0.0.1:18789` |
| `gateway_token` | ✅ | Gateway 认证 token（48 字符）|
| `poll_interval` | 可选 | 轮询间隔秒数，默认 180 |
| `agent_type` | 可选 | 进程管理类型，填 `"openclaw"` 或留 `null` |

> **Gateway token 获取**：在 OpenClaw 的 `openclaw.json` 配置文件中查找 `gateway.auth.token` 字段。

---

## 四、首次运行：设备配对

### 启动插件

```bash
# GUI 模式
python run_gui.py

# 命令行模式
python run.py
```

### 首次连接行为

插件启动后自动生成 `device_identity.json`（Ed25519 密钥对）并发起连接。

**场景 A：Gateway 与插件在同一台机器（本地连接）**

Gateway 识别为本地客户端，**静默自动配对**，无需任何手动操作，连接立即成功。

日志示例：
```
[DeviceIdentity] ✅ 设备身份已创建: a3f7e2b1c9d4...
[AgentOracle] 🔐 使用 Device Identity 认证（设备 ID: a3f7e2b1c9d4...）
[AgentOracle] ✅ 连接成功！
```

**场景 B：Gateway 在 WSL2，插件在 Windows（跨环境连接）**

Gateway 可能将连接识别为非本地，返回 `NOT_PAIRED` 错误。

日志示例：
```
[AgentOracle] ❌ 设备配对未完成！
[AgentOracle] 📋 配对请求 ID: req-xxxxxxxx
[AgentOracle] 👉 请在 OpenClaw Control UI 中批准此设备的配对请求，然后重试
```

**处理方式**：打开 OpenClaw Control UI → 找到待批准的配对请求 → 批准 → 重新启动插件。

### 已配对后

`device_identity.json` 持久保存，后续每次启动直接验签通过，无需再次配对。

---

## 五、device_identity.json 管理

文件位置：`src/device_identity.json`（与 `skill.py` 同目录）

```json
{
  "deviceId": "a3f7e2b1c9d4...",
  "publicKey": "Mzk4ZjE2YTQw...",
  "privateKey": "SENSITIVE-DO-NOT-SHARE"
}
```

| 操作 | 说明 |
|------|------|
| **保留** | 正常运行，无需处理 |
| **删除** | 触发重新生成新身份，需要重新配对 |
| **备份** | 换机器部署时可复制使用，无需重新配对 |
| **提交 Git** | ❌ **严禁**，包含私钥 |

---

## 六、关键技术细节（签名规范）

### 新旧版本差异

| 维度 | 旧版（3.x） | 新版（4.x 要求） |
|------|------------|----------------|
| **scopes 授予** | token 通过即授予 | 必须有 device identity + 配对 |
| **device_id 格式** | 无 | `hex(sha256(raw_32byte_pubkey))` |
| **签名 payload** | 无 | pipe 分隔字符串（v3 格式） |
| **signedAt 单位** | 无 | **毫秒**（`Date.now()` 兼容） |
| **nonce** | 仅接收 | 必须纳入签名 |

### v3 签名 payload 格式

```
v3|{deviceId}|{clientId}|{clientMode}|{role}|{scope1,scope2}|{signedAtMs}|{token}|{nonce}|{platform}|{deviceFamily}
```

**五个必须与 connect params 完全一致的字段**：`clientId`、`clientMode`、`scopes`、`auth.token`、`platform`。任何不一致均导致 `device signature invalid`。

### Gateway 内部验证流程

```
1. device.id == hex(sha256(base64url_decode(device.publicKey))) ?
2. |Date.now() - device.signedAt| <= SKEW_MS ?（signedAt 必须是毫秒）
3. device.nonce == connect.challenge.nonce ?
4. Ed25519 验签（先尝试 v3 payload，再降级 v2）
5. 设备配对检查：
   ├─ 未配对 + isLocalClient → 静默自动配对 → 继续
   ├─ 未配对 + 非本地 → NOT_PAIRED（需 Control UI 批准）
   └─ 已配对 → 验证 requestedScopes ⊆ approvedScopes → 继续
```

---

## 七、故障排查

| 错误信息 | 原因 | 解决方法 |
|---------|------|---------|
| `missing scope: operator.write` | 无 device identity | 确认 `use_device_identity=True`，检查 `device_identity.json` |
| `device identity mismatch` | device_id 格式错误 | 删除 `device_identity.json` 重新生成 |
| `device signature invalid` | 签名字段不一致 | 确认 payload 字段与 connect params 完全匹配 |
| `device signature expired` | signedAt 不是毫秒 | 检查 `device_identity.py` 中 `int(time.time() * 1000)` |
| `NOT_PAIRED` + requestId | 需要手动批准 | 在 Control UI 批准配对请求，重启插件 |
| `device nonce mismatch` | nonce 未从 challenge 获取 | 确认 nonce 来自当次 `connect.challenge` 消息 |
