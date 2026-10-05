import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  type TextInputProps,
} from 'react-native';
import { Colors, Radius, FontSize } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ContentType, defaultAccessLevel } from '@/lib/data/posts';
import type { EntryForm } from '@/lib/video/uploadForm';

const CONTENT_TYPES: { id: ContentType; label: string; icon: IconName }[] = [
  { id: 'movie', label: 'Movie', icon: 'film' },
  { id: 'series', label: 'Web Series', icon: 'tv' },
  { id: 'short', label: 'Short Film', icon: 'video' },
  { id: 'post', label: 'Post', icon: 'document' },
];

/** One picked video's details form on the Add Content screen. */
export function EntryCard({
  entry,
  index,
  onChange,
  onRemove,
  onPickGenre,
  onPickThumbnail,
  thumbBusy,
  thumbDisabled,
}: {
  entry: EntryForm;
  index: number;
  onChange: (patch: Partial<EntryForm>) => void;
  onRemove: () => void;
  onPickGenre: () => void;
  onPickThumbnail: () => void;
  /** This entry's thumbnail picker is open. */
  thumbBusy: boolean;
  /** Some entry's thumbnail picker is open. */
  thumbDisabled: boolean;
}) {
  const isSeries = entry.contentType === 'series';
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.num}>{'#' + (index + 1)}</Text>
        <View style={styles.meta}>
          <Text style={styles.fileName} numberOfLines={1}>
            {entry.video.name}
          </Text>
          <Text style={styles.fileSize}>{(entry.video.size / 1024 / 1024).toFixed(1)} MB</Text>
        </View>
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Text style={styles.removeBtnTxt}>{'✕'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>TYPE</Text>
      <View style={styles.chipRow}>
        {CONTENT_TYPES.map(ct => (
          <Chip
            key={ct.id}
            active={entry.contentType === ct.id}
            icon={ct.icon}
            iconSize={14}
            iconColor={Colors.textSecondary}
            label={ct.label}
            onPress={() => onChange({ contentType: ct.id, accessLevel: defaultAccessLevel(ct.id) })}
          />
        ))}
      </View>

      <Text style={styles.label}>ACCESS</Text>
      <View style={styles.chipRow}>
        <Chip
          active={entry.accessLevel === 'free'}
          icon="lock"
          iconColor={Colors.success}
          label="Free"
          onPress={() => onChange({ accessLevel: 'free' })}
        />
        <Chip
          active={entry.accessLevel === 'premium'}
          icon="lock"
          iconColor={Colors.textMuted}
          label="Premium"
          onPress={() => onChange({ accessLevel: 'premium' })}
        />
      </View>
      <Text style={styles.hint}>
        {entry.accessLevel === 'premium'
          ? 'Only viewers with an active Premium plan can watch this.'
          : 'Anyone can watch this for free.'}
      </Text>

      {isSeries && (
        <>
          <Text style={styles.label}>SERIES NAME</Text>
          <Field
            value={entry.seriesName}
            onChangeText={v => onChange({ seriesName: v })}
            placeholder="e.g. Breaking Bad"
          />
          <Text style={styles.hint}>
            Episodes with the same series name are grouped together on the channel page.
          </Text>
        </>
      )}

      <Text style={styles.label}>THUMBNAIL</Text>
      <TouchableOpacity
        style={styles.thumbPicker}
        onPress={onPickThumbnail}
        disabled={thumbDisabled}
        activeOpacity={0.75}
      >
        {entry.thumbnailUri ? (
          <Image
            source={{ uri: entry.thumbnailUri }}
            style={styles.thumbPreview}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbEmpty}>
            {thumbBusy ? (
              <ActivityIndicator color={Colors.brandBlue} />
            ) : (
              <>
                <Icon name="image" size={24} color={Colors.textMuted} />
                <Text style={styles.thumbEmptyTxt}>Add Thumbnail</Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>TITLE *</Text>
      <Field
        value={entry.title}
        onChangeText={v => onChange({ title: v })}
        placeholder={entry.video.name}
      />

      <Text style={styles.label}>DESCRIPTION</Text>
      <Field
        style={[styles.input, styles.textArea]}
        value={entry.body}
        onChangeText={v => onChange({ body: v })}
        placeholder="What is this about?"
        multiline
      />

      <Text style={styles.label}>GENRE</Text>
      <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={onPickGenre}>
        <Text style={{ color: entry.genre ? Colors.text : Colors.textMuted, fontSize: 14 }}>
          {entry.genre || 'Select genre'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>RELEASE YEAR</Text>
      <Field
        value={entry.releaseYear}
        onChangeText={v => onChange({ releaseYear: v })}
        placeholder={String(new Date().getFullYear())}
        keyboardType="numeric"
        maxLength={4}
      />

      {(entry.contentType === 'movie' || entry.contentType === 'short') && (
        <>
          <Text style={styles.label}>DURATION (minutes)</Text>
          <Field
            value={entry.durationMin}
            onChangeText={v => onChange({ durationMin: v })}
            placeholder="e.g. 120"
            keyboardType="numeric"
          />
        </>
      )}

      {isSeries && (
        <>
          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>SEASON</Text>
              <Field
                value={entry.seasonNo}
                onChangeText={v => onChange({ seasonNo: v })}
                placeholder="1"
                keyboardType="numeric"
              />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>EPISODE</Text>
              <Field
                value={entry.episodeNo}
                onChangeText={v => onChange({ episodeNo: v })}
                placeholder="1"
                keyboardType="numeric"
              />
            </View>
          </View>
          <Text style={styles.label}>EPISODE TITLE</Text>
          <Field
            value={entry.episodeTitle}
            onChangeText={v => onChange({ episodeTitle: v })}
            placeholder="e.g. Pilot"
          />
        </>
      )}

      <View style={styles.divider} />
    </View>
  );
}

function Field(props: TextInputProps) {
  return (
    <TextInput
      style={styles.input}
      placeholderTextColor={Colors.textMuted}
      blurOnSubmit={false}
      {...props}
    />
  );
}

function Chip({
  active,
  icon,
  iconSize = 16,
  iconColor,
  label,
  onPress,
}: {
  active: boolean;
  icon: IconName;
  iconSize?: number;
  iconColor: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Icon name={icon} size={iconSize} color={iconColor} />
      <Text style={[styles.chipTxt, active && { color: Colors.brandBlue }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  num: { fontSize: FontSize.sm, fontWeight: '900', color: Colors.brandBlue, width: 24 },
  meta: { flex: 1 },
  fileName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  fileSize: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  removeBtn: { padding: 6 },
  removeBtnTxt: { color: Colors.textMuted, fontSize: 16, fontWeight: '700' },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 14,
  },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 16 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  textArea: { height: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.brandBlue, backgroundColor: Colors.brandBlueDim },
  chipTxt: { fontSize: 8, color: Colors.textMuted, fontWeight: '700' },
  thumbPicker: {
    height: 130,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 4,
  },
  thumbPreview: { width: '100%', height: '100%' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbEmptyTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  rowInputs: { flexDirection: 'row' },
  divider: { height: 1, backgroundColor: Colors.border, marginTop: 20 },
});
