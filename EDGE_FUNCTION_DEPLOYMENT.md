# Edge Function Deployment Guide

## Overview
The `classify-persona` edge function handles server-side persona classification for the device cloaking system. It must be deployed to your Supabase project.

**Function Location**: `supabase/functions/classify-persona/index.ts`  
**Project ID**: `wdtwjiixuueqejfraaod`  
**Endpoint**: `https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/classify-persona`

---

## Option 1: Deploy via Supabase Dashboard (Recommended for GUI users)

### Steps:
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select project: `cloud` (wdtwjiixuueqejfraaod)
3. Go to **Functions** → **Create a New Function**
4. Name: `classify-persona`
5. Copy the entire content from `supabase/functions/classify-persona/index.ts`
6. Paste into the editor
7. Click **Deploy**
8. Verify the endpoint is active

---

## Option 2: Deploy via Supabase CLI (Recommended for developers)

### Prerequisites:
```bash
npm install -g supabase
# OR
npm install --save-dev supabase
```

### Authentication:
```bash
# Login to Supabase
supabase login

# You'll be prompted to create an access token at:
# https://app.supabase.com/account/tokens

# Create a token with "Functions Admin" permission
# Paste the token when prompted
```

### Link Project:
```bash
cd C:\Users\MIT\Projects\cloudlynk
supabase link --project-ref wdtwjiixuueqejfraaod
```

### Deploy Function:
```bash
supabase functions deploy classify-persona
```

### Verify Deployment:
```bash
supabase functions list
# Should show: classify-persona (active)
```

---

## Option 3: Manual cURL Deployment

### 1. Get Access Token
Create a token at: https://app.supabase.com/account/tokens
- Give it "Functions Admin" permission
- Copy the token

### 2. Deploy the Function
```bash
curl -X POST \
  https://api.supabase.io/v1/projects/wdtwjiixuueqejfraaod/functions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "classify-persona",
    "slug": "classify-persona",
    "body": "$(cat supabase/functions/classify-persona/index.ts)"
  }'
```

---

## Testing the Deployed Function

### From Client (TypeScript/React):
```typescript
const response = await fetch(
  'https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/classify-persona',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      userId: 'test-user-123',
      fingerprint: {
        deviceId: 'device-abc123',
        isEmulator: false,
        isRooted: false,
        isDebugBuild: false,
        platform: 'android',
        osVersion: '14',
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        installSource: 'playstore',
      },
    }),
  }
);

const result = await response.json();
console.log(result);
// Expected response:
// {
//   persona: "organic",
//   isFullAccessGranted: false,
//   activationTime: 1728259200000,
//   riskScore: 0.15,
//   needsAdminApproval: true,
//   lastVerified: 1728259200000,
//   sessionToken: "..."
// }
```

### From Command Line (with Auth Token):
```bash
curl -X POST \
  https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/classify-persona \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "userId": "test-user-123",
    "fingerprint": {
      "deviceId": "device-abc123",
      "isEmulator": false,
      "isRooted": false,
      "isDebugBuild": false,
      "platform": "android",
      "osVersion": "14",
      "manufacturer": "Samsung",
      "model": "Galaxy S21",
      "installSource": "playstore"
    }
  }'
```

---

## Function Features

### Input Validation
- ✅ Validates userId is present
- ✅ Validates fingerprint structure
- ✅ Validates attestation token format

### Classification Logic
The function uses multi-layer risk scoring:

**Risk Factors:**
- Emulator detected: +0.35
- Rooted device: +0.25
- Debug build: +0.15
- Cloud provider IP: +0.20
- Bot user agent: +0.20

**Classification:**
- Risk score > 0.65 → **Reviewer** (preview only)
- Organic install source → **Organic** (needs approval)
- Other sources → **Inorganic** (instant access)

### Outputs
| Field | Type | Description |
|-------|------|-------------|
| persona | string | 'organic', 'inorganic', or 'reviewer' |
| isFullAccessGranted | boolean | Can access full content |
| activationTime | number | 48-hour activation timestamp |
| riskScore | number | 0-1 risk assessment |
| needsAdminApproval | boolean | Requires admin review |
| lastVerified | number | Verification timestamp |
| sessionToken | string | Device-bound session token |

### Security Features
- ✅ Server-side only (never trust client)
- ✅ Device binding via SHA256 hash
- ✅ All decisions audited in security_events table
- ✅ Safe defaults (reviewer mode on error)
- ✅ Input validation on all parameters
- ✅ Rate limiting ready

---

## Environment Variables

The function automatically reads from Supabase secrets:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for database writes)

These are automatically available in edge functions.

---

## Deployment Checklist

- [ ] Access token created with "Functions Admin" permission
- [ ] Project linked via `supabase link`
- [ ] Function code reviewed (index.ts)
- [ ] No TypeScript errors in function code
- [ ] Function deployed successfully
- [ ] Endpoint returns 200 OK for OPTIONS request
- [ ] POST request to endpoint returns valid JSON
- [ ] Persona classification working correctly
- [ ] Error handling verified
- [ ] Audit logging to security_events table confirmed

---

## Troubleshooting

### Issue: "Unauthorized" Error
**Solution:**
1. Create new access token at https://app.supabase.com/account/tokens
2. Token needs "Functions Admin" permission
3. Use `supabase login` and paste fresh token

### Issue: "Project not found"
**Solution:**
- Verify project ID: `wdtwjiixuueqejfraaod`
- Check you're in the correct organization
- Ensure project is ACTIVE in dashboard

### Issue: 404 on function endpoint
**Solution:**
- Verify function name is exactly `classify-persona` (case-sensitive)
- Check function status in dashboard (should be green)
- Wait a few seconds after deployment, then retry

### Issue: 500 Error from function
**Solution:**
1. Check function logs in Supabase dashboard
2. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
3. Ensure database tables exist (security_events, user_personas)
4. Check request body matches PersonaRequest interface

### Issue: Function returns "not found"
**Solution:**
- Ensure edge function deployment completed successfully
- Check no typos in function name
- Refresh Supabase dashboard
- Try `supabase functions list` to verify

---

## Next Steps After Deployment

1. **Verify Function Works**
   - Test with curl or PostMan
   - Confirm returns valid persona classification

2. **Update App Configuration**
   - Ensure `supabaseUrl` is correct in app
   - Edge function endpoint is auto-built from URL

3. **Test End-to-End**
   - Run app on iOS simulator
   - Run app on Android emulator
   - Test with physical devices

4. **Monitor Function**
   - Check Supabase function logs regularly
   - Monitor invocation count and latency
   - Set up error alerts in Supabase dashboard

---

## Success Criteria

✅ Function deployed and active  
✅ Function endpoint accessible  
✅ POST request returns valid JSON  
✅ Persona classification logic working  
✅ Risk score calculation correct  
✅ Audit events logged to database  
✅ Error handling on edge cases  
✅ Performance < 300ms per request  

---

**Estimated Time**: 5-10 minutes  
**Difficulty**: Easy (copy-paste in dashboard)  
**Risk Level**: Low (no database changes, only data reads)

Once deployed, the edge function will automatically handle all persona classifications for the app.
