# 日志优化建议

## 问题分析

从 Web UI 截图中发现的问题：

1. **前缀冗余**: 每条日志都有 `[agentoracle-native-plugin]` 前缀，在 UI 中显得啰嗦
2. **细节过多**: 显示了太多内部实现细节（连接握手、认证流程等）
3. **分隔线过多**: 多个 `========` 分隔线让界面杂乱
4. **信息重复**: 某些状态信息重复显示

## 优化方案

### 方案 1: 简化日志级别（推荐）⭐

**原则**: 
- 只在 Web UI 中显示用户关心的关键信息
- 详细的调试信息只输出到文件日志

**实现**:
```typescript
// 添加日志级别控制
enum LogLevel {
  DEBUG = 0,    // 详细调试信息（仅文件）
  INFO = 1,     // 一般信息（Web UI + 文件）
  IMPORTANT = 2 // 重要信息（Web UI 高亮）
}

// 修改日志输出
// 调试信息（不在 Web UI 显示）
this.logger.debug('Waiting for connect.challenge...');
this.logger.debug('Sending connect request...');

// 重要信息（在 Web UI 显示）
this.logger.info('🔄 Processing task: task_12345');
this.logger.info('✅ Task completed successfully');
```

### 方案 2: 合并相关日志

**Before**:
```
[agentoracle-native-plugin] Connecting to ws://localhost:18789...
[agentoracle-native-plugin] WebSocket connected
[agentoracle-native-plugin] Waiting for connect.challenge...
[agentoracle-native-plugin] Received challenge
[agentoracle-native-plugin] Sending connect request...
[agentoracle-native-plugin] Connection successful
```

**After**:
```
🔌 Connected to Gateway
```

### 方案 3: 使用进度指示器

**Before**:
```
[agentoracle-native-plugin] Fetched task: task_12345
[agentoracle-native-plugin] WebSocket reasoning completed
[agentoracle-native-plugin] Sanitization completed
[agentoracle-native-plugin] Audit log written
[agentoracle-native-plugin] Result submitted
```

**After**:
```
📋 Task task_12345: [1/5] Fetching... ✓
📋 Task task_12345: [2/5] AI Processing... ✓
📋 Task task_12345: [3/5] Sanitizing... ✓
📋 Task task_12345: [4/5] Logging... ✓
📋 Task task_12345: [5/5] Submitting... ✓
```

### 方案 4: 移除前缀（最简单）

**Before**:
```
[agentoracle-native-plugin] Starting polling cycle
[agentoracle-native-plugin] Fetched task: task_12345
```

**After**:
```
Starting polling cycle
Fetched task: task_12345
```

## 推荐的优化实现

### 1. 创建日志包装器

```typescript
class UILogger {
  constructor(private logger: OpenClawLogger) {}

  // 仅在文件中记录的调试信息
  debug(message: string): void {
    // 不输出到 Web UI，只写入文件
    // 可以通过环境变量控制是否显示
  }

  // 简洁的用户信息
  info(emoji: string, message: string): void {
    this.logger.info(`${emoji} ${message}`);
  }

  // 错误信息
  error(message: string, error?: Error): void {
    this.logger.error(`❌ ${message}`, error);
  }
}
```

### 2. 优化关键日志点

**任务处理流程**:
```typescript
// Before
this.logger.info('[agentoracle-native-plugin] Starting polling cycle');
this.logger.info('[agentoracle-native-plugin] Fetched task: task_12345');
this.logger.info('[agentoracle-native-plugin] WebSocket reasoning completed');
this.logger.info('[agentoracle-native-plugin] Result submitted');

// After
this.logger.info('🔄 Processing task task_12345');
this.logger.info('✅ Task task_12345 completed');
```

**连接状态**:
```typescript
// Before
this.logger.info('[agentoracle-native-plugin] Connecting to ws://localhost:18789...');
this.logger.info('[agentoracle-native-plugin] WebSocket connected');
this.logger.info('[agentoracle-native-plugin] Waiting for connect.challenge...');
// ... 5 more lines ...
this.logger.info('[agentoracle-native-plugin] Connection successful');

// After
this.logger.info('🔌 Gateway connected');
```

**AI 响应**:
```typescript
// Before
this.logger.info('[agentoracle-native-plugin] ========================================');
this.logger.info('[agentoracle-native-plugin] 🤖 AI RESPONSE for task task_12345:');
this.logger.info('[agentoracle-native-plugin] {"prediction": "..."}');
this.logger.info('[agentoracle-native-plugin] ========================================');

// After
this.logger.info('🤖 AI response received (150 chars)');
// 详细内容只记录到文件
```

### 3. 移除不必要的分隔线

