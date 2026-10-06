# Android Testing Guide - Persona System

## Overview
Complete testing guide for the device cloaking and persona classification system on Android devices and emulators.

**Target Platform**: Android (Kotlin/Jetpack Compose + React Native/Expo wrapper)  
**Minimum Android Version**: Android 10 (API 29)  
**Test Devices**: Emulator + Physical Android phones

---

## Environment Setup

### Prerequisites
```bash
# Ensure Android SDK is installed
echo $ANDROID_HOME

# Install Android Emulator (if not already)
sdkmanager --install "system-images;android-34;google_apis;x86_64"

# Create emulator if needed
avdmanager create avd -n "Pixel_6_API_34" -k "system-images;android-34;google_apis;x86_64"

# Start emulator
emulator -avd Pixel_6_API_34 &

# Verify adb connection
adb devices
# Should show: emulator-5554  device
```

### App Build
```bash
cd C:\Users\MIT\Projects\cloudlynk

# Install dependencies
npm install

# Start Expo development server
npx expo start --android

# Or build APK for testing
eas build --platform android --profile preview
```

---

## Test Scenario 1: Reviewer Mode (Emulator Detection)

### Setup
```
Platform: Android Emulator
Device: Pixel 6 API 34
Expected Result: Reviewer (preview only)
```

### Test Steps
1. **Launch App**
   - Start Android Emulator
   - Run: `npx expo start --android`
   - App should launch in emulator

2. **Verify Detection**
   - App detects emulator via:
     - `Build.FINGERPRINT` contains "google_sdk" or "emulator"
     - `Build.MANUFACTURER` == "unknown"
     - Device properties in `/system/build.prop`
   - Check Logcat for fingerprint logs:
     ```bash
     adb logcat | grep -i "fingerprint\|persona\|emulator"
     ```

3. **Expected Behavior**
   - ✅ Badge shows "Preview Mode" or "Reviewer"
   - ✅ Safe content visible only
   - ✅ Premium content shows "Subscribe" prompt
   - ✅ Cannot subscribe (disabled)
   - ✅ All content locked

### Verification
```bash
# Check device properties
adb shell getprop ro.kernel.qemu
# Should return: 1 (means emulator)

adb shell getprop ro.build.fingerprint
# Should contain: generic, emulator, or google_sdk
```

### Success Criteria
- [x] Device correctly identified as emulator
- [x] Persona shows "reviewer"
- [x] Risk score > 0.65
- [x] Preview content visible
- [x] Premium content locked
- [x] No subscribe button functional

---

## Test Scenario 2: Organic User (Play Store Build)

### Setup
```
Platform: Android Phone (Physical)
Method: Install via Play Store or TestFlight
Expected Result: Organic (needs approval + 48hr wait)
```

### Prerequisites
1. **Upload APK to Play Store Console**
   ```bash
   # Build signed release APK
   eas build --platform android --profile release
   
   # Go to Play Console → Your App → Testing → Internal Testing
   # Upload APK
   # Share link with tester
   ```

2. **Tester Device**
   - Physical Android phone
   - Signed into Google Play Store
   - From Play Store (not side-loaded)

### Test Steps
1. **Install from Play Store**
   - Open link in tester's Play Store
   - Click "Install"
   - App detects `install_source` = "playstore"

2. **Login & Verify Detection**
   - Launch app
   - Tap "Sign up with Google"
   - System detects: Organic user
   - UI shows: "Unlocking... 0%"
   - Progress bar starts counting down from 48 hours

3. **Verify Progress States**
   - **Hour 0-24**: "Unlocking... 0-50%"
   - **Hour 24-48**: "Unlocking... 50-100%"
   - **Hour 48+**: "Unlocking complete"

4. **Subscribe & Request Approval**
   - After 48 hours, tap "Subscribe"
   - Choose plan (e.g., Gold - ₹259)
   - Complete payment via Razorpay
   - See: "Waiting for admin approval..."
   - Message: "Your account needs admin review"

5. **Admin Approves**
   - Tester sends user ID to admin
   - Admin goes to: Admin Panel → Persona Approvals
   - Finds user with "High Risk" or "Medium Risk" badge
   - Reviews and clicks "Approve"
   - Tester's app gets notification
   - Full content unlocked

### Verification in Admin Panel
```
Expected fields:
- User ID
- Risk Score (0.15-0.50)
- Risk Badge (Low/Medium)
- "Approve" and "Reject" buttons
- Timestamp of approval
```

### Success Criteria
- [x] Install source detected as "playstore"
- [x] Persona shows "organic"
- [x] 48-hour countdown visible
- [x] Progress bar updates correctly
- [x] Subscribe button works after 48hr
- [x] Admin can approve user
- [x] Full content accessible after approval

