import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChannelDetailsCard } from '@/components/channel/manage/ChannelDetailsCard';
import { ChannelSummaryCard } from '@/components/channel/manage/ChannelSummaryCard';
import { ManagedPostList } from '@/components/channel/manage/ManagedPostList';
import { Colors } from '@/constants/theme';
import { useManagedChannel } from '@/hooks/useManagedChannel';

export default function ManageChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { channel, posts, loading, isAdmin, save, deleteChannel, deletePost } =
    useManagedChannel(id);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.brandBlue} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!channel) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Channel not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/channels')}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Channel</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ChannelSummaryCard channel={channel} />

        {isAdmin && (
          <TouchableOpacity
            style={styles.addContentBtn}
            onPress={() =>
              router.push({ pathname: '/upload/add-content', params: { channelId: id } })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.addContentBtnText}>+ Add Content</Text>
          </TouchableOpacity>
        )}

        <ChannelDetailsCard channel={channel} onSave={save} />
        <ManagedPostList posts={posts} onDelete={deletePost} />

        <TouchableOpacity style={styles.deleteChannelButton} onPress={deleteChannel}>
          <Text style={styles.deleteChannelButtonText}>Delete Channel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { color: Colors.text, fontSize: 24 },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  addContentBtn: {
    borderWidth: 1.5,
    borderColor: Colors.brandBlue,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addContentBtnText: { color: Colors.brandBlue, fontSize: 15, fontWeight: '700' },
  deleteChannelButton: {
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteChannelButtonText: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  errorText: { color: Colors.danger, fontSize: 16, textAlign: 'center', marginTop: 40 },
});
