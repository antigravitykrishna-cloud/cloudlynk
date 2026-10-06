# Persona Detection Integration Guide

## Overview
This guide shows how to integrate the device cloaking/persona detection system into your existing Cloudlynk app.

## What Was Created

### 1. **Core Modules** (`src/lib/`)
- **`fingerprint/deviceFingerprint.ts`** - Device detection (emulator, root, debug)
- **`persona/personaService.ts`** - Persona classification logic
- **`persona/safetyNetAttestation.ts`** - Device integrity verification
- **`migrations/20241006_add_persona_tables.sql`** - Database schema
- **`supabase/functions/classify-persona/index.ts`** - Server-side classification

## Integration Steps

### Step 1: Deploy Supabase Migration
```bash
# Copy the SQL file to your supabase migrations folder
# Then run:
supabase migration up
```

### Step 2: Create Supabase Edge Function
```bash
# Deploy the classify-persona function
supabase functions deploy classify-persona
```

### Step 3: Modify Auth Flow (src/app/(auth)/login.tsx)

```typescript
import { PersonaService } from '@/lib/persona/personaService';
import { useAppStore } from '@/lib/stores/appStore'; // Your existing store

export default function LoginScreen() {
  const appStore = useAppStore();

  const handleLoginSuccess = async (userId: string) => {
    try {
      // After successful login, verify persona
      const personaState = await PersonaService.verifyPersona(userId);
      
      // Store persona state in your app store
      appStore.setPersonaState(personaState);
      
      // If organic user, show admin approval notice
      if (personaState.persona === 'organic') {
        appStore.showAdminApprovalBanner(true);
      }
      
      // Navigate based on persona
      if (personaState.persona === 'reviewer') {
        // Show safe content only
        router.replace('/(tabs)');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      console.error('Persona verification failed:', error);
      // Default to safe mode
      appStore.setPersonaState({
        persona: 'reviewer',
        isFullAccessGranted: false,
        activationTime: null,
        riskScore: 0.9,
        needsAdminApproval: false,
        lastVerified: Date.now(),
      });
    }
  };

  // ... rest of login logic
}
```

### Step 4: Create Persona Context/Store

Create `src/lib/stores/personaStore.ts`:

```typescript
import { create } from 'zustand'; // or use your state management
import { PersonaState } from '@/lib/persona/personaService';

interface PersonaStore {
  personaState: PersonaState;
  setPersonaState: (state: PersonaState) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const usePersonaStore = create<PersonaStore>((set) => ({
  personaState: {
    persona: 'loading',
    isFullAccessGranted: false,
    activationTime: null,
    riskScore: 1.0,
    needsAdminApproval: false,
    lastVerified: Date.now(),
  },
  setPersonaState: (state) => set({ personaState: state }),
  isLoading: true,
  setLoading: (loading) => set({ isLoading: loading }),
}));
```

### Step 5: Modify Content Screens

Wrap content access with persona checks:

```typescript
import { usePersonaStore } from '@/lib/stores/personaStore';
import { PersonaService } from '@/lib/persona/personaService';

export default function FeedScreen() {
  const { personaState } = usePersonaStore();
  const { isSubscribed } = useSubscriptionStore();
  const { hasAdminApproval } = useUserStore();

  const canViewFullContent = PersonaService.canAccessContent(
    personaState.persona,
    isSubscribed,
    hasAdminApproval,
    personaState.activationTime
  );

  return (
    <View>
      {personaState.persona === 'reviewer' && (
        <SafeContentView />
      )}
      
      {personaState.persona === 'organic' && !personaState.isFullAccessGranted && (
        <OrganicUserView 
          activationProgress={PersonaService.getActivationProgress(
            personaState.persona,
            personaState.activationTime
          )}
          showAdminApprovalNotice={personaState.needsAdminApproval}
        />
      )}
      
      {canViewFullContent && (
        <FullContentView />
      )}
    </View>
  );
}
```

### Step 6: Update Subscription Flow

In your subscription/payment handler:

```typescript
async function handleSubscriptionSuccess(userId: string) {
  // Mark user as subscribed in your database
  await updateUserSubscription(userId, { isSubscribed: true });

  // Re-verify persona to update access
  const updatedPersona = await PersonaService.verifyPersona(userId);
  usePersonaStore.setState({ personaState: updatedPersona });

  // If organic user, subscription auto-grants access (no approval needed)
  if (updatedPersona.persona === 'organic') {
    // Still need admin approval, but notify admin that user has subscribed
    notifyAdminOfNewSubscriber(userId);
  }
}
```

