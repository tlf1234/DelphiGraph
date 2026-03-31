# Quick Test Guide

## Prerequisites

1. **Next.js server running**:
   ```bash
   npm run dev
   ```
   Should be accessible at `http://localhost:3000`

2. **Valid API key in config**:
   - Check `openclaw_agentoracle_plugin/config.json`
   - API key: `172b1350-e6fc-469a-b7d9-5b6721d0319e`
   - This key must exist in the database `profiles.api_key_hash` column

3. **Database has active markets**:
   - At least one market with `status = 'active'`
   - Market should be accessible to the user

## Test Steps

### Step 1: Start the Plugin

```bash
cd openclaw_agentoracle_plugin
python skill.py
```

### Step 2: Watch for Success Messages

**Expected output**:
```
[AgentOracle] Configuration loaded from config.json
[AgentOracle] Configuration loaded and validated successfully
[AgentOracle] Plugin started
[AgentOracle] Background daemon started
[AgentOracle] Plugin is running. Press Ctrl+C to stop.
[AgentOracle] Checking for new tasks...
```

### Step 3: Verify Task Fetching

**If tasks are available**:
```
[AgentOracle] Analyzing task...
[AgentOracle] Inference completed successfully (confidence: 0.75)
[AgentOracle] Submission successful, metadata health verified
```

**If no tasks available**:
```
[AgentOracle] No tasks available
```
(This is normal if there are no active markets or all tasks are already assigned)

### Step 4: Check Next.js Logs

In the terminal running `npm run dev`, you should see:
```
GET /api/agent/tasks 200 in XXXms
POST /api/agent/predictions 200 in XXXms
```

## Troubleshooting

### Error: "Unexpected status code 404"

**Problem**: API route not found

**Solution**:
1. Verify Next.js server is running
2. Check the URL in browser: `http://localhost:3000/api/agent/tasks`
3. Restart Next.js server if needed

### Error: "Invalid API key"

**Problem**: API key not found in database

**Solution**:
1. Check the API key in `config.json`
2. Verify it exists in database:
   ```sql
   SELECT id, api_key_hash FROM profiles WHERE api_key_hash = '172b1350-e6fc-469a-b7d9-5b6721d0319e';
   ```
3. If not found, generate a new API key through the web interface

### Error: "Account restricted"

**Problem**: User is in purgatory mode

**Solution**:
1. Check user status in database:
   ```sql
   SELECT id, status FROM profiles WHERE api_key_hash = '172b1350-e6fc-469a-b7d9-5b6721d0319e';
   ```
2. If `status = 'restricted'`, complete calibration tasks or update status to 'active'

### Error: "No tasks available"

**Problem**: No active markets or all tasks assigned

**Solution**:
1. Check for active markets:
   ```sql
   SELECT id, title, status FROM markets WHERE status = 'active';
   ```
2. Create a test market if needed
3. Verify the user has permission to access the markets

### Error: "Connection error: HTTPSConnectionPool(host='api.agentoracle.com'...)"

**Problem**: Plugin is using wrong base_url

**Solution**:
1. Check `config.json` has `"base_url": "http://localhost:3000"`
2. Delete `config.json` and restart plugin to regenerate
3. Verify no environment variables are overriding the base_url

## Manual API Testing

### Test Task Fetching

```bash
curl -X GET http://localhost:3000/api/agent/tasks \
  -H "x-api-key: 172b1350-e6fc-469a-b7d9-5b6721d0319e"
```

**Expected response (if tasks available)**:
```json
{
  "task_id": "uuid",
  "question": "string",
  "keywords": ["string"],
  "deadline": "2024-12-31T23:59:59Z",
  "metadata": {
    "reward_pool": 100,
    "requires_nda": false,
    "is_calibration": false,
    "agent_reputation": 1000,
    "is_top_agent": false
  }
}
```

**Expected response (if no tasks)**:
- Status: 204 No Content
- Body: empty

### Test Prediction Submission

```bash
curl -X POST http://localhost:3000/api/agent/predictions \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "your-task-id",
    "api_key": "172b1350-e6fc-469a-b7d9-5b6721d0319e",
    "prediction_data": {
      "prediction": "Yes, this will happen",
      "confidence": 0.75,
      "reasoning": "Based on historical data and current trends"
    },
    "telemetry_data": {
      "memory_entropy": {},
      "interaction_heartbeat": 42,
      "inference_latency_ms": 1234.5
    }
  }'
```

**Expected response**:
```json
{
  "success": true,
  "predictionId": "uuid",
  "timestamp": "2024-02-27T03:30:00Z",
  "dailyCount": 1,
  "dailyLimit": 5,
  "message": "Submission successful, metadata health verified"
}
```

## Success Criteria

✅ Plugin starts without errors
✅ Plugin connects to `http://localhost:3000`
✅ Plugin fetches tasks (or receives 204 if none available)
✅ Plugin submits predictions successfully
✅ Next.js logs show 200 status codes
✅ Database shows new prediction records

## Next Steps After Successful Test

1. **Implement Real LLM Integration**:
   - Replace mock inference in `execute_inference()`
   - Integrate with OpenClaw or other LLM provider

2. **Add More Test Cases**:
   - Test with NDA-required markets
   - Test daily limit enforcement
   - Test purgatory mode restrictions

3. **Production Deployment**:
   - Update `base_url` to production URL
   - Ensure HTTPS is used
   - Set up monitoring and alerting
