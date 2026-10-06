# Persona Detection Integration Checklist

**Status**: Phase 1 & 2 Ready  
**Last Updated**: 2026-10-06

---

## ✅ Completed

### Core Modules (Ready to use)
- [x] Device fingerprinting (`src/lib/fingerprint/deviceFingerprint.ts`)
- [x] Persona classification (`src/lib/persona/personaService.ts`)
- [x] SafetyNet/Play Integrity (`src/lib/persona/safetyNetAttestation.ts`)
- [x] Edge function stub (`supabase/functions/classify-persona/index.ts`)
- [x] Database migration (`supabase/migrations/20241006_add_persona_tables.sql`)

### Auth/Subscription/Notification (NEW - Just Created)
- [x] **AuthManager.ts** - One-click login (guest/Google/email)
- [x] **SubscriptionManager.ts** - 5 subscription tiers with auto-expiry
- [x] **NotificationManager.ts** - Push notifications for expiry, promos
- [x] **PersonaStore** - Global state management

---

## 📋 Integration Steps (4 Phases)

### Phase 1: Database Setup

```bash
# Prerequisites: Have supabase CLI installed
# Install: https://supabase.com/docs/guides/cli/getting-started

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy migration
supabase db push

# Deploy edge function
supabase functions deploy classify-persona

# Generate TypeScript types
npm run db:types
```

**Status**: Migration file syntax fixed ✅ | Awaiting CLI deployment

---

### Phase 2: Initialize Persona Store in App Layout

**File**: `src/app/_layout.tsx`

Add this at the top-level layout to initialize persona detection on app start:

```typescript
import { useEffect } from 'react';
import { usePersonaStore } from '@/lib/stores/personaStore';
import { NotificationManager } from '@/notifications/NotificationManager';
import { AuthManager } from '@/auth/AuthManager';

export default function RootLayout() {
  const { initializePersona } = usePersonaStore();

  useEffect(() => {
    const setupApp = async () => {
      // Initialize notifications
      await NotificationManager.initialize();

      // Check if user is authenticated
      const user = await AuthManager.getCurrentUser();
      if (user) {
        // Initialize persona tracking
        await initializePersona(user.id);
      }
    };

    setupApp();

    // Cleanup on unmount
    return () => {
      NotificationManager.cleanup();
    };
  }, [initializePersona]);

  return (
    // Your existing root layout...
  );
}
```

---

### Phase 3: Update Login Screen

**File**: `src/app/(auth)/login.tsx`

Replace with persona-aware login:

```typescript
import { AuthManager } from '@/auth/AuthManager';
import { usePersonaStore } from '@/lib/stores/personaStore';
import { router } from 'expo-router';

export default function LoginScreen() {
  const { initializePersona } = usePersonaStore();
  const [isLoading, setIsLoading] = useState(false);

  // Guest login
  const handleGuestLogin = async () => {
    try {
      setIsLoading(true);
      const user = await AuthManager.loginAsGuest();
      await initializePersona(user.id);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to login. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google login
  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      const user = await AuthManager.loginWithGoogle();
      await initializePersona(user.id);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to login with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  // Email login
  const handleEmailLogin = async (email: string) => {
    try {
      setIsLoading(true);
      await AuthManager.loginWithEmail(email);
      Alert.alert('Check your email for login link');
    } catch (error) {
      Alert.alert('Error', 'Failed to send login email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Your UI - add these buttons */}
      <Button
        title="Continue as Guest"
        onPress={handleGuestLogin}
        disabled={isLoading}
      />
      <Button
        title="Login with Google"
        onPress={handleGoogleLogin}
        disabled={isLoading}
      />
      {/* Email input + Button */}
    </View>
  );
}
```

---

### Phase 4: Add Conditional Content Rendering

**Pattern 1: Simple Persona Check (Preview vs Full)**

```typescript
import { usePersonaStore } from '@/lib/stores/personaStore';

export default function ContentScreen() {
  const { persona, isSubscribed, canAccessFullContent, activationProgress } =
    usePersonaStore();

  if (persona?.persona === 'reviewer') {
    return <SafeContentOnly />;
  }

  if (!isSubscribed) {
    return (
      <View>
        <PreviewContent />
        <Button title="Subscribe for full access" />
      </View>
    );
  }

  if (persona?.persona === 'organic' && !isSubscribed) {
    return (
      <View>
        <Text>Unlocking... {Math.round(activationProgress * 100)}%</Text>
        <PreviewContent />
        <AdminApprovalNotice />
      </View>
    );
  }

  if (canAccessFullContent) {
    return <FullContent />;
  }

  return <PreviewContent />;
}
```

**Pattern 2: Detailed Access Control**

```typescript
function canViewContent(contentType: string): boolean {
  const { persona, isSubscribed, isActivated, needsAdminApproval } =
    usePersonaStore.getState();

  // Reviewers can only see trailers
  if (persona?.persona === 'reviewer') {
    return contentType === 'trailer';
  }

  // Organic users need approval + activation + subscription
  if (persona?.persona === 'organic') {
    return isSubscribed && isActivated && !needsAdminApproval;
  }

  // Inorganic users need only subscription
  if (persona?.persona === 'inorganic') {
    return isSubscribed;
  }

  return false;
}
```

---

### Phase 5: Add Subscription UI

**File**: Create `src/screens/SubscriptionPlansScreen.tsx`