### Step 7: Create Admin Approval UI

In admin panel (`src/app/admin/user-approvals.tsx`):

```typescript
export default function UserApprovalsScreen() {
  const [pendingUsers, setPendingUsers] = useState([]);

  useEffect(() => {
    // Fetch users that need approval
    const { data } = await supabase
      .from('user_personas')
      .select('user_id, persona, needs_admin_approval, risk_score')
      .eq('persona', 'organic')
      .eq('needs_admin_approval', true)
      .eq('admin_approved_at', null);

    setPendingUsers(data);
  }, []);

  const approveUser = async (userId: string) => {
    const { error } = await supabase
      .from('user_personas')
      .update({
        admin_approved_at: new Date().toISOString(),
        admin_approved_by: auth.currentUser.id,
        needs_admin_approval: false,
      })
      .eq('user_id', userId);

    if (!error) {
      // Notify user
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'admin_approved',
        message: 'Your account has been approved to access full content!',
      });
    }
  };

  return (
    <View>
      {pendingUsers.map((user) => (
        <UserApprovalCard
          key={user.user_id}
          user={user}
          onApprove={() => approveUser(user.user_id)}
        />
      ))}
    </View>
  );
}
```

## User Types & Behaviors

### Reviewer / Bot (High Risk)
- **Detected as:** Emulator, rooted device, or debug build
- **Can access:** Safe content only (public domain)
- **Can subscribe:** Yes, but still sees safe content
- **Admin approval:** Not needed

### Organic User (Play Store)
- **Detected as:** Downloaded from Play Store
- **Can access:** Safe content initially, full content after subscription + admin approval + 48-hour activation
- **Can subscribe:** Yes
- **Admin approval:** **Required** after subscription
- **Activation:** 48-hour delay starts when first flagged as organic

### Inorganic User (Ads)
- **Detected as:** Came via ads/referral links
- **Can access:** Safe content initially, full content after subscription (instant, no approval)
- **Can subscribe:** Yes
- **Admin approval:** Not required
- **Activation:** Immediate (no delay)

## Database Queries

### Check if user needs approval:
```sql
SELECT * FROM user_personas 
WHERE persona = 'organic' 
AND needs_admin_approval = TRUE 
AND admin_approved_at IS NULL;
```

### Track user activation progress:
```sql
SELECT 
  user_id,
  activation_time,
  EXTRACT(EPOCH FROM (NOW() - activation_time)) as seconds_elapsed,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - activation_time)) >= 172800 THEN 'complete'
    ELSE 'pending'
  END as activation_status
FROM user_personas
WHERE persona = 'organic';
```

## Security Considerations

1. **Never trust client-side claims** - Always verify on server (done in edge function)
2. **Device binding** - Sessions are tied to device fingerprint (prevents token theft)
3. **IP reputation** - Check if user is coming from datacenter/VPN
4. **Behavioral analysis** - Track touch patterns, scroll velocity, session duration
5. **Attestation** - Use SafetyNet/Play Integrity for additional device verification

## Next Steps

1. [ ] Deploy Supabase migration
2. [ ] Deploy classify-persona edge function
3. [ ] Create/update persona store in your app
4. [ ] Integrate persona checks into login flow
5. [ ] Add persona checks to content screens
6. [ ] Create admin approval UI
7. [ ] Update subscription flow to re-verify persona
8. [ ] Add notifications for approval status
9. [ ] Test with different device types (emulator, physical, rooted, etc.)
10. [ ] Monitor security events in `security_events` table

## Files Reference

- Device fingerprinting: `src/lib/fingerprint/deviceFingerprint.ts`
- Persona logic: `src/lib/persona/personaService.ts`
- Database schema: `supabase/migrations/20241006_add_persona_tables.sql`
- Edge function: `supabase/functions/classify-persona/index.ts`
- Example store: `src/lib/stores/personaStore.ts`

---

**Important:** This system prevents:
- ✅ Reviewers accessing premium content
- ✅ Bots/emulators bypassing approval
- ✅ Users from different channels accessing exclusive content prematurely
- ✅ Token theft through device binding
- ✅ Subscription bypass exploits

**Maintains user experience:**
- ✅ Inorganic users get instant access after subscription
- ✅ Organic users only need to wait 48 hours + admin approval
- ✅ All users see appropriate content immediately
