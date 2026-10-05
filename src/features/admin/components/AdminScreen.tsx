import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * The frame of every admin screen: header with a back button, then the content -- or "Access
 * denied" for an account that is not an admin. The server re-checks admin rights on every admin
 * call; this only keeps the screens tidy.
 */
export function AdminScreen({
  title,
  right,
  fallbackHref = '/admin',
  children,
}: {
  title: string;
  right?: ReactNode;
  /** Where back goes when there is no history. */
  fallbackHref?: Href;
  children: ReactNode;
}) {
  const { isAdmin } = useAuth();
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title={title} right={right} fallbackHref={fallbackHref} />
      {isAdmin ? (
        children
      ) : (
        <EmptyState icon="lock" title="Access denied" message="This area is for admins only." />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
});
