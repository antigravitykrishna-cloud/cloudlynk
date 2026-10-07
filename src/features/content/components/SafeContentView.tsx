import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { usePersonaStore } from '@/lib/stores/personaStore';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface SafeContent {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
}

/**
 * Decoy content view shown to reviewers and high-risk users
 * Contains only safe, public-domain, or pre-approved content
 * Hidden from production builds when persona = 'reviewer' or high risk_score
 */
export const SafeContentView: React.FC = () => {
  const { persona, riskScore } = usePersonaStore();
  const { user } = useAuth();
  const [safeContent, setSafeContent] = useState<SafeContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSafeContent();
  }, [user?.id]);

  const fetchSafeContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase config missing');
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-safe-content?limit=20&offset=0`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setSafeContent(Array.isArray(data) ? data : []);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn('Failed to load safe content:', errorMsg);
      setError(errorMsg);
      setSafeContent([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066ff" />
        <Text style={styles.loadingText}>Loading safe content...</Text>
      </View>
    );
  }

  // Show safe content view (cloaking active)
  const personaType = typeof persona === 'string' ? persona : persona?.persona;
  const isCloaked = personaType === 'reviewer' || (riskScore && riskScore > 0.7);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cloud Storage</Text>
        <Text style={styles.subtitle}>Public & Family-Friendly Content</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Load error: {error}</Text>
        </View>
      )}

      <View style={styles.contentGrid}>
        {safeContent.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyTitle}>No content available</Text>
            <Text style={styles.emptySubtitle}>
              {error
                ? 'Unable to load content. Please try again.'
                : 'No safe content available at this time.'}
            </Text>
          </View>
        ) : (
          safeContent.map(item => (
            <View key={item.id} style={styles.contentCard}>
              <View style={styles.thumbnail} />
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.itemCategory}>{item.category}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  loadingText: {
    marginTop: 12,
    color: '#999999',
    fontSize: 14,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#999999',
  },
  errorBanner: {
    backgroundColor: '#3d1515',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#ff6666',
  },
  contentGrid: {
    paddingHorizontal: 16,
    gap: 12,
  },
  contentCard: {
    marginBottom: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: '#2a2a2a',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  itemCategory: {
    fontSize: 12,
    color: '#0066ff',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  emptyStateContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
