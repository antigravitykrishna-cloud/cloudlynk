import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { pickImage } from '@/lib/mediaPicker';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

/** The poster for a video: a preview of the chosen image, or a button to choose one. */
export function ThumbnailPicker({
  uri,
  onChange,
}: {
  uri: string | null;
  onChange: (uri: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  const choose = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await pickImage();
      if (picked) onChange(picked);
    } catch (err) {
      showAlert('Could not pick image', (err as Error)?.message ?? 'Please try again.');
    } finally {
      setPicking(false);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Thumbnail</Text>
      <TouchableOpacity
        style={styles.frame}
        onPress={choose}
        disabled={picking}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={uri ? 'Change thumbnail' : 'Add thumbnail'}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.empty}>
            {picking ? (
              <ActivityIndicator color={Colors.brandBlue} />
            ) : (
              <>
                <Icon name="image" size={24} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Add Thumbnail</Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: Spacing.lg },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  frame: {
    height: 130,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