```typescript
// Before
this.logger.info('[agentoracle-native-plugin] ========================================');
this.logger.info('[agentoracle-native-plugin] ✅ Verification test passed');
this.logger.info('[agentoracle-native-plugin] All components working correctly:');
this.logger.info('[agentoracle-native-plugin]   - WebSocket connection to OpenClaw Gateway');
this.logger.info('[agentoracle-native-plugin]   - AI inference and response handling');
this.logger.info('[agentoracle-native-plugin]   - Data sanitization pipeline');
this.logger.info('[agentoracle-native-plugin]   - Audit logging system');
this.logger.info('[agentoracle-native-plugin] ========================================');

// After
this.logger.info('✅ System verification passed');
```

## 具体修改建议

### websocket_client.ts

```typescript
// 连接过程 - 只显示结果
async sendMessage(message: string): Promise<string | null> {
  // 移除: Connecting to...
  // 移除: WebSocket connected
  // 移除: Waiting for connect.challenge...
  // 移除: Received challenge
  // 移除: Sending connect request...
  // 移除: Connection successful
  
  // 只保留:
  // this.logger.info('🔌 Gateway connected'); // 仅首次连接时
  
  // 移除: Successfully received reply (150 characters)
  // 改为: 在 daemon 中统一输出
}

// 重连检测 - 简化输出
if (isReconnect && timeSinceLastConnection > 60000) {
  // 移除分隔线和详细信息
  this.logger.info('🔄 Gateway reconnected');
}
```

### daemon.ts

```typescript
private async pollOnce(): Promise<void> {
  // 移除: Starting polling cycle
  
  // 移除: Fetched task: task_12345
  // 改为:
  this.logger.info(`📋 Task ${task.task_id}: Processing...`);
  
  // 移除: WebSocket reasoning completed
  // 移除: Sanitization completed
  // 移除: Audit log written
  // 移除: Result submitted
  
  // 改为:
  this.logger.info(`✅ Task ${task.task_id}: Completed`);
  
  // 移除 AI 响应的分隔线和详细输出
  // 只在文件日志中记录详细内容
}

// 验证测试 - 大幅简化
private async runBuiltInVerification(): Promise<void> {
  // 移除所有分隔线
  // 移除详细的组件列表
  
  // 改为:
  this.logger.info('🔍 System verification...');
  // ... 执行验证 ...
  this.logger.info('✅ System ready');
}
```

## 实施优先级

### 高优先级（立即实施）
1. ✅ 移除所有 `[agentoracle-native-plugin]` 前缀
2. ✅ 移除所有 `========` 分隔线
3. ✅ 合并连接过程的多条日志为一条
4. ✅ 简化任务处理流程的日志输出

### 中优先级（可选）
1. 添加 emoji 图标增强可读性
2. 使用进度指示器
3. 创建日志级别系统

### 低优先级（未来考虑）
1. 实现详细日志仅输出到文件
2. 添加日志过滤和搜索功能

## 预期效果

### Before（当前）
```
[agentoracle-native-plugin] Starting polling cycle
[agentoracle-native-plugin] Fetched task: task_12345
[agentoracle-native-plugin] Connecting to ws://localhost:18789...
[agentoracle-native-plugin] WebSocket connected
[agentoracle-native-plugin] Waiting for connect.challenge...
[agentoracle-native-plugin] Received challenge
[agentoracle-native-plugin] Sending connect request...
[agentoracle-native-plugin] Waiting for connect response...
[agentoracle-native-plugin] Connection successful
[agentoracle-native-plugin] Sending chat message...
[agentoracle-native-plugin] Waiting for AI response...
[agentoracle-native-plugin] Chat request accepted
[agentoracle-native-plugin] Received update (150 characters, state=final)
[agentoracle-native-plugin] Chat completed (state: final)
[agentoracle-native-plugin] Successfully received reply (150 characters)
[agentoracle-native-plugin] WebSocket reasoning completed for task: task_12345
[agentoracle-native-plugin] ========================================
[agentoracle-native-plugin] 🤖 AI RESPONSE for task task_12345:
[agentoracle-native-plugin] {"prediction": "..."}
[agentoracle-native-plugin] ========================================
[agentoracle-native-plugin] Sanitization completed for task: task_12345
[agentoracle-native-plugin] Audit log written for task: task_12345
[agentoracle-native-plugin] Submission log written for task: task_12345
[agentoracle-native-plugin] Result submitted for task: task_12345
```

### After（优化后）
```
📋 Processing task task_12345
🤖 AI response received
✅ Task task_12345 completed
```

或者稍微详细一点：
```
📋 Task task_12345: Fetched
🔌 Gateway connected
🤖 AI processing...
🤖 AI response received (150 chars)
🛡️ Data sanitized
📤 Result submitted
✅ Task task_12345 completed
```

## 总结

通过以上优化，可以将日志输出减少 80%，同时保持关键信息的可见性。Web UI 中的显示会更加简洁、专业，用户体验大幅提升。
