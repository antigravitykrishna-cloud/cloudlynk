import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextButton } from '@/components/ui/Button';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';

/**
 * A labelled field showing the current choice. Tapping it opens the choices: in place under the
 * field (`inline`, for short lists) or in a sheet from the bottom of the screen (`sheet`).
 */
export function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  presentation = 'inline',
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  presentation?: 'inline' | 'sheet';
}) {
  const [open, setOpen] = useState(false);

  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const list = options.map(option => (
    <TouchableOpacity
      key={option}
      style={styles.item}
      onPress={() => choose(option)}
      activeOpacity={0.7}
    >
      <Text style={[styles.value, option === value && styles.selected]}>{option}</Text>
      {option === value ? <Text style={styles.check}>✓</Text> : null}
    </TouchableOpacity>
  ));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(isOpen => !isOpen)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {presentation === 'inline' && open ? <View style={styles.list}>{list}</View> : null}

      {presentation === 'sheet' ? (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          >
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <ScrollView keyboardShouldPersistTaps="handled">{list}</ScrollView>
              <TextButton label="Cancel" tone="muted" onPress={() => setOpen(false)} />
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
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
  trigger: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: FontSize.base, color: Colors.text },
  selected: { color: Colors.brandBlue },
  placeholder: { fontSize: FontSize.base, color: Colors.textMuted },
  chevron: { fontSize: FontSize.sm, color: Colors.textMuted, marginLeft: Spacing.sm },
  list: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  check: { fontSize: FontSize.base, color: Colors.brandBlue, fontWeight: FontWeight.extrabold },
  backdrop: { flex: 1, backgroundColor: withAlpha(Colors.black, 0.7), justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '60%',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
