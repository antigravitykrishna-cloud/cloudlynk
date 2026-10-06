# Cloudlynk Cloaking System - Complete Integration Guide

## 🎯 System Overview

This document consolidates the complete cloaking/persona detection system for Cloudlynk. The system implements:

- **Device Fingerprinting** - Detects emulators, root devices, debug builds
- **Bot Detection** - Identifies Google Bot, reviewers, automated testing
- **User Verification** - Classifies organic (Play Store) vs inorganic (ads) users
- **Access Control** - Conditional rendering based on persona
- **Subscription Management** - Automatic expiry, notifications, renewal
- **Content Routing** - Safe content for reviewers, full content for verified users

## 📁 Integration Checklist

### Phase 1: Database & Backend Setup

- [ ] **1.1 Deploy Supabase Migrations**
  ```bash
  supabase db push
  ```
  Files to run:
  - `supabase/migrations/20241006_add_persona_tables.sql`
  - `supabase/migrations/004_user_flow.sql`

- [ ] **1.2 Deploy Edge Functions**
  ```bash
  supabase functions deploy classify-persona
  supabase functions deploy auth/verify
  supabase functions deploy cron/expiry-check
  supabase functions deploy content
  ```

- [ ] **1.3 Set Environment Variables**
  ```bash
  supabase secrets set \
    API_SECRET_KEY=your-secret \
    GOOGLE_CLIENT_ID=your-client-id \
    PUSH_NOTIFICATION_KEY=your-key
  ```

- [ ] **1.4 Configure Cron Job**
  - In Supabase Dashboard: Database > Cron Jobs
  - Schedule: `0 * * * * ` (every hour)
  - Command: `SELECT check_subscription_expiry();`

### Phase 2: React Native App Integration

- [ ] **2.1 Install Dependencies**
  ```bash
  npm install \
    expo-device \
    expo-secure-store \
    @react-native-community/netinfo \
    @tanstack/react-query
  ```

- [ ] **2.2 Create Utility Modules**
  - `src/lib/fingerprint/deviceFingerprint.ts` ✅ Created
  - `src/lib/persona/personaService.ts` ✅ Created
  - `src/lib/persona/safetyNetAttestation.ts` ✅ Created

- [ ] **2.3 Create Auth System**
  - `src/auth/AuthManager.ts` - One-click login (guest/Google/email)
  - Update `src/app/(auth)/login.tsx` to use AuthManager

- [ ] **2.4 Create Subscription System**
  - `src/subscription/SubscriptionManager.ts` - Plan management
  - `src/screens/PreviewScreen.tsx` - Plan selection UI
  - `src/screens/PaymentScreen.tsx` - Payment integration

- [ ] **2.5 Create Notification System**
  - `src/notifications/NotificationManager.ts` - Push notifications
  - Wire into app initialization

- [ ] **2.6 Create Persona Context**
  - `src/lib/stores/personaStore.ts` - State management
  - Wrap app with PersonaProvider

- [ ] **2.7 Add Conditional Content Rendering**
  - Update content screens to check persona
  - Use `PersonaService.canAccessContent()` for access control

### Phase 3: Native Modules

- [ ] **3.1 iOS Setup**
  - Add `DeviceFingerprintManager.swift` to iOS project
  - Link with React Native bridge
  - Update `Info.plist` with required permissions

- [ ] **3.2 Android Setup**
  - Add `FingerprintModule.kt` to Android project
  - Register in `MainApplication.java`
  - Sync Gradle

- [ ] **3.3 Build & Test**
  ```bash
  eas build --platform ios
  eas build --platform android
  ```

### Phase 4: Content Management

- [ ] **4.1 Create Safe Content Library**
  - Public domain content for reviewers
  - Upload to Supabase storage
  - Seed `content_safe` table

- [ ] **4.2 Create Full Content Library**
  - Premium/exclusive content
  - Stream URLs configured
  - Seed `content_full` table

- [ ] **4.3 Create Channels**
  - Mark some as `is_hidden = true` (for ads users)
  - Mark others as public (for all users)

