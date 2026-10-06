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

  // A rejected account stays blocked until an admin reverses it, whatever it has paid for
  if (requiredAccess === 'full' && persona.isRejected) {
    onAccessDenied?.();
    return <RejectedView />;
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
      <Button label="View Plans" size="lg" onPress={() => router.push('/premium')} />
    </View>
  );
}

/**
 * Shows the blocked-account message (no subscribe button: paying would not unlock anything)
 */
function RejectedView() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Access Not Available</Text>
      <Text style={styles.message}>
        Your account is not eligible for full access right now. Please contact support if you think
        this is a mistake.
      </Text>
    </View>
  );
}

/**
 * Shows subscription required message
 */
function SubscriptionRequiredView({ persona }: { persona: ReturnType<typeof usePersona> }) {
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
      <Button label="Subscribe Now" size="lg" onPress={() => router.push('/premium')} />
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
      <Text style={styles.progressText}>Account unlocking: {percentage}%</Text>
    </View>
  );
}

/**
 * Subscription expiry warnings are now sent via push notifications
 * and tracked through the profile's plan_status field
 */

/**
 * Shows persona badge
 */
export function PersonaBadge() {
  const { persona } = usePersona();

  if (!persona) return null;

  const colors = {
    reviewer: { bg: Colors.danger, text: Colors.white },
    organic: { bg: Colors.brandBlue, text: Colors.white },
    inorganic: { bg: Colors.success, text: Colors.white },
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
      <Text style={[styles.badgeText, { color: color.text }]}>{label}</Text>
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
    backgroundColor: Colors.warningDim,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  expiryText: {
    color: Colors.text,
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
    backgroundColor: Colors.success,
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
    backgroundColor: Colors.warningDim,
    borderLeftColor: Colors.warning,
    borderLeftWidth: 4,
  },
  bannerError: {
    backgroundColor: Colors.dangerDim,
    borderLeftColor: Colors.danger,
    borderLeftWidth: 4,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
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
