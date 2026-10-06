# Testing & Maintenance Guide

**For**: QA Engineers, Senior Engineers  
**Purpose**: Testing strategy, maintenance procedures, monitoring setup

---

## 🧪 TESTING STRATEGY

### Unit Testing (Per Module)

#### AuthManager Tests
```typescript
describe('AuthManager', () => {
  test('loginAsGuest creates device fingerprint', async () => {
    const user = await AuthManager.loginAsGuest();
    expect(user.authMethod).toBe('guest');
    expect(user.id).toMatch(/^guest_/);
  });

  test('verifyPersona calls edge function', async () => {
    const persona = await AuthManager.verifyPersona('test-user-123');
    expect(persona.persona).toMatch(/^(reviewer|organic|inorganic)$/);
  });

  test('getCurrentUser returns cached user', async () => {
    const user1 = await AuthManager.getCurrentUser();
    const user2 = await AuthManager.getCurrentUser();
    expect(user1).toEqual(user2);
  });
});
```

#### SubscriptionManager Tests
```typescript
describe('SubscriptionManager', () => {
  test('subscribe creates record in Supabase', async () => {
    await SubscriptionManager.subscribe(userId, 'gold', 'razorpay');
    const sub = await SubscriptionManager.checkSubscription(userId);
    expect(sub?.plan).toBe('gold');
  });

  test('getDaysUntilExpiry calculates correctly', async () => {
    // Subscribe to 3-day trial
    await SubscriptionManager.subscribe(userId, 'trial', 'test');
    const days = await SubscriptionManager.getDaysUntilExpiry(userId);
    expect(days).toBe(3);
  });

  test('isActive returns false after expiry', async () => {
    // Mock date to after expiry
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-10'));
    
    const active = await SubscriptionManager.isActive(userId);
    expect(active).toBe(false);
  });
});
```

#### PersonaStore Tests
```typescript
describe('PersonaStore', () => {
  test('initializePersona loads persona from auth', async () => {
    await usePersonaStore.getState().initializePersona(userId);
    const state = usePersonaStore.getState();
    
    expect(state.persona).toBeDefined();
    expect(state.isLoading).toBe(false);
  });

  test('checkAccess returns false for reviewers', () => {
    const state = usePersonaStore.getState();
    state.persona = { persona: 'reviewer', ... };
    
    expect(state.checkAccess()).toBe(false);
  });

  test('checkAccess returns true for subscribers', () => {
    const state = usePersonaStore.getState();
    state.persona = { persona: 'organic', ... };
    state.isSubscribed = true;
    state.isActivated = true;
    
    expect(state.checkAccess()).toBe(true);
  });
});
```

**Command**: `npm test -- src/auth src/subscription src/lib/stores`

---

### Integration Testing (End-to-End Flows)

#### Login Flow
```typescript
describe('Login Flow', () => {
  test('Guest login → Persona verification → Content gated', async () => {
    // 1. Guest login
    const user = await AuthManager.loginAsGuest();
    expect(user.id).toBeDefined();

    // 2. Persona initialized
    await usePersonaStore.getState().initializePersona(user.id);
    const persona = usePersonaStore.getState().persona;
    expect(persona).toBeDefined();

    // 3. Check access
    const canAccess = usePersonaStore.getState().checkAccess();
    // Should be false for reviewers/organic unsubscribed
    expect(typeof canAccess).toBe('boolean');
  });

  test('Google login → Auto-approval for trusted users', async () => {
    // Requires mocking Firebase/Google OAuth
    // Skip in unit tests, do in E2E
  });
});
```

#### Subscription Flow
```typescript
describe('Subscription Flow', () => {
  test('Subscribe → Check active → Expire → Revert', async () => {
    const userId = 'test-user-123';

    // 1. Subscribe
    await SubscriptionManager.subscribe(userId, 'gold', 'razorpay');
    let isActive = await SubscriptionManager.isActive(userId);
    expect(isActive).toBe(true);

    // 2. Check access
    let daysLeft = await SubscriptionManager.getDaysUntilExpiry(userId);
    expect(daysLeft).toBe(30);

    // 3. Simulate expiry
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));

    // 4. Check expired
    isActive = await SubscriptionManager.isActive(userId);
    expect(isActive).toBe(false);
  });
});
```

#### Admin Approval Flow
```typescript
describe('Admin Approval', () => {
  test('Organic user needs approval → Admin approves → Access unlocked', async () => {
    const userId = 'test-organic-user';

    // 1. User detected as organic
    // Simulated by database setup

    // 2. Admin sees pending approval
    const { data: pending } = await supabase
      .from('user_personas')
      .select('*')
      .eq('needs_admin_approval', true);
    expect(pending?.length).toBeGreaterThan(0);

    // 3. Admin approves
    const { error } = await supabase
      .from('user_personas')
      .update({ 
        needs_admin_approval: false,
        admin_approved_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    expect(error).toBeNull();

    // 4. User can access (after 48hr activation)
    const persona = await AuthManager.getPersona();
    expect(persona.needsAdminApproval).toBe(false);
  });
});
```