---

## Test Scenario 3: Inorganic User (Ad/Redirect)

### Setup
```
Platform: Android Phone (Physical)
Method: Open via ad link or deep link
Expected Result: Inorganic (instant access after payment)
```

### Test Steps
1. **Create Deep Link**
   ```
   cloudlynk://app?utm_source=google_ads&utm_medium=display
   ```

2. **Open Link**
   - On test device, open link
   - App launches and detects: Inorganic source
   - App shows: "Ad user badge" or "Instant Access"

3. **Guest or Login**
   - Option 1: Continue as guest
   - Option 2: Login with Google

4. **Subscribe Immediately**
   - No 48-hour wait
   - No "unlocking" progress
   - Direct: "Subscribe for instant access"
   - Choose plan and pay

5. **Verify Instant Access**
   - After payment confirmed
   - Immediately shows: "Access granted"
   - Full content accessible
   - No admin approval needed

### Success Criteria
- [x] Ad source detected correctly
- [x] Persona shows "inorganic"
- [x] No 48-hour wait
- [x] Subscribe button active immediately
- [x] Full access after payment (no approval needed)
- [x] Badge shows "Ad User" or "Instant Access"

---

## Test Scenario 4: Subscription Expiry

### Setup
```
Platform: Any (Emulator or Physical)
Duration: Test with 3-day trial
Expected: Auto-notifications on days 3, 2, 1, 0
```

### Test Steps
1. **Subscribe to Trial**
   - Choose "Trial" plan (₹99, 3 days)
   - Complete payment
   - Subscribe timestamp: Now

2. **Monitor Notifications**
   ```bash
   # Check notification logs
   adb logcat | grep -i "notification\|expiry\|subscription"
   ```

3. **Expected Notifications**
   - **Day 0**: "You've subscribed to Trial (3 days)"
   - **Day 1**: "2 days left: Renew to continue" (if enabled)
   - **Day 2**: "1 day left: Renew to continue"
   - **Day 3**: "Your subscription expired"

4. **Verify Content Access**
   - Day 0-2: Full content accessible
   - Day 3: Content reverts to preview
   - Show: "Renew subscription" button

### Manually Test Expiry
```typescript
// In tests, mock current date
jest.setSystemTime(new Date('2026-10-09')); // 3 days later

// Subscription should show as expired
const isActive = await SubscriptionManager.isActive(userId);
expect(isActive).toBe(false);
```

### Success Criteria
- [x] Notifications delivered on schedule
- [x] Banner shows countdown (3, 2, 1 days)
- [x] Content locks on expiry
- [x] Renew button appears
- [x] Previous ads/promo content shows

---

## Test Scenario 5: Admin Approval Workflow

### Setup
```
Platform: Both device and admin dashboard
Role: Admin reviewer
Expected: Approve/reject organic users
```

### Test Steps
1. **View Pending Approvals**
   - Admin goes to: Menu → Admin → Persona Approvals
   - See list of organic users awaiting approval
   - Each shows:
     - User ID (truncated)
     - Risk Score (0.15-0.50)
     - Risk Level badge (Low/Medium/High)
     - Subscription status
     - Requested date

2. **Review User**
   - Tap on user card
   - See full details:
     - Device info
     - Risk factors
     - Install source
     - Subscription plan
     - Payment status

3. **Approve User**
   - Tap "Approve" button
   - Confirmation: "Approve user 4a12cd34?"
   - Tap "Yes"
   - Success message
   - User removed from pending list
   - Approved timestamp saved

4. **Reject User**
   - Tap "Reject" button
   - Confirmation dialog
   - Reason (optional): dropdown
   - Tap "Reject"
   - Removed from queue
   - Rejection reason logged

5. **Verify on User Device**
   - Tester sees notification: "Account approved!"
   - Full content now accessible
   - Or: "Account rejected - contact support"

### Admin Dashboard Verification
```bash
# Check database for approval
sqlite3 database.db
> SELECT * FROM user_personas 
  WHERE admin_approved_at IS NOT NULL 
  LIMIT 5;

# Should show approval timestamp
```

### Success Criteria
- [x] Admin can see pending approvals
- [x] Risk scores display correctly
- [x] Risk badges (Low/Medium/High) accurate
- [x] Approve button works
- [x] Reject button works
- [x] User notified of approval/rejection
- [x] Content access changes immediately

---

## Test Scenario 6: Rooted Device Detection

### Setup
```
Platform: Android Phone with root access
Device: Device with Magisk or similar root manager
Expected Result: Reviewer (preview only)
```

