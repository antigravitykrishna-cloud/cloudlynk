/**
 * Content Gate Component
 * Conditionally renders content based on user persona and subscription
 * Shows appropriate prompts for non-subscribed users
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePersona } from '@/features/persona/hooks/usePersona';
import { Button } from '@/components/ui/Button';
import { Colors, Spacing } from '@/theme';
import { router } from 'expo-router';

interface ContentGateProps {
  children: React.ReactNode;
  requiredAccess?: 'preview' | 'full';
  onAccessDenied?: () => void;
}

/**
 * Main content gate - shows content or access prompt
 */
export function ContentGate({
  children,
  requiredAccess = 'full',
  onAccessDenied,
}: ContentGateProps) {
  const persona = usePersona();

  if (!persona.isReady) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Reviewers can only see preview content
  if (persona.persona?.persona === 'reviewer') {
    if (requiredAccess === 'full') {
      onAccessDenied?.();
      return <ReviewerOnlyView />;
    }
    return <>{children}</>;
  }

  // Check full access
  if (requiredAccess === 'full' && !persona.canAccessFullContent) {
    onAccessDenied?.();
    return <SubscriptionRequiredView persona={persona} />;
  }

  return <>{children}</>;
}

/**
 * Shows reviewer-only message
 */
function ReviewerOnlyView() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Preview Only</Text>
      <Text style={styles.message}>
        This content is only available for subscribers. Subscribe to access full content.
      </Text>
      <Button
        label="View Plans"
        size="lg"
        onPress={() => router.push('/premium')}
      />
    </View>
  );
}

/**
 * Shows subscription required message
 */
function SubscriptionRequiredView({ persona }: { persona: any }) {
  const getMessage = () => {
    if (persona.persona?.persona === 'organic' && !persona.isActivated) {
      const progress = Math.round(persona.activationProgress * 100);
      return `Your account is unlocking... ${progress}% complete. Subscribe now for instant access.`;
    }
    if (persona.needsAdminApproval) {
      return 'Your account needs admin approval. You can subscribe while waiting.';
    }
    return 'Subscribe to access this content.';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Full Access Needed</Text>
      <Text style={styles.message}>{getMessage()}</Text>
      {persona.daysUntilExpiry && persona.daysUntilExpiry < 7 && (
        <View style={styles.expiryWarning}>
          <Text style={styles.expiryText}>
            ⏰ Your subscription expires in {persona.daysUntilExpiry} days
          </Text>
        </View>
      )}
      <Button
        label="Subscribe Now"
        size="lg"
        onPress={() => router.push('/premium')}
      />
    </View>
  );
}

/**
 * Shows activation progress for organic users
 */
export function ActivationProgress() {
  const { activationProgress, persona } = usePersona();

  if (!persona || persona.persona !== 'organic') return null;

  const percentage = Math.round(activationProgress * 100);

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.progressText}>
        Account unlocking: {percentage}%
      </Text>
    </View>
  );
}

/**
 * Shows subscription expiry warning
 */
export function SubscriptionExpiryBanner() {
  const { isSubscribed, daysUntilExpiry } = usePersona();

  if (!isSubscribed || !daysUntilExpiry) return null;

  if (daysUntilExpiry > 3) return null;

  const isExpired = daysUntilExpiry <= 0;

  return (
    <View
      style={[
        styles.banner,
        isExpired ? styles.bannerError : styles.bannerWarning,
      ]}
    >
      <Text style={styles.bannerText}>
        {isExpired
          ? '🚨 Your subscription expired'
          : `⏰ Subscription expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`}
      </Text>
      <Button
        label={isExpired ? 'Renew' : 'Manage'}
        size="sm"
        onPress={() => router.push('/my-subscription')}
      />
    </View>
  );
}

/**
 * Shows persona badge
 */
export function PersonaBadge() {
  const { persona } = usePersona();

  if (!persona) return null;

  const colors = {
    reviewer: { bg: '#f44336', text: '#fff' },
    organic: { bg: '#2196F3', text: '#fff' },
    inorganic: { bg: '#4CAF50', text: '#fff' },
  };

  const labels = {
    reviewer: 'Preview Mode',
    organic: 'Organic User',
    inorganic: 'Subscriber',
  };

  const color = colors[persona.persona || 'reviewer'];
  const label = labels[persona.persona || 'reviewer'];

  return (
    <View style={[styles.badge, { backgroundColor: color.bg }]}>
      <Text style={[styles.badgeText, { color: color.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  loadingText: {
    color: Colors.text,
    fontSize: 16,
  },
  container: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 24,
  },
  expiryWarning: {
    backgroundColor: '#FFF3CD',
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  expiryText: {
    color: '#664D03',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.bg,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  banner: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerWarning: {
    backgroundColor: '#FFF3CD',
    borderLeftColor: '#FFC107',
    borderLeftWidth: 4,
  },
  bannerError: {
    backgroundColor: '#F8D7DA',
    borderLeftColor: '#F44336',
    borderLeftWidth: 4,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#664D03',
    flex: 1,
  },
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
