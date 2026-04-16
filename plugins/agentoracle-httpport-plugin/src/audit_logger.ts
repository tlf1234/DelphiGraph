import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogEntry } from './types';

export interface SubmissionLogEntry {
  timestamp: string;
  taskId: string;
  taskQuestion: string;
  taskContext?: string;
  aiResponse: string;
  sanitizedResponse: string;
  submittedData: Record<string, unknown>;
}

/**
 * AuditLogger
 * 将脱敏前后数据对比记录到本地文件，供用户审计
 */
export class AuditLogger {
  private readonly logDir: string;
  private readonly auditFile: string;
  private readonly submissionFile: string;

  constructor(logDirectory: string = '~/.openclaw/logs/agentoracle-httpport') {
    if (logDirectory.startsWith('~')) {
      logDirectory = path.join(os.homedir(), logDirectory.slice(1));
    }
    this.logDir        = path.resolve(logDirectory);
    this.auditFile     = path.join(this.logDir, 'audit.md');
    this.submissionFile = path.join(this.logDir, 'submissions.md');
  }

  async log(entry: LogEntry): Promise<void> {
    try {
      await this._ensureDir();
      await fs.appendFile(this.auditFile, this._formatEntry(entry), 'utf-8');
    } catch (err) {
      console.error('[agentoracle-httpportFailed to write audit log:', err);
    }
  }

  async logSubmission(entry: SubmissionLogEntry): Promise<void> {
    try {
      await this._ensureDir();
      await fs.appendFile(this.submissionFile, this._formatSubmission(entry), 'utf-8');
    } catch (err) {
      console.error('[agentoracle-httpportFailed to write submission log:', err);
    }
  }

  private async _ensureDir(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  private _formatEntry(entry: LogEntry): string {
    return `
---

📅 **时间**: ${entry.timestamp}
🆔 **任务ID**: ${entry.taskId}

⚠️ **原始数据** (脱敏前):
\`\`\`
${entry.original}
\`\`\`

🛡️ **脱敏数据** (已上传):
\`\`\`
${entry.sanitized}
\`\`\`

---
`;
  }

  private _formatSubmission(entry: SubmissionLogEntry): string {
    return `
---

## 📤 数据提交记录

📅 **提交时间**: ${entry.timestamp}
🆔 **任务ID**: ${entry.taskId}

### 📋 任务信息

**问题**:
\`\`\`
${entry.taskQuestion}
\`\`\`

${entry.taskContext ? `**背景信息**:\n\`\`\`\n${entry.taskContext}\n\`\`\`\n` : ''}

### 🤖 AI 完整响应

\`\`\`
${entry.aiResponse}
\`\`\`

### 🛡️ 脱敏后的预测结果

\`\`\`
${entry.sanitizedResponse}
\`\`\`

### 📤 实际提交到平台的数据

\`\`\`json
${JSON.stringify(entry.submittedData, null, 2)}
\`\`\`

---

`;
  }
}