---

### Manual Testing Checklist

#### Reviewer Mode (Emulator)
```
Simulator Setup:
1. Launch iOS Simulator
2. Guest login
3. VERIFY:
   - ✓ No crashes
   - ✓ "Reviewer Mode" badge shows
   - ✓ Safe content visible
   - ✓ Full content shows "Subscribe" prompt
   - ✓ Subscribe button opens plans
   - ✓ Can select plan (doesn't charge in dev)
   - ✓ Notifications permission asked
```

#### Organic User Mode (Physical Device)
```
Physical iPhone Setup:
1. Install from TestFlight
2. Guest login
3. Day 1-2:
   - ✓ "Unlocking..." progress shows (0-100%)
   - ✓ Preview content visible
   - ✓ Full content locked
   - ✓ Subscribe button works
4. After 48 hours:
   - ✓ "Unlocking complete" shows
   - ✓ Subscribe button still needed
5. After subscription:
   - ✓ Wait for admin approval message
   - ✓ Once approved, full access
```

#### Inorganic User Mode (Via Ad Link)
```
Ad Link Setup:
1. Create deep link: cloudlynk://app?utm_source=google_ads
2. Click link on device
3. VERIFY:
   - ✓ App opens
   - ✓ Redirects to login
   - ✓ Guest login works
   - ✓ Detected as "Inorganic User"
   - ✓ Subscribe button works
   - ✓ After payment, instant full access (no 48hr wait)
```

#### Subscription Expiry
```
Test Subscription Expiry:
1. Subscribe to 3-day trial
2. Day 0:
   - ✓ "3 days left" banner shows
3. Day 1:
   - ✓ "1 day left" banner shows
4. Day 2:
   - ✓ "Expired" banner shows
   - ✓ Notification sent
5. Day 3:
   - ✓ Content reverted to preview
   - ✓ "Renew subscription" shown
```

---

## 📊 MONITORING & METRICS

### Queries to Monitor (Run Weekly)

#### User Distribution by Persona
```sql
SELECT 
  persona, 
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM user_personas), 2) as percentage
FROM user_personas
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY persona
ORDER BY count DESC;

-- Expected: 
-- reviewer: 5-10%
-- organic: 40-60%
-- inorganic: 30-50%
```

#### Subscription Metrics
```sql
SELECT 
  plan_type,
  COUNT(*) as subscribers,
  ROUND(AVG(amount_paid), 2) as avg_value,
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'active') * 100.0 / COUNT(*), 
    2
  ) as active_percentage
FROM subscriptions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY plan_type
ORDER BY subscribers DESC;

-- Expected:
-- Gold and Platinum highest
-- 60-80% retention rate
```

#### Risk Score Distribution
```sql
SELECT 
  CASE 
    WHEN risk_score < 0.2 THEN 'Low (0-0.2)'
    WHEN risk_score < 0.4 THEN 'Medium (0.2-0.4)'
    WHEN risk_score < 0.7 THEN 'High (0.4-0.7)'
    ELSE 'Critical (0.7+)'
  END as risk_level,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM device_fingerprints), 2) as percentage
FROM device_fingerprints
WHERE last_seen > NOW() - INTERVAL '24 hours'
GROUP BY risk_level
ORDER BY risk_score;

-- Expected:
-- Most should be Low (normal users)
-- Some Medium (organic users)
-- Few High (reviewers/emulators)
```

#### Admin Approval Queue
```sql
SELECT 
  COUNT(*) as pending_count,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600), 
    1
  ) as avg_hours_pending
FROM user_personas
WHERE persona = 'organic'
  AND needs_admin_approval = TRUE
  AND admin_approved_at IS NULL;

-- Expected:
-- Should be 0 (all approved quickly)
-- If growing, admins not reviewing
```

#### Classification Accuracy
```sql
SELECT 
  persona,
  COUNT(*) as classified,
  risk_score,
  is_emulator,
  is_rooted,
  is_debug_build
FROM user_personas
LEFT JOIN device_fingerprints USING (user_id)
WHERE risk_score > 0.5
LIMIT 100;

-- Spot check: Do high-risk scores match emulator/rooted/debug?
-- Should align well (false positives < 5%)
```

### Alerts to Set Up

#### Critical Alerts (Page on-call)
```
1. Classification function errors
   - Monitor: supabase_edge_function_errors
   - Threshold: >5 errors/min
   - Action: Check edge function logs

2. RLS policy failures
   - Monitor: database_permission_errors
   - Threshold: >10 errors/min
   - Action: Review RLS policy changes

3. Subscription processing failures
   - Monitor: razorpay_webhook_failures
   - Threshold: >5 failures/min
   - Action: Check webhook integration
```

