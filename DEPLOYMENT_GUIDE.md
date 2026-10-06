# Persona Detection System - Deployment Guide

**Target**: Production release of device cloaking system  
**Audience**: DevOps/Backend engineers  
**Duration**: 1-2 hours full deployment

---

## 📋 Pre-Deployment Checklist

- [ ] Supabase CLI installed locally
- [ ] Access to Supabase project dashboard
- [ ] iOS/Android dev environments set up
- [ ] GitHub access for merging
- [ ] Test devices (iPhone, Android)
- [ ] Payment processor configured (Razorpay)

---

## 🚀 Deployment Steps (5 Phases)

### Phase 1: Database Deployment (15 mins)

**1.1 Authenticate with Supabase**

```bash
cd /path/to/cloudlynk
supabase login
# Follow browser login flow
```

**1.2 Link to Your Project**

```bash
# Get project-ref from: https://app.supabase.com/[org]/projects
supabase link --project-ref YOUR_PROJECT_REF
# Enter password when prompted
```

**1.3 Deploy Database Migration**

```bash
# Option A: Use v2 schema (recommended - has helper functions)
supabase db push

# This will run: 20241006_add_persona_tables_v2.sql
# Creates: ENUMs, tables with proper constraints, RLS policies, helper functions
```

**Verify:** Check Supabase dashboard → SQL Editor

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Should see:
-- device_fingerprints
-- user_personas
-- user_install_source
-- persona_sessions
-- ip_reputation
-- security_events
```

**1.4 Generate TypeScript Types**

```bash
npm run db:types
# Creates: src/lib/database.types.ts
# Auto-updates for all new tables
```

---

### Phase 2: Edge Function Deployment (10 mins)

**2.1 Deploy Persona Classifier Function**

```bash
supabase functions deploy classify-persona --no-verify-jwt
# `--no-verify-jwt` allows client calls without JWT
```

**Verify:** Supabase Dashboard → Edge Functions → classify-persona

**2.2 Test Edge Function**

Use the Supabase test console or curl:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/classify-persona \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "fingerprint": {
      "deviceId": "device-abc",
      "isEmulator": true,
      "isDebugBuild": false,
      "isRooted": false,
      "platform": "iOS",
      "osVersion": "17.0",
      "manufacturer": "Apple",
      "model": "iPhone14",
      "installSource": "playstore"
    }
  }'

# Expected response:
# {
#   "persona": "reviewer",
#   "isFullAccessGranted": false,
#   "activationTime": null,
#   "riskScore": 0.35,
#   "needsAdminApproval": false,
#   "lastVerified": 1728230400000
# }
```

---

### Phase 3: App Integration (30 mins)

**3.1 Update Root Layout**

File: `src/app/_layout.tsx`

Add persona initialization:

```typescript
import { usePersona } from '@/features/persona/hooks/usePersona';

export default function RootLayout() {
  const { session, loading } = useAuth();
  const persona = usePersona(); // Initialize persona on app start

  // ... rest of layout
}
```

**3.2 Update Login Screen**

File: `src/app/(auth)/login.tsx` (already has login methods, add persona tracking)

```typescript
// Inside existing sign-in handlers
const continueAsGuest = async () => {
  await signInAsGuest();
  // Persona automatically initialized via useAuth hook
};

const continueWithGoogle = async () => {
  await signInWithGoogle();
  // Persona automatically initialized
};
```

**3.3 Add Persona Checks to Feed Screen**

File: `src/app/(tabs)/feed.tsx`

```typescript
import { ContentGate, SubscriptionExpiryBanner } from '@/features/persona/components/ContentGate';
import { usePersona } from '@/features/persona/hooks/usePersona';

export default function FeedScreen() {
  const { persona } = usePersona();

  return (
    <View>
      <SubscriptionExpiryBanner />
      
      <ContentGate requiredAccess="full">
        {/* Full content here - only shows for subscribed users */}
        <FeedContent />
      </ContentGate>
    </View>
  );
}
```

**3.4 Add to App Admin Routes**

File: `src/app/admin.tsx` (add route)

```typescript
<Stack.Screen 
  name="admin/user-approvals" 
  options={{ title: 'User Approvals' }} 
/>
```

---

### Phase 4: Testing (45 mins)

**4.1 Test on Emulator (Reviewer Mode)**

```bash
npm start
# Select iOS Simulator

# Expected behavior:
# 1. App detects simulator
# 2. "Reviewer Mode" badge shows
# 3. Safe content only visible
# 4. Full content shows preview placeholder
```

**4.2 Test on Physical Device (Organic Mode)**

```bash
# Build for physical device
npm run ios  # for iPhone
# OR
npm run android  # for Android phone

# Expected behavior:
# 1. Guest login works
# 2. "Organic User" or "Subscriber" badge shows
# 3. Preview content shows unlocking progress
# 4. After 48 hours, unlocking complete
```

**4.3 Test Subscription Flow**

```typescript
// Test with subscription manager
import { SubscriptionManager } from '@/subscription/SubscriptionManager';

await SubscriptionManager.subscribe(userId, 'gold', 'razorpay');
// Should:
// - Save to Supabase
// - Update PersonaStore
// - Show full content
// - Schedule expiry notifications
```

**4.4 Test Admin Approval**

