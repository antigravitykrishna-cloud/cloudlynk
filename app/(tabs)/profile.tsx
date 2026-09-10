import { CloudlynkLogo } from '../../components/CloudlynkLogo';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Linking, ActivityIndicator } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback, useEffect, useRef } from 'react';
import { ChannelService } from '../../lib/channels';
import { GuestPrompt } from '../../components/GuestPrompt';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { formatBytes } from '../../lib/storage';
import { config } from '../../lib/config';
import Constants from 'expo-constants';
import { Icon, type IconName } from '../../components/Icon';

const SettingsRow = ({
  icon, iconBg, label, value, onPress, danger = false,
  toggle, toggleValue, onToggle,
}: {
  icon: IconName; iconBg: string; label: string;
  value?: string; onPress?: () => void; danger?: boolean;
  toggle?: boolean; toggleValue?: boolean; onToggle?: (v: boolean) => void;
}) => (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress && !toggle}
  >
    <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
      <Icon name={icon} size={18} color={danger ? Colors.danger : Colors.brandBlue} />
    </View>
    <Text style={[styles.rowLabel, danger && { color: Colors.danger }]}>{label}</Text>
    {toggle ? (
      <Switch
        value={toggleValue}
        onValueChange={onToggle}
        trackColor={{ false: Colors.borderStrong, true: Colors.accentOrangeDim }}
        thumbColor={toggleValue ? Colors.brand : '#cccccc'}
      />
    ) : (
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Icon name="chevron-right" size={16} color={Colors.textMuted} /> : null}
      </View>
    )}
  </TouchableOpacity>
);