```typescript
import { SubscriptionManager } from '@/subscription/SubscriptionManager';
import { usePersonaStore } from '@/lib/stores/personaStore';

export default function SubscriptionPlansScreen() {
  const { updateSubscription } = usePersonaStore();
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    try {
      setIsSubscribing(plan);
      const user = await AuthManager.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // In real app: call payment processor here
      await SubscriptionManager.subscribe(user.id, plan, 'razorpay');

      // Update store
      await updateSubscription(user.id);

      Alert.alert('Success', 'Subscription activated!');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to subscribe');
    } finally {
      setIsSubscribing(null);
    }
  };

  return (
    <ScrollView>
      {Object.entries(SubscriptionManager.PLANS).map(([key, plan]) => (
        <PlanCard
          key={key}
          plan={plan}
          onSubscribe={() => handleSubscribe(key as SubscriptionPlan)}
          isLoading={isSubscribing === key}
        />
      ))}
    </ScrollView>
  );
}

function PlanCard({ plan, onSubscribe, isLoading }) {
  return (
    <View style={[styles.card, { borderColor: plan.color }]}>
      <Text style={styles.title}>{plan.displayName}</Text>
      <Text style={styles.price}>₹{plan.priceINR}</Text>
      <Text style={styles.duration}>{plan.duration} days</Text>

      {plan.features.map((feature) => (
        <View key={feature} style={styles.feature}>
          <Text>✓ {feature}</Text>
        </View>
      ))}

      <Button
        title={isLoading ? 'Processing...' : 'Subscribe'}
        onPress={onSubscribe}
        disabled={isLoading}
      />
    </View>
  );
}
```

---

### Phase 6: Admin Approval Interface

**File**: `src/app/admin/user-approvals.tsx`

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function UserApprovalsScreen() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    const { data } = await supabase
      .from('user_personas')
      .select('user_id, persona, risk_score, needs_admin_approval, created_at')
      .eq('persona', 'organic')
      .eq('needs_admin_approval', true)
      .is('admin_approved_at', null);

    setUsers(data || []);
  };

  const approveUser = async (userId: string) => {
    const { error } = await supabase
      .from('user_personas')
      .update({
        needs_admin_approval: false,
        admin_approved_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (!error) {
      Alert.alert('Success', 'User approved');
      fetchPendingUsers();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pending Approvals</Text>
      {users.map((user) => (
        <View key={user.user_id} style={styles.userCard}>
          <Text>User: {user.user_id.slice(0, 8)}...</Text>
          <Text>Risk Score: {(user.risk_score * 100).toFixed(0)}%</Text>
          <Button
            title="Approve"
            onPress={() => approveUser(user.user_id)}
          />
        </View>
      ))}
    </View>
  );
}
```

---

## 🔒 Security Checklist

- [ ] All persona checks happen server-side (edge function)
- [ ] Device fingerprint never changes (cached in secure storage)
- [ ] Session tokens are device-bound
- [ ] RLS policies restrict data access
- [ ] IP reputation checked for reviewer IP ranges
- [ ] Push token stored securely
- [ ] No credentials in client code

---

## 🧪 Testing Scenarios

### Test 1: Emulator (Should be Reviewer)
```
1. Launch on iOS Simulator
2. Login as guest
3. Should show "Reviewer Mode - Safe Content Only"
```

### Test 2: Organic User (48-Hour Delay)
```
1. Install on physical iOS device
2. Login as guest (detected as organic via app store)
3. Day 1-2: Shows "Unlocking..." progress
4. Day 2: After 48hrs, unlock option appears
5. After subscription: Full access
```

### Test 3: Ads User (Instant Access)
```
1. Deep link from Google Ads campaign
2. System detects referrer = 'ads'
3. After subscription: Immediate full access
```

### Test 4: Expiry Notifications
```
1. Subscribe to 3-day trial
2. Day 1: (watch for notification)
3. Day 2: Notification "1 day left"
4. Day 3: Notification "Expired"
5. Access reverts to preview
```

---

## 📝 Next Steps

1. **Run Database Migration**
   ```bash
   supabase db push
   ```

2. **Deploy Edge Function**
   ```bash
   supabase functions deploy classify-persona
   ```

3. **Test Auth Integration**
   - Test guest login
   - Test Google login
   - Test email OTP

4. **Test Persona Detection**
   - Run on emulator (should be reviewer)
   - Run on physical device (should be organic)
   - Monitor security_events table

5. **Wire Content Screens**
   - Add persona checks to feed screen
   - Add persona checks to content detail
   - Add subscription prompt

6. **Test Subscription Flow**
   - Subscribe to plan
   - Verify access granted
   - Wait for expiry notifications
   - Verify access revoked

---

## 📞 Troubleshooting

**Q: "Device fingerprint always changes"**  
A: Make sure fingerprint is cached in secure storage. Check `DeviceFingerprintManager.getFingerprint()`.

**Q: "Persona always shows 'reviewer'"**  
A: Check edge function logs in Supabase dashboard. May be classifier threshold too high.

**Q: "Notifications not sending"**  
A: Verify push token permission granted. Check `NotificationManager.initialize()`.

**Q: "Subscription not persisting"**  
A: Verify subscriptions table has correct user_id FK. Check RLS policies allow inserts.

---

## 📊 Key Files

- Core: `src/auth/AuthManager.ts`, `src/subscription/SubscriptionManager.ts`
- State: `src/lib/stores/personaStore.ts`
- Notifications: `src/notifications/NotificationManager.ts`
- Database: `supabase/migrations/20241006_add_persona_tables.sql`
- Backend: `supabase/functions/classify-persona/index.ts`

---

**Questions?** Refer to `PERSONA_INTEGRATION_GUIDE.md` and `CLOAKING_SYSTEM_INTEGRATION.md` for deeper details.