1. Create organic user in test DB
2. Mark as `needs_admin_approval: true`
3. Load admin screen
4. Should show pending approval
5. Click approve
6. Should unlock access

**4.5 Verify Security Events**

```sql
-- Check security audit log
SELECT * FROM security_events 
ORDER BY created_at DESC 
LIMIT 10;

-- Should see persona classification events
```

---

### Phase 5: Production Release (30 mins)

**5.1 Create Release Branch**

```bash
git checkout -b release/persona-detection
git add -A
git commit -m "Deploy: Persona detection system

- Device fingerprinting with emulator/root detection
- Multi-layer persona classification (organic/inorganic/reviewer)
- 48-hour delayed activation for organic users
- Subscription management with auto-expiry
- Push notifications for expiry alerts
- Row-level security on all tables
- Device-bound session tokens
- Comprehensive audit logging"
```

**5.2 Deploy to Staging**

```bash
# Build staging APK/IPA
eas build --platform ios --profile staging
eas build --platform android --profile staging

# Test on TestFlight/Google Play Console beta
```

**5.3 Monitor Metrics**

Setup monitoring dashboards:

```sql
-- Active users by persona
SELECT persona, COUNT(*) as count 
FROM user_personas 
GROUP BY persona;

-- Subscription metrics
SELECT status, COUNT(*) as count 
FROM subscriptions 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;

-- Risk score distribution
SELECT 
  CASE 
    WHEN risk_score < 0.3 THEN 'Low'
    WHEN risk_score < 0.6 THEN 'Medium'
    ELSE 'High'
  END as risk_level,
  COUNT(*) as count
FROM device_fingerprints
GROUP BY risk_level;
```

**5.4 Production Deploy**

```bash
# Final builds for production
eas build --platform ios --profile production
eas submit --platform ios

eas build --platform android --profile production  
eas submit --platform android

# Monitor real-time events
```

**5.5 Rollback Plan**

If issues occur:

```bash
# Revert to previous schema version
supabase db reset  # Development only

# Disable persona checks (fallback)
# Comment out ContentGate in feed screen
# Fall back to safe content for all users

# Re-deploy bugfix
```

---

## 🔧 Configuration

### Supabase Secrets

Set these in Supabase dashboard → Settings → Secrets:

```
# For edge functions
API_SECRET_KEY=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
PUSH_NOTIFICATION_KEY=your-expo-token
```

### Environment Variables

Add to `app.config.js`:

```javascript
extra: {
  classifyPersonaUrl: process.env.CLASSIFY_PERSONA_URL || 
    'https://YOUR_PROJECT.supabase.co/functions/v1/classify-persona',
  subscriptionWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
}
```

---

## 📊 Post-Deployment Verification

**Immediately after deploy (1st hour):**

- [ ] No crashes in Sentry
- [ ] Persona classification working
- [ ] Notifications sending
- [ ] Subscriptions processing

**Daily (1st week):**

- [ ] Review security events log
- [ ] Check persona distribution
- [ ] Monitor false positives
- [ ] Test on different devices

**Weekly (ongoing):**

- [ ] Update IP reputation ranges
- [ ] Review admin approvals
- [ ] Check expiry notifications
- [ ] Monitor support tickets

---

## 🚨 Emergency Procedures

### If persona classification breaks

```sql
-- Manually classify users as safe mode
UPDATE user_personas 
SET persona = 'reviewer'
WHERE last_verified < NOW() - INTERVAL '1 hour';
```

### If subscriptions stop working

1. Check edge function logs
2. Verify Razorpay webhook connected
3. Test with test payment method
4. Manually update subscription status

### If device fingerprinting fails

Fall back to auth-only mode:

```typescript
// In AuthManager
// Skip fingerprinting if it fails
const fingerprint = await DeviceFingerprintManager.getFingerprint()
  .catch(() => null);

// Continue with auth
```

---

## 📈 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Persona classification | <300ms | TBD |
| Device fingerprint | <100ms | TBD |
| Subscription check | <150ms | TBD |
| Admin load time | <2s | TBD |
| False positive rate | <2% | TBD |

---

## 🔐 Security Validation

Run this query post-deploy to verify RLS:

```sql
-- Verify RLS is enabled on all persona tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables 
WHERE tablename LIKE '%persona%'
  OR tablename LIKE '%fingerprint%'
  OR tablename LIKE '%session%';

-- Should show: rowsecurity = TRUE for all
```

---

## 📞 Support Resources

- **Supabase Docs**: https://supabase.com/docs
- **Edge Functions**: https://supabase.com/docs/guides/functions
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security
- **Expo Docs**: https://docs.expo.dev

---

## ✅ Deployment Checklist

**Pre-Deploy:**
- [ ] Code reviewed and merged to main
- [ ] Tests passing
- [ ] No uncommitted changes
- [ ] Backup of current database

**During Deploy:**
- [ ] Migration successful
- [ ] Edge function tests pass
- [ ] App builds without errors
- [ ] All TypeScript errors fixed

**Post-Deploy:**
- [ ] Monitored first 24 hours
- [ ] No critical errors
- [ ] Persona classification working
- [ ] Subscriptions processing
- [ ] Admin approvals functional

---

**Estimated Total Time**: 1.5 - 2 hours  
**Required Expertise**: DevOps, Backend, Mobile  
**Risk Level**: Low (feature flagged behind login)

Ready to deploy? 🚀
