import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AccountActions } from '@/features/account/components/AccountActions';
import { AppVersion } from '@/features/account/components/AppVersion';
import { MyChannelsSection } from '@/features/account/components/MyChannelsSection';
import { PlanBadge } from '@/features/account/components/PlanBadge';
import { ProfileHeader } from '@/features/account/components/ProfileHeader';
import { ProfileMenu } from '@/features/account/components/ProfileMenu';
import { SaveAccountBanner } from '@/features/account/components/SaveAccountBanner';
import { StorageCard } from '@/features/account/components/StorageCard';
import { GuestPlans } from '@/features/premium/components/GuestPlans';
import { PlanPicker } from '@/features/premium/components/PlanPicker';
import {
  useSelectedPlan,
  useSubscriptionPlans,
} from '@/features/premium/hooks/useSubscriptionPlans';

// The Profile tab. Signed out it is the plan picker -- not a sign-in wall, which reads as a broken
// tab. Signed in: who you are, your plan (the plans themselves until you subscribe), storage,
// your channels, settings.

export default function ProfileScreen() {
  const { user, profile, isGuest, isPaidUser, planStatus, approvalStatus } = useAuth();

  if (!user) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <GuestPlans />
      </SafeAreaView>
    );
  }

  // Until they subscribe, the plans are the first thing on Profile. Rejected accounts cannot buy.
  const showPlans = !isPaidUser && approvalStatus !== 'rejected';

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ProfileHeader />
        <View style={styles.body}>
          {isGuest ? <SaveAccountBanner hasPlan={isPaidUser} /> : null}
          {showPlans ? <ChoosePlan /> : <PlanBadge planStatus={planStatus} isPaid={isPaidUser} />}
          <StorageCard used={profile?.storage_used ?? 0} limit={profile?.storage_limit ?? 0} />
          <MyChannelsSection />
          <ProfileMenu />
          <AccountActions />
          <AppVersion />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The plan picker inline on Profile; Continue opens /premium on the chosen plan. */
function ChoosePlan() {
  const router = useRouter();
  const { data: plans } = useSubscriptionPlans();
  const { selectedCode, select } = useSelectedPlan(plans);

  return (
    <View style={styles.plans}>
      <Text style={styles.plansTitle}>Choose your plan</Text>
      <PlanPicker selectedCode={selectedCode} onSelect={select} />
      <Button
        label="Continue"
        size="lg"
        disabled={!selectedCode}
        onPress={() =>
          selectedCode && router.push({ pathname: '/premium', params: { plan: selectedCode } })
        }
        style={styles.continue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: Spacing.lg },
  plans: { marginBottom: Spacing.xl },
  plansTitle: {
    color: Colors.text,
    fontSize: FontSize.title,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.md,
  },
  continue: { marginTop: Spacing.md },
});