### Phase 5: Testing & Validation

- [ ] **5.1 Test Reviewer Mode**
  - [ ] Install on iOS simulator → Should show safe content
  - [ ] Install on Android emulator → Should show safe content
  - [ ] Use VPN to AWS IP → Should trigger reviewer mode
  - [ ] Fresh install < 48hrs → Should show safe content

- [ ] **5.2 Test User Mode**
  - [ ] Install on physical iOS device
  - [ ] Wait 48 hours + interact normally
  - [ ] Should unlock full content after activation

- [ ] **5.3 Test Subscription Flow**
  - [ ] Subscribe to plan
  - [ ] Verify full access granted
  - [ ] Wait for expiry
  - [ ] Verify access revoked and notification sent

- [ ] **5.4 Test Bot Detection**
  - [ ] Google Bot IP → Should be blocked
  - [ ] Debug build → Should show safe content
  - [ ] Emulator → Should show safe content

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudlynk App                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Login Screen                                        │   │
│  │  ├─ Guest Login (AuthManager)                       │   │
│  │  ├─ Google Login                                    │   │
│  │  └─ Email Login (OTP)                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Device Fingerprinting                               │   │
│  │  ├─ Hardware detection                              │   │
│  │  ├─ Behavioral tracking                             │   │
│  │  └─ Temporal metrics                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Backend Verification (Edge Function)                        │
│  ├─ Google Bot detection                                    │
│  ├─ IP reputation check                                    │
│  └─ Persona classification (organic/inorganic/reviewer)    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                          ↓                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Persona Context (PersonaProvider)                  │   │
│  │  └─ persona, isUnlocked, activationProgress         │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌───────────────────────┬───────────────────────────┐      │
│  ↓                       ↓                            ↓       │
│ REVIEWER MODE      ORGANIC USER            INORGANIC USER   │
│ (Safe Content)     (Preview + Wait)        (Preview + Pay)  │
│                                                               │
│ • No access        • Safe content initially  • Safe initially│
│ • Safe only        • Admin approval needed  • Pay for access │
│ • View trailers    • 48-hr activation      • Instant access │
│                    • Must subscribe        • Must subscribe │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 Key Components

### 1. Device Fingerprinting Module
**File**: `src/lib/fingerprint/deviceFingerprint.ts`

Detects:
- Emulators (Android/iOS)
- Rooted/Jailbroken devices
- Debug builds
- Mock locations
- Suspicious patterns

### 2. Persona Service
**File**: `src/lib/persona/personaService.ts`

Classification logic:
- **Reviewer**: High-risk device (emulator, rooted, debug)
- **Organic**: From Play Store, needs admin approval + 48-hour wait
- **Inorganic**: From ads, can access after subscription

### 3. Authentication Manager
**File**: `src/auth/AuthManager.ts`

One-click login methods:
- Guest login (device fingerprint)
- Google login (OAuth)
- Email login (OTP-based, no password)

### 4. Subscription Manager
**File**: `src/subscription/SubscriptionManager.ts`

Plans:
- Trial: 3 days - ₹99
- Silver: 7 days - ₹149
- Gold: 30 days - ₹259
- Platinum: 180 days - ₹599
- Diamond: 365 days - ₹999

Features:
- Auto-expiry
- Renewal
- Notifications at 3 days, 1 day, and on expiry

### 5. Content Routing
**Files**: 
- `src/components/SafeContentView.tsx` - Reviewer/safe content
- `src/components/FullContentView.tsx` - Verified user content

## 🔐 Security Features

1. **Server-Side Verification**
   - Never trust client claims
   - All verification happens on backend
   - Device binding prevents token theft

2. **IP Reputation Checking**
   - Detects cloud providers (AWS, GCP, Azure)
   - Flags known VPN/proxy services
   - Geolocation verification

3. **Behavioral Analysis**
   - Touch pattern recognition
   - Session duration analysis
   - Scroll velocity detection
   - Temporal pattern analysis