export default function ProfileScreen() {
  const { profile, user, signOut, refreshProfile, isAdmin, isPaidUser, planStatus } = useAuth();
  const { unreadCount } = useNotifications(user?.id);
  const router = useRouter();
  const [myChannels, setMyChannels] = useState<any[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setMyChannels([]);
      setChannelsLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  const loadMyChannels = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await ChannelService.getMyOwnedChannels(user.id);
      setMyChannels(data ?? []);
    } catch (err) {
      if (__DEV__) console.error("loadMyChannels:", err);
    } finally {
      setChannelsLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { setChannelsLoading(true); loadMyChannels(); }, [loadMyChannels]));

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  // Both read plan_status via useAuth, not the legacy `plan` column. `plan`
  // was superseded in v48 and nothing has written it since — verify-play-receipt
  // and play-rtdn-webhook both write plan_status — so it reported FREE to
  // people who had paid, and this screen showed them the upgrade prompt.
  const planName = (planStatus ?? 'free').toUpperCase();

  const handleSignOut = () => {
    showAlert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleToggle = async (field: 'auto_backup' | 'wifi_only' | 'notifications_enabled', value: boolean) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
    } catch (err: unknown) {
      showAlert('Error', err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handlePlanPress = () => {
    router.push('/premium');
  };

  // v61: guests reach this tab but every query here early-returns on
  // !user?.id, so without this they get a blank screen and assume the app
  // is broken rather than that the feature needs an account.
  if (!user?.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GuestPrompt
          icon="user"
          title="Your profile lives here"
          message="Sign in to manage your storage, subscription, uploads and privacy settings."
          linkLabel="See Premium plans"
          linkHref="/premium"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Red header with avatar */}
        <View style={styles.redHeader}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{profile?.full_name ?? 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/edit-profile')}
              activeOpacity={0.7}
            >
              <Icon name="edit" size={17} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/app-setting')}
              activeOpacity={0.7}
            >
              <Icon name="settings" size={17} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* White body */}
        <View style={styles.body}>
          {/* Plan badge */}
          <TouchableOpacity style={styles.planBadge} onPress={handlePlanPress} activeOpacity={0.7}>
            <Text style={styles.planBadgeText}>
              {'✦ '}{planName}{' PLAN'}
            </Text>
            {!isPaidUser && <Text style={styles.planUpgradeText}>{'  · Tap to Upgrade'}</Text>}
          </TouchableOpacity>

          {/* Storage card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Storage</Text>
              <Text style={[styles.cardMeta, { color: Colors.brand }]}>
                {profile
                  ? `${Math.min((profile.storage_used / profile.storage_limit) * 100, 100).toFixed(1)}%`
                  : '0.0%'}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${profile ? Math.min((profile.storage_used / profile.storage_limit) * 100, 100) : 0}%` }]} />
            </View>
            <Text style={styles.cardSub}>
              {formatBytes(profile?.storage_used ?? 0)} used of {formatBytes(profile?.storage_limit ?? 15 * 1024 * 1024 * 1024)}
            </Text>
          </View>

          {/* My Channels + Add Channel */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Channels</Text>
              <TouchableOpacity onPress={() => router.push('/create-content')} activeOpacity={0.7}>
                <Text style={styles.addChannelText}>+ Add Channel</Text>
              </TouchableOpacity>
            </View>
            {channelsLoading ? (
              <ActivityIndicator color={Colors.brand} style={{ paddingVertical: 20 }} />
            ) : myChannels.length === 0 ? (
              <View style={styles.emptyState}>
                <CloudlynkLogo size={40} />
                <Text style={styles.emptyText}>No channels yet</Text>
              </View>
            ) : (
              <View style={styles.channelsList}>
                {myChannels.map((ch) => (
                  <View key={ch.id} style={styles.channelCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.channelName}>{ch.name}</Text>
                      <View style={styles.channelMeta}>
                        <View style={[styles.statusBadge, { backgroundColor: ch.status === "active" ? "#A7F3D0" : ch.status === "pending" ? "#FEF3C7" : "#FECACA" }]}>
                          <Text style={[styles.statusText, { color: ch.status === "active" ? "#065F46" : ch.status === "pending" ? "#92400E" : "#991B1B" }]}>
                            {ch.status === "active" ? "Active" : ch.status === "pending" ? "Pending" : "Suspended"}
                          </Text>
                        </View>
                        <Text style={styles.memberCount}>{ch.member_count ?? 0} members</Text>
                      </View>
                    </View>
                    {(ch.owner_id === user?.id || isAdmin) && (
                      <TouchableOpacity style={styles.manageBtn} onPress={() => router.push(`/channel/manage/${ch.id}` as any)} activeOpacity={0.7}>
                        <Text style={styles.manageBtnText}>Manage</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Settings menu */}
          <View style={styles.section}>
            <Text style={styles.sectionHeaderTitle}>SETTINGS</Text>
            <View style={styles.menuGroup}>
              {isAdmin && (
                <SettingsRow
                  icon="shield"
                  iconBg={Colors.brandLight}
                  label="Admin Panel"
                  onPress={() => router.push('/admin')}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="clipboard"
                  iconBg="rgba(255,179,71,0.14)"
                  label="Admin: Pending Channels"
                  onPress={() => router.push('/admin/pending-channels')}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="edit"
                  iconBg="rgba(255,179,71,0.14)"
                  label="Pending Channel Content"
                  onPress={() => router.push("/admin/pending-channel-content")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="chart"
                  iconBg="rgba(46,125,255,0.14)"
                  label="Channel Activity"
                  onPress={() => router.push("/admin/channel-activity")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="flag"
                  iconBg="rgba(255,77,109,0.14)"
                  label="Reports (Content & Users)"
                  onPress={() => router.push("/admin/reports")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="check-circle"
                  iconBg="rgba(46,212,122,0.14)"
                  label="User Approvals"
                  onPress={() => router.push("/admin/user-approvals")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="diamond"
                  iconBg="rgba(227,179,65,0.14)"
                  label="Subscribers"
                  onPress={() => router.push("/admin/subscribers")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="film"
                  iconBg="rgba(180,169,255,0.14)"
                  label="Content & Access"
                  onPress={() => router.push("/admin/content")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="upload"
                  iconBg="rgba(46,125,255,0.14)"
                  label="Upload Content"
                  onPress={() => router.push("/admin/upload")}
                />
              )}
              {isAdmin && (
                <SettingsRow
                  icon="history"
                  iconBg="rgba(159,176,201,0.14)"
                  label="Audit Log"
                  onPress={() => router.push("/admin/audit")}
                />
              )}
              <SettingsRow
                icon="bell"
                iconBg={Colors.brandLight}
                label="Notifications"
                value={unreadCount > 0 ? `${unreadCount} new` : undefined}
                onPress={() => router.push('/notifications')}
              />
              <SettingsRow
                icon="chart"
                iconBg="rgba(46,212,122,0.14)"
                label="My Subscription"
                onPress={() => router.push('/my-subscription')}
              />
              <SettingsRow
                icon="video"
                iconBg="rgba(255,179,71,0.14)"
                label="My Videos"
                onPress={() => router.push('/my-videos')}
              />
              <SettingsRow
                icon="lock"
                iconBg="rgba(46,125,255,0.14)"
                label="Privacy Policy"
                onPress={() => Linking.openURL(config.privacyPolicyUrl)}
              />
              <SettingsRow
                icon="document"
                iconBg="rgba(255,179,71,0.14)"
                label="Terms of Service"
                onPress={() => Linking.openURL(config.termsUrl)}
              />
              <SettingsRow
                icon="package"
                iconBg="rgba(46,212,122,0.14)"
                label="Export My Data"
                onPress={() => router.push('/export-data')}
              />
              <SettingsRow
                icon="diamond"
                iconBg={Colors.brandLight}
                label={isPaidUser ? 'Manage Plan' : 'Upgrade to Premium'}
                value={isPaidUser ? planName : undefined}
                onPress={() => router.push('/premium')}
              />
              <SettingsRow
                icon="cloud"
                iconBg={Colors.brandLight}
                label="Auto Backup"
                toggle
                toggleValue={profile?.auto_backup ?? true}
                onToggle={(v) => handleToggle('auto_backup', v)}
              />
              <SettingsRow
                icon="wifi"
                iconBg={Colors.brandLight}
                label="Wi-Fi Only Uploads"
                toggle
                toggleValue={profile?.wifi_only ?? false}
                onToggle={(v) => handleToggle('wifi_only', v)}
              />
              <SettingsRow
                icon="settings"
                iconBg={Colors.brandLight}
                label="App Setting"
                onPress={() => router.push('/app-setting')}
              />
            </View>
          </View>


          {/* Logout + Delete Account */}
          <View style={styles.bottomButtons}>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={styles.logoutBtnText}>Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => router.push('/delete-account')} activeOpacity={0.7}>
              <Text style={styles.deleteBtnText}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.version}>{`Cloudlynk · v${Constants.expoConfig?.version ?? '0.0.0'}\n© 2026 Cloudlynk Inc. All rights reserved.`}</Text>
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  redHeader: { backgroundColor: Colors.surface, paddingTop: 24, paddingBottom: 24, paddingHorizontal: 20, alignItems: 'center' },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 3, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  userName: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 2, textAlign: 'center' },
  userEmail: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500', marginBottom: 12, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerActionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerActionIcon: { fontSize: 18 },
  body: { backgroundColor: Colors.bg, paddingTop: 16 },
  planBadge: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brandLight, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.brand, marginBottom: 16 },
  planBadgeText: { fontSize: 13, fontWeight: '900', color: Colors.brand, letterSpacing: 0.5 },
  planUpgradeText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  cardMeta: { fontSize: 14, fontWeight: '900' },
  barTrack: { height: 6, backgroundColor: Colors.surfaceHover, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: '100%', backgroundColor: Colors.brand, borderRadius: 4 },
  cardSub: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sectionHeaderTitle: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 8 },
  addChannelText: { fontSize: 13, fontWeight: '700', color: Colors.brand },
  menuGroup: { marginHorizontal: 16, backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  chevron: { fontSize: 18, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: Colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  emptyIconText: { fontSize: 36 },
  emptyIconUpload: { position: 'absolute', bottom: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  emptyIconUploadText: { fontSize: 14, fontWeight: '900', color: Colors.brand },
  emptyText: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  channelsList: { gap: 8 },
  channelCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#182437', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#22304A' },
  channelName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  channelMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  memberCount: { fontSize: 11, color: '#6B7C97' },
  manageBtn: { backgroundColor: '#2E7DFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  manageBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  bottomButtons: { paddingHorizontal: 16, marginTop: 16, marginBottom: 16, gap: 12 },
  logoutBtn: { backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  logoutBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  deleteBtn: { backgroundColor: '#2A1620', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger },
  deleteBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '800' },
  version: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, lineHeight: 18, paddingHorizontal: 16 },
});
