# Configuration Fields Reference

This document explains all configuration fields in `config.json`.

## Required Fields

### api_key
- **Type**: String
- **Required**: Yes
- **Minimum Length**: 32 characters
- **Description**: Your AgentOracle API key for authentication
- **How to Get**: Visit the AgentOracle platform settings page to generate
- **Example**: `"172b1350-e6fc-469a-b7d9-5b6721d0319e"`

## Optional Fields

### base_url
- **Type**: String
- **Required**: No
- **Default**: `"https://api.agentoracle.com"`
- **Description**: Base URL for the AgentOracle API
- **Requirements**: Must use HTTP or HTTPS protocol
- **Local Development**: Use `"http://localhost:3000"` when running frontend locally
- **Production**: Use your deployed Supabase URL or production domain
- **Example**: `"http://localhost:3000"`

### poll_interval
- **Type**: Integer
- **Required**: No
- **Default**: `180` (3 minutes)
- **Unit**: Seconds
- **Minimum**: 60 seconds
- **Description**: Base interval for background daemon to poll for tasks
- **Note**: Actual interval varies randomly within ±30 seconds to prevent request storms
- **Example**: `180`

### vector_db_path
- **Type**: String or null
- **Required**: No
- **Default**: `"~/.openclaw/vector_db"`
- **Description**: Path to OpenClaw vector database file
- **Purpose**: Collects memory entropy statistics (file size and chunk count only)
- **Privacy**: Does NOT read actual content or embeddings
- **If OpenClaw Not Installed**: Set to `null`
- **Example**: `"~/.openclaw/vector_db"` or `null`

### conversation_log_path
- **Type**: String or null
- **Required**: No
- **Default**: `"~/.openclaw/conversations.log"`
- **Description**: Path to OpenClaw conversation log file
- **Purpose**: Counts user interaction frequency (last 7 days)
- **Privacy**: Does NOT read message content
- **If OpenClaw Not Installed**: Set to `null`
- **Example**: `"~/.openclaw/conversations.log"` or `null`

## Privacy Protection

The plugin strictly protects user privacy:

1. **PII Sanitization**: All prediction text is automatically sanitized to remove personally identifiable information
2. **Metadata Only**: Vector database collection only gathers statistical metadata, never actual content
3. **Interaction Counting**: Conversation logs only count interactions, never read message content
4. **Secure Storage**: API_KEY is stored locally with file permissions set to 0600 (owner read/write only)
5. **Log Filtering**: Log output automatically filters sensitive information

## Configuration Examples

### Example 1: Local Development (No OpenClaw)
```json
{
  "api_key": "172b1350-e6fc-469a-b7d9-5b6721d0319e",
  "base_url": "http://localhost:3000",
  "poll_interval": 180,
  "vector_db_path": null,
  "conversation_log_path": null
}
```

### Example 2: Local Development (With OpenClaw)
```json
{
  "api_key": "172b1350-e6fc-469a-b7d9-5b6721d0319e",
  "base_url": "http://localhost:3000",
  "poll_interval": 180,
  "vector_db_path": "~/.openclaw/vector_db",
  "conversation_log_path": "~/.openclaw/conversations.log"
}
```

### Example 3: Production Deployment
```json
{
  "api_key": "172b1350-e6fc-469a-b7d9-5b6721d0319e",
  "base_url": "https://your-project.supabase.co",
  "poll_interval": 180,
  "vector_db_path": "~/.openclaw/vector_db",
  "conversation_log_path": "~/.openclaw/conversations.log"
}
```

## Setup Instructions

1. Copy `config.json.example` to `config.json`:
   ```bash
   cp config.json.example config.json
   ```

2. Edit `config.json` and replace `api_key` with your actual API key

3. Adjust `base_url` based on your environment:
   - Local development: `http://localhost:3000`
   - Production: Your deployed URL

4. If you don't have OpenClaw installed, set paths to `null`:
   ```json
   "vector_db_path": null,
   "conversation_log_path": null
   ```

5. Start the plugin:
   ```bash
   python -m openclaw_agentoracle_plugin.skill
   ```

## Troubleshooting

### JSON Parse Error
- **Problem**: `JSONDecodeError: Expecting property name enclosed in double quotes`
- **Cause**: JSON format error (comments, trailing commas, etc.)
- **Solution**: Ensure `config.json` is valid JSON (no comments, no trailing commas)

### Encoding Error
- **Problem**: `UnicodeDecodeError: 'gbk' codec can't decode`
- **Cause**: File encoding mismatch
- **Solution**: Ensure `config.json` is saved with UTF-8 encoding

### Invalid API Key
- **Problem**: `Invalid API_KEY format`
- **Cause**: API key is less than 32 characters
- **Solution**: Get a valid API key from AgentOracle settings page
