import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Colors } from '@/constants/theme';
import { GENRES } from '@/lib/data/posts';

/** Bottom sheet listing GENRES; tapping one picks it and closes. */
export function GenrePickerModal({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  selected: string | undefined;
  onPick: (genre: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Select Genre</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {GENRES.map(g => {
              const isSelected = selected === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={styles.row}
                  onPress={() => {
                    onPick(g);
                    onClose();
                  }}
                >
                  <Text style={[styles.rowTxt, isSelected && { color: Colors.brandBlue }]}>
                    {g}
                  </Text>
                  {isSelected && <Text style={styles.check}>{'✓'}</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingTop: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  rowTxt: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  check: { color: Colors.brandBlue, fontSize: 16 },
  cancel: {
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  cancelTxt: { color: Colors.textMuted, fontWeight: '600', fontSize: 15 },
});