#### Warning Alerts (Daily review)
```
1. High false positive rate
   - Monitor: reviewer_classifications
   - Threshold: >10% rate increase
   - Action: Adjust risk thresholds

2. Admin approval backlog
   - Monitor: pending_approvals count
   - Threshold: >50 pending
   - Action: Notify admin team

3. Notification delivery failures
   - Monitor: expo_push_failures
   - Threshold: >5%
   - Action: Check expo push service
```

---

## 🔧 MAINTENANCE PROCEDURES

### Daily (Automated)
- ✅ Backup Supabase database
- ✅ Monitor error logs
- ✅ Check webhook deliveries

### Weekly (Manual)
- Run queries above
- Review security_events table
- Check false positive rate
- Verify no stuck subscriptions

### Monthly
- Update IP reputation ranges
```sql
-- Add new cloud provider ranges
INSERT INTO ip_reputation (ip_address, is_datacenter, category)
VALUES 
  ('160.0.0.0/8'::inet, true, 'cloud_linode'),
  ('167.0.0.0/8'::inet, true, 'cloud_digitalocean')
ON CONFLICT (ip_address) DO UPDATE SET last_checked = NOW();
```

- Review and update bot detection rules
- Analyze persona classification accuracy
- Adjust risk thresholds if needed

### Quarterly
- Performance optimization review
- Dependency updates
- Security audit
- Capacity planning

---

## 🐛 DEBUGGING GUIDE

### Issue: Persona Always Shows "Reviewer"

**Root Causes**:
1. Edge function returning 500
2. Risk score calculation broken
3. Classification threshold wrong

**Debug Steps**:
```typescript
// 1. Check edge function logs
// Supabase → Edge Functions → classify-persona → Logs

// 2. Test edge function directly
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/classify-persona \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-123",
    "fingerprint": {
      "deviceId": "device-123",
      "isEmulator": false,
      "isRooted": false,
      // ... rest of fingerprint
    }
  }'

// 3. Check database
SELECT * FROM user_personas WHERE user_id = 'test-123';
SELECT * FROM device_fingerprints WHERE user_id = 'test-123';
```

### Issue: Subscriptions Not Processing

**Root Causes**:
1. Razorpay webhook not configured
2. Database insert failing
3. User not exists

**Debug Steps**:
```typescript
// 1. Check webhook delivery
// Razorpay dashboard → Settings → Webhooks → Logs

// 2. Test subscription insert
const { data, error } = await supabase
  .from('subscriptions')
  .insert({
    user_id: 'test-user',
    plan_type: 'gold',
    status: 'active',
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
console.log({ data, error });

// 3. Check user exists
const user = await supabase.auth.getUser('test-user');
console.log({ user });
```

### Issue: Notifications Not Sending

**Root Causes**:
1. Permission not granted
2. Push token invalid/expired
3. Expo service down

**Debug Steps**:
```typescript
// 1. Check permission status
const { status } = await Notifications.requestPermissionsAsync();
console.log('Permission status:', status); // Should be 'granted'

// 2. Get push token
const token = await Notifications.getExpoPushTokenAsync();
console.log('Push token:', token);

// 3. Test send
const result = await Notifications.scheduleNotificationAsync({
  content: {
    title: 'Test',
    body: 'Test notification',
  },
  trigger: null,
});
console.log('Sent:', result);
```

---

## 📈 PERFORMANCE TARGETS

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Persona classification | <300ms | TBD | ⏳ |
| Device fingerprinting | <100ms | TBD | ⏳ |
| Subscription check | <150ms | TBD | ⏳ |
| Database query (indexed) | <50ms | TBD | ⏳ |
| Edge function cold start | <1s | TBD | ⏳ |
| Push notification delivery | <1s | TBD | ⏳ |

After deployment, monitor these and optimize if needed.

---

## ✅ MAINTENANCE CHECKLIST

### Weekly
- [ ] Run user distribution query
- [ ] Check security_events table
- [ ] Review pending approvals
- [ ] Verify notifications sending

### Monthly
- [ ] Update IP ranges
- [ ] Review false positives
- [ ] Analyze subscription metrics
- [ ] Check performance metrics

### Quarterly
- [ ] Full security audit
- [ ] Dependency updates
- [ ] Capacity planning
- [ ] Optimization review

---

## 🚀 ROLLOUT STRATEGY

### Phase 1: Staging (1 week)
- Deploy to staging environment
- Run full test suite
- Load test with simulated users
- Monitor for 24 hours

### Phase 2: Canary (1 week)
- Release to 10% of users
- Monitor error rates
- Check for false positives
- Verify notifications work

### Phase 3: General Availability (Ongoing)
- Release to 100% of users
- Ramp monitoring
- Daily reviews for 2 weeks
- Weekly reviews ongoing

---

**Testing Status**: ✅ Ready for implementation
**Maintenance**: ✅ Procedures documented
**Monitoring**: ✅ Queries and alerts defined
