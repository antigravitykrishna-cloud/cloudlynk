import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { usePersona } from '@/features/persona/hooks/usePersona';

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
  const persona = usePersona();
  const [safeContent, setSafeContent] = useState<SafeContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSafeContent();
  }, []);

  const fetchSafeContent = async () => {
    try {
      // Fetch from content_safe table (visible to reviewers only)
      const response = await fetch('/api/content/safe');
      if (response.ok) {
        const data = await response.json();
        setSafeContent(data);
      }
    } catch (e) {
      console.warn('Failed to load safe content:', e);
      // Fallback: empty list
      setSafeContent([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066ff" />
      </View>
    );
  }

  // Only show safe content to reviewers
  if (persona.persona !== 'reviewer' && persona.riskScore < 0.4) {
    return null; // Not a reviewer, use full catalog instead
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cloud Storage</Text>
        <Text style={styles.subtitle}>Public & Family-Friendly Content</Text>
      </View>

      <View style={styles.contentGrid}>
        {safeContent.length === 0 ? (
          <Text style={styles.emptyState}>No content available</Text>
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
  emptyState: {
    textAlign: 'center',
    color: '#999999',
    paddingVertical: 40,
  },
});
