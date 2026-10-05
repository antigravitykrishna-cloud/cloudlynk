import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/** A search input with a magnifier and a clear button. */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.bar}>
      <Icon name="search" size={16} color={Colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChange}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChange('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clear}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: { flex: 1, color: Colors.text, fontSize: FontSize.base, paddingVertical: 0 },
  clear: { fontSize: FontSize.base, color: Colors.textMuted, padding: Spacing.xs },
});