4. **Bot Detection**
   - Google Bot IP ranges
   - Bot user agent patterns
   - Reverse DNS verification
   - Behavioral scoring

## 📊 User Flow Summary

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Download app | App installed |
| 2 | One-click login | Guest/Google/Email |
| 3 | Backend verification | Bot check + IP check |
| 4 | Google Bot detected | ❌ Blocked - no access |
| 5 | Ads user detected | ✅ Verified - preview access |
| 6 | Browse content | Preview only visible |
| 7 | Subscribe | Choose plan → Payment |
| 8 | Payment successful | ✅ Full access granted |
| 9 | Days pass | 🔔 Expiry notifications |
| 10 | Expiry date reached | ⏰ Auto-revert to preview |

## 🚀 Deployment Steps

### Prerequisites
- Supabase CLI installed
- Expo CLI installed
- iOS/Android development environment

### Step-by-Step

**1. Database Setup**
```bash
cd cloudlynk
supabase link --project-ref your-project-ref
supabase db push
```

**2. Deploy Functions**
```bash
supabase functions deploy classify-persona
supabase functions deploy auth/verify
supabase functions deploy cron/expiry-check
supabase functions deploy content
```

**3. App Dependencies**
```bash
npm install
npm run postinstall
```

**4. Native Module Setup**
- iOS: Add Swift files to Xcode
- Android: Add Kotlin files and sync Gradle

**5. Build**
```bash
eas build --platform ios
eas submit --platform ios

eas build --platform android
eas submit --platform android
```

## 🧪 Testing Scenarios

### Scenario 1: Reviewer (Emulator)
1. Launch on iOS simulator
2. System detects: `isEmulator = true`
3. **Result**: Reviewer mode → Safe content only

### Scenario 2: Organic User (Play Store)
1. Install from Play Store
2. Fresh install, no subscription
3. **Day 1-2**: Safe content + "Unlocking... X%"
4. **Day 3+**: Can subscribe, preview content
5. After subscription + approval: Full access

### Scenario 3: Ads User
1. Install via Google Ads link
2. System detects: `referrer = 'google_ads'`
3. **Result**: Ads user verified → preview access
4. After subscription: Instant full access

### Scenario 4: Subscription Expiry
1. Subscribe for 3 days (Trial plan)
2. Use app normally
3. **Day 2**: Notification - "Expiring tomorrow"
4. **Day 4**: Notification - "Expired"
5. **Result**: Access reverted to preview

## 📋 Files Created

### Supabase
- ✅ `supabase/migrations/20241006_add_persona_tables.sql`
- ✅ `supabase/functions/classify-persona/index.ts`
- ✅ `supabase/migrations/004_user_flow.sql`

### React Native
- ✅ `src/lib/fingerprint/deviceFingerprint.ts`
- ✅ `src/lib/persona/personaService.ts`
- ✅ `src/lib/persona/safetyNetAttestation.ts`

### To Create
- [ ] `src/auth/AuthManager.ts`
- [ ] `src/subscription/SubscriptionManager.ts`
- [ ] `src/notifications/NotificationManager.ts`
- [ ] `src/lib/stores/personaStore.ts`
- [ ] `src/screens/PreviewScreen.tsx`
- [ ] `src/screens/PaymentScreen.tsx`

## ⚠️ Important Notes

1. **Test on Real Devices**: Emulator testing won't catch all issues
2. **Monitor False Positives**: Track analytics for incorrect classifications
3. **Update IP Ranges**: Regularly update known cloud provider ranges
4. **Handle Edge Cases**: Test with VPNs, rooted devices, multiple accounts
5. **Push Notifications**: Configure push token storage and delivery

## 📞 Support

For issues, check:
1. `persona_analytics` table - View all classifications
2. `security_events` table - View suspicious activity
3. `detection_failures` table - View what failed
4. Supabase logs - Edge function errors

---

**Version**: 1.0.0  
**Last Updated**: 2024-10-06  
**Status**: Ready for Integration