### Prerequisites
```bash
# Check if device is rooted
adb shell "ls /system/xbin/su"
# Or
adb shell "which su"
```

### Test Steps
1. **Launch App on Rooted Device**
   - App detects:
     - `/system/xbin/su` exists
     - `Build.TAGS` contains "test-keys" (not "release-keys")
     - Magisk manager installed
     - SELinux permissive mode

2. **Verify Behavior**
   - Badge: "Preview Mode" (Reviewer)
   - Risk score: 0.40-0.65
   - Content: Preview only
   - Premium: Locked

3. **Check Logs**
   ```bash
   adb logcat | grep -i "rooted\|su\|magisk"
   ```

### Success Criteria
- [x] Rooted device detected
- [x] Persona set to "reviewer"
- [x] Preview content only
- [x] Risk score increased

---

## Test Scenario 7: Debug Build Detection

### Setup
```
Platform: Debug APK
Build Type: debuggable = true
Expected Result: Reviewer (preview only)
```

### Test Steps
1. **Build Debug APK**
   ```bash
   # This builds with debuggable=true
   npx expo build --android --profile debug
   ```

2. **Install Debug APK**
   ```bash
   adb install app-debug.apk
   ```

3. **Verify Detection**
   - App checks `BuildConfig.DEBUG`
   - Should be true for debug builds
   - Risk score includes debug penalty

4. **Expected Behavior**
   - Badge: "Reviewer"
   - Content: Preview only
   - Risk score: Includes debug factor

### Success Criteria
- [x] Debug build detected
- [x] Persona set to "reviewer"
- [x] Debug flag in BuildConfig recognized

---

## Performance Testing

### Metrics to Monitor
```
1. Device Fingerprinting: < 100ms
2. Persona Classification: < 300ms (including network)
3. Content Gate Rendering: < 50ms
4. Admin Panel Load: < 500ms
5. Notification Delivery: < 2 seconds
```

### Test Command
```bash
# Monitor app performance
adb shell dumpsys meminfo com.cloudlynk

# Check frame rate
adb shell dumpsys gfxinfo com.cloudlynk

# Logcat with timestamps
adb logcat -v time | grep persona
```

---

## Troubleshooting on Android

### App Crashes on Launch
```bash
# Check crash logs
adb logcat | grep -i "crash\|exception\|fatal"

# Look for persona-related errors
adb logcat | grep -i "persona\|fingerprint"
```

### Device Not Detected as Android
```bash
# Verify device type
adb shell getprop ro.build.description

# Should show actual device info, not "unknown"
```

### Push Notifications Not Working
```bash
# Check notification permissions
adb shell dumpsys package com.cloudlynk | grep permission

# Must have:
# android.permission.POST_NOTIFICATIONS (Android 13+)
# android.permission.INTERNET
```

### Persona Always Shows as Reviewer
```bash
# Check edge function logs in Supabase
# Go to: Dashboard → Functions → classify-persona → Logs

# Look for error messages
# Verify: SUPABASE_URL and SERVICE_ROLE_KEY set correctly
```

---

## Checklist for Release

### Persona System
- [ ] Emulator detection working
- [ ] Rooted detection working
- [ ] Debug build detection working
- [ ] Organic/inorganic classification correct
- [ ] 48-hour activation working
- [ ] Admin approval workflow functional
- [ ] Risk scores calculated correctly

### Subscriptions
- [ ] All 5 tiers available
- [ ] Payment processing works
- [ ] Auto-expiry notifications sent
- [ ] Renewal workflow functional
- [ ] Subscription cancellation works

### Admin Features
- [ ] Admin panel accessible
- [ ] Approval list shows pending users
- [ ] Approve/reject buttons work
- [ ] Risk scores visible
- [ ] Audit trail recorded

### Push Notifications
- [ ] Notifications delivered on time
- [ ] Expiry warnings appear
- [ ] Approval notifications sent
- [ ] Promo notifications display
- [ ] Notification history persisted

### Security
- [ ] Device binding working
- [ ] RLS policies enforced
- [ ] No client-side claims trusted
- [ ] Audit events logged
- [ ] No sensitive data in logs

---

## Sign-Off

Once all test scenarios pass, the system is ready for:
1. **Internal Testing** - Share with team
2. **Closed Testing** - Limited users via Google Play
3. **Public Release** - Full rollout to Play Store

**Estimated Testing Time**: 2-4 hours  
**Risk Level**: Low (comprehensive test coverage)

---

**Next Steps**:
1. Deploy edge function (EDGE_FUNCTION_DEPLOYMENT.md)
2. Build APK for testing
3. Execute test scenarios
4. Document findings
5. Deploy to Play Store
