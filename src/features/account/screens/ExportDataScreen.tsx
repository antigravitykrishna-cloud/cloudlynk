import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { useDataExport } from '@/features/account/hooks/useDataExport';

export default function ExportDataScreen() {
  const { exporting, result, exportData } = useDataExport();

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title="Export My Data" fallbackHref="/(tabs)/profile" />
      <View style={styles.content}>
        <Card style={styles.intro}>
          <Icon name="package" size={30} color={Colors.brandBlue} />
          <Text style={styles.title}>Download Your Data</Text>
          <Text style={styles.description}>
            Download a copy of all your data in JSON format. Includes your profile, channel
            memberships, posts, subscription history, and uploaded videos.
          </Text>
        </Card>

        {result ? (
          <View style={styles.success}>
            <Icon name="check-circle" size={24} color={Colors.success} />
            <Text style={styles.successTitle}>Download started</Text>
            <Text style={styles.successDetail}>File size: {result.fileSize}</Text>
            {result.recordCount > 0 ? (
              <Text style={styles.successDetail}>{result.recordCount} records exported</Text>
            ) : null}
          </View>
        ) : null}

        <Button label="Download My Data" size="lg" onPress={exportData} busy={exporting} />

        <Text style={styles.note}>
          Your data is exported as a JSON file that you can open with any text editor. No data is
          sent to third parties during this process.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, padding: Spacing.xl },
  intro: { alignItems: 'center', padding: Spacing.xxl, marginBottom: Spacing.xl },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginVertical: Spacing.sm,
  },
  description: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  success: {
    backgroundColor: Colors.successDim,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.successBorder,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  successTitle: { fontSize: FontSize.subhead, fontWeight: FontWeight.bold, color: Colors.success },
  successDetail: { fontSize: FontSize.md, color: Colors.textMuted },
  note: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.xl,
  },
});
