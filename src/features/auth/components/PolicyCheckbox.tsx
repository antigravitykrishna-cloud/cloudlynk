import { StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Checkbox } from '@/components/ui/Checkbox';
import { Colors } from '@/theme';

/**
 * "I agree to the Terms of Service, Community Guidelines, and Privacy Policy", with each policy a
 * link. Ticking it is the acceptance that complianceApi records.
 */
export function PolicyCheckbox({
  checked,
  onToggle,
  prefix = 'I agree to the',
}: {
  checked: boolean;
  onToggle: () => void;
  prefix?: string;
}) {
  return (
    <Checkbox checked={checked} onToggle={onToggle}>
      {prefix}{' '}
      <Link href="/terms" style={styles.link}>
        Terms of Service
      </Link>
      ,{' '}
      <Link href="/community-guidelines" style={styles.link}>
        Community Guidelines
      </Link>
      , and{' '}
      <Link href="/privacy" style={styles.link}>
        Privacy Policy
      </Link>
      .
    </Checkbox>
  );
}

const styles = StyleSheet.create({
  link: { color: Colors.brandBlue },
});
