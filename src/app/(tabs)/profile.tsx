import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { GuestPlans, PlanList, useDefaultPlan } from '@/components/premium/GuestPlans';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { StorageCard } from '@/components/profile/StorageCard';
import { MyChannelsSection } from '@/components/profile/MyChannelsSection';
import { SettingsMenu, type ProfileToggle } from '@/components/profile/SettingsMenu';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyChannels } from '@/hooks/useMyChannels';
import { useNotifications } from '@/hooks/useNotifications';
import { useSubscriptionPlans } from '@/lib/data/plans';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/lib/database.types';

export default function ProfileScreen() {
  const {
    profile,
    user,
    signOut,
    refreshProfile,
    isAdmin,
    isPaidUser,
    planStatus,
    approvalStatus,
    isGuest,
  } = useAuth();
  // Until they subscribe, the plans are the first thing on Profile.
  const showPlans = !!user?.id && !isPaidUser && approvalStatus !== 'rejected';
  const plansQuery = useSubscriptionPlans();
  const [pickedPlan, setPickedPlan] = useDefaultPlan(showPlans ? plansQuery.data : undefined);
  const { unreadCount } = useNotifications(user?.id);
  const { channels, loading: channelsLoading } = useMyChannels(user?.id);
  const router = useRouter();

  // plan_status (via useAuth), not the legacy `plan` column: nothing has written `plan` since
  // v48, so it reported FREE to people who had paid.
  const planName = (planStatus ?? 'free').toUpperCase();

  const handleSignOut = () => {
    if (isGuest) {
      // A guest cannot sign back in. Signing out deletes nothing on the
      // server, but the person can never reach this account again.
      showAlert(
        'You will lose this guest account',
        'Guest accounts cannot be signed back into. Anything on it, including a plan, will be lost. Save your account first.',
        [
          {
            text: 'Save account',
            style: 'cancel',
            onPress: () => router.push('/save-account' as never),
          },
          { text: 'Sign out anyway', style: 'destructive', onPress: signOut },
        ],
      );
      return;
    }
    showAlert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleToggle = async (field: ProfileToggle, value: boolean) => {
    if (!user) return;
    try {
      const patch: TablesUpdate<'profiles'> = {};
      patch[field] = value;
      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
    } catch (err: unknown) {
      showAlert('Error', errorMessage(err, 'Update failed'));
    }
  };

  // Signed out: the plans, not a sign-in wall -- see components/GuestPlans.tsx.
  // Every query here early-returns on !user?.id, so without this a signed-out
  // visitor would get a blank screen.
  if (!user?.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GuestPlans />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <ProfileHeader
          fullName={profile?.full_name}
          subtitle={isGuest ? 'Guest account · not saved' : (user.email ?? '')}
        />

        <View style={styles.body}>
          {isGuest && (
            <TouchableOpacity
              style={styles.saveBanner}
              onPress={() => router.push('/save-account' as never)}
              activeOpacity={0.85}
            >
              <Icon name="lock" size={20} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.saveBannerTitle}>Save your account</Text>
                <Text style={styles.saveBannerText}>
                  {isPaidUser
                    ? 'Your plan is on a guest account. Save it so you never lose it.'
                    : 'Guest accounts are lost if you uninstall or change phones.'}
                </Text>
              </View>
              <Text style={styles.saveBannerChevron}>›</Text>
            </TouchableOpacity>
          )}

          {showPlans ? (
            <View style={styles.plansBlock}>
              <Text style={styles.plansTitle}>Choose your plan</Text>
              <PlanList
                plans={plansQuery.data}
                isLoading={plansQuery.isLoading}
                isError={plansQuery.isError}
                refetch={plansQuery.refetch}
                selectedCode={pickedPlan}
                onSelect={setPickedPlan}
              />
              <TouchableOpacity
                style={[styles.plansBtn, !pickedPlan && { opacity: 0.5 }]}
                disabled={!pickedPlan}
                onPress={() =>
                  router.push({ pathname: '/premium', params: { plan: pickedPlan ?? '' } } as never)
                }
                activeOpacity={0.85}
              >
                <Text style={styles.plansBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.planBadge}
              onPress={() => router.push('/premium')}
              activeOpacity={0.7}
            >
              <Text style={styles.planBadgeText}>{`✦ ${planName} PLAN`}</Text>
              {!isPaidUser && <Text style={styles.planUpgradeText}>{'  · Tap to Upgrade'}</Text>}
            </TouchableOpacity>
          )}

          <StorageCard used={profile?.storage_used} limit={profile?.storage_limit} />

          <MyChannelsSection
            channels={channels}
            loading={channelsLoading}
            userId={user.id}
            isAdmin={isAdmin}
          />

          <SettingsMenu
            isAdmin={isAdmin}
            isPaidUser={isPaidUser}
            planName={planName}
            unreadCount={unreadCount}
            autoBackup={profile?.auto_backup ?? true}
            wifiOnly={profile?.wifi_only ?? false}
            onToggle={handleToggle}
          />

          <View style={styles.bottomButtons}>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={styles.logoutBtnText}>Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => router.push('/delete-account')}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          <Text
            style={styles.version}
          >{`Cloudlynk · v${Constants.expoConfig?.version ?? '0.0.0'}\n© 2026 Cloudlynk Inc. All rights reserved.`}</Text>
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  body: { backgroundColor: Colors.bg, paddingTop: 16 },
  plansBlock: { marginBottom: 20 },
  saveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.brandBlue,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  saveBannerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  saveBannerText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2, lineHeight: 18 },
  saveBannerChevron: { color: '#FFFFFF', fontSize: 28, fontWeight: '300' },
  plansTitle: { color: Colors.text, fontSize: 20, fontWeight: '800', marginBottom: 12 },
  plansBtn: {
    backgroundColor: Colors.brandBlue,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  plansBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  planBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brandBlueDim,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.brandBlue,
    marginBottom: 16,
  },
  planBadgeText: { fontSize: 13, fontWeight: '900', color: Colors.brandBlue, letterSpacing: 0.5 },
  planUpgradeText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  bottomButtons: { paddingHorizontal: 16, marginTop: 16, marginBottom: 16, gap: 12 },
  logoutBtn: {
    backgroundColor: Colors.brandBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  deleteBtn: {
    backgroundColor: '#2A1620',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  deleteBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '800' },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
