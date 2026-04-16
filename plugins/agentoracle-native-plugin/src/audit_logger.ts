import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogEntry } from './types';

/**
 * 提交数据日志条目
 * 记录发送到 AgentOracle 平台的完整 UAP v3.0 payload
 * （与 openclaw_agentoracle_plugin/src/submission_logger.py 对齐）
 */
export interface SubmissionLogEntry {
  timestamp: string;
  taskId: string;
  taskQuestion: string;
  taskContext?: string;
  aiResponse: string;
  sanitizedResponse: string;
  /** 未脱敏的 UAP v3.0 payload（用于对比） */
  originalPayload?: Record<string, unknown>;
  /** 实际发送给平台的脱敏 UAP v3.0 payload */
  sanitizedPayload?: Record<string, unknown>;
  /** 向后兼容：旧字段，优先使用 sanitizedPayload */
  submittedData?: Record<string, unknown>;
}

/**
 * AuditLogger 类
 * 将脱敏前后的数据对比记录到本地文件，供用户审计
 */
export class AuditLogger {
  private readonly logDir: string;
  private readonly auditFile: string;
  private readonly submissionFile: string;

  constructor(logDirectory: string = '~/.openclaw/agentoracle_logs/') {
    // 处理 ~ 符号
    if (logDirectory.startsWith('~')) {
      logDirectory = path.join(os.homedir(), logDirectory.slice(1));
    }

    this.logDir = path.resolve(logDirectory);
    this.auditFile = path.join(this.logDir, 'audit.md');
    this.submissionFile = path.join(this.logDir, 'submissions.md');
  }

  /**
   * 记录审计日志（脱敏前后对比）
   * @param entry 日志条目
   */
  async log(entry: LogEntry): Promise<void> {
    try {
      // 确保日志目录存在
      await this.ensureLogDirectory();

      // 格式化日志条目
      const formattedEntry = this.formatEntry(entry);

      // 追加写入日志文件
      await fs.appendFile(this.auditFile, formattedEntry, 'utf-8');
    } catch (error) {
      // 日志写入失败不应阻塞主流程，仅记录错误
      console.error('[agentoracle-native-plugin] Failed to write audit log:', error);
    }
  }

  /**
   * 记录提交数据日志（发送到平台的完整数据）
   * @param entry 提交日志条目
   */
  async logSubmission(entry: SubmissionLogEntry): Promise<void> {
    try {
      // 确保日志目录存在
      await this.ensureLogDirectory();

      // 格式化提交日志条目
      const formattedEntry = this.formatSubmissionEntry(entry);

      // 追加写入提交日志文件
      await fs.appendFile(this.submissionFile, formattedEntry, 'utf-8');
    } catch (error) {
      // 日志写入失败不应阻塞主流程，仅记录错误
      console.error('[agentoracle-native-plugin] Failed to write submission log:', error);
    }
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      // 目录创建失败
      throw new Error(`Failed to create log directory: ${this.logDir}`);
    }
  }

  /**
   * 格式化日志条目为 Markdown
   * @param entry 日志条目
   * @returns 格式化后的 Markdown 字符串
   */
  private formatEntry(entry: LogEntry): string {
    return `
---

📅 **时间**: ${entry.timestamp}
🆔 **任务ID**: ${entry.taskId}

⚠️ **原始数据** (脱敏前):
\`\`\`json
${entry.original}
\`\`\`

🛡️ **脱敏数据** (已上传):
\`\`\`json
${entry.sanitized}
\`\`\`

---
`;
  }

  /**
   * 格式化提交日志条目为 Markdown（UAP v3.0）
   * 输出：任务信息 + AI 原始响应 + 脱敏后响应 + 两份 UAP payload 对比 + Raw JSON
   * @param entry 提交日志条目
   * @returns 格式化后的 Markdown 字符串
   */
  private formatSubmissionEntry(entry: SubmissionLogEntry): string {
    // 兼容旧字段名：优先使用 sanitizedPayload，fallback 到 submittedData
    const sanitizedPayload = entry.sanitizedPayload ?? entry.submittedData ?? {};
    const originalPayload = entry.originalPayload;
    
    return `
---

## 📤 UAP v3.0 数据提交记录

📅 **提交时间**: ${entry.timestamp}
🆔 **任务ID**: ${entry.taskId}
📋 **协议版本**: UAP v${(sanitizedPayload as { protocol_version?: string }).protocol_version ?? '3.0'}
🏷️ **提交状态**: ${(sanitizedPayload as { status?: string }).status ?? 'N/A'}
📊 **信号数量**: ${((sanitizedPayload as { signals?: unknown[] }).signals ?? []).length}

### 📋 任务信息

**问题**:
\`\`\`
${entry.taskQuestion}
\`\`\`

${entry.taskContext ? `**背景信息**:
\`\`\`
${entry.taskContext}
\`\`\`
` : ''}

### 🤖 AI 完整响应

\`\`\`
${entry.aiResponse}
\`\`\`

### 🛡️ 脱敏后的 AI 响应

\`\`\`
${entry.sanitizedResponse}
\`\`\`
${originalPayload ? `
### ⚠️ 原始 UAP v3.0 Payload（脱敏前，用于对比）

\`\`\`json
${JSON.stringify(originalPayload, null, 2)}
\`\`\`
` : ''}
### 📤 实际提交的 UAP v3.0 Payload（脱敏后）

\`\`\`json
${JSON.stringify(sanitizedPayload, null, 2)}
\`\`\`

---

`;
  }
}
