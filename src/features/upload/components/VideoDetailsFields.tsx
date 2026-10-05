import { StyleSheet, View } from 'react-native';
import { ChoiceChips, type Choice } from '@/components/ui/ChoiceChips';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { Spacing } from '@/theme';
import {
  GENRES,
  defaultAccessLevel,
  type AccessLevel,
  type ContentType,
} from '@/features/content/model';
import { ThumbnailPicker } from '@/features/upload/components/ThumbnailPicker';
import type { VideoDetails } from '@/features/upload/uploadQueue';

const CONTENT_TYPES: Choice<ContentType>[] = [
  { value: 'movie', label: 'Movie', icon: 'film' },
  { value: 'series', label: 'Web Series', icon: 'tv' },
  { value: 'short', label: 'Short Film', icon: 'video' },
  { value: 'post', label: 'Post', icon: 'document' },
];

const ACCESS_LEVELS: Choice<AccessLevel>[] = [
  { value: 'free', label: 'Free', icon: 'globe' },
  { value: 'premium', label: 'Premium', icon: 'lock' },
];

/**
 * Everything typed in about one video before it uploads. Which fields show depends on the type:
 * running time for movies and shorts, season and episode for series.
 */
export function VideoDetailsFields({
  details,
  onChange,
  fileName,
  showSeriesName = true,
}: {
  details: Omit<VideoDetails, 'seriesId'>;
  onChange: (patch: Partial<VideoDetails>) => void;
  /** The picked file's name, suggested as the title. */
  fileName: string;
  /** Off where the series cannot be changed any more (a queued item). */
  showSeriesName?: boolean;
}) {
  const isSeries = details.contentType === 'series';
  const hasRunningTime = details.contentType === 'movie' || details.contentType === 'short';
  const currentYear = String(new Date().getFullYear());

  return (
    <>
      <ChoiceChips
        label="Type"
        choices={CONTENT_TYPES}
        value={details.contentType}
        // A new type brings that type's default access; it can still be changed below.
        onChange={contentType =>
          onChange({ contentType, accessLevel: defaultAccessLevel(contentType) })
        }
      />
      <ChoiceChips
        label="Access"
        choices={ACCESS_LEVELS}
        value={details.accessLevel}
        onChange={accessLevel => onChange({ accessLevel })}
        hint={
          details.accessLevel === 'premium'
            ? 'Only viewers with an active Premium plan can watch this.'
            : 'Anyone can watch this for free.'
        }
      />

      {isSeries && showSeriesName ? (
        <TextField
          label="Series name"
          value={details.seriesName}
          onChangeText={seriesName => onChange({ seriesName })}
          placeholder="e.g. Breaking Bad"
          hint="Episodes with the same series name are grouped together on the channel page."
        />
      ) : null}

      <ThumbnailPicker
        uri={details.thumbnailUri}
        onChange={thumbnailUri => onChange({ thumbnailUri })}
      />
      <TextField
        label="Title *"
        value={details.title}
        onChangeText={title => onChange({ title })}
        placeholder={fileName}
      />
      <TextField
        label="Description"
        value={details.body}
        onChangeText={body => onChange({ body })}
        placeholder="What is this about?"
        multiline
      />
      <SelectField
        label="Genre"
        options={GENRES}
        value={details.genre || null}
        onChange={genre => onChange({ genre })}
        placeholder="Select genre"
        presentation="sheet"
      />
      <TextField
        label="Release year"
        value={details.releaseYear}
        onChangeText={releaseYear => onChange({ releaseYear })}
        placeholder={currentYear}
        keyboardType="numeric"
        maxLength={4}
      />

      {hasRunningTime ? (
        <TextField
          label="Duration (minutes)"
          value={details.durationMin}
          onChangeText={durationMin => onChange({ durationMin })}
          placeholder="e.g. 120"
          keyboardType="numeric"
        />
      ) : null}

      {isSeries ? (
        <>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField
                label="Season"
                value={details.seasonNo}
                onChangeText={seasonNo => onChange({ seasonNo })}
                placeholder="1"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.half}>
              <TextField
                label="Episode"
                value={details.episodeNo}
                onChangeText={episodeNo => onChange({ episodeNo })}
                placeholder="1"
                keyboardType="numeric"
              />
            </View>
          </View>
          <TextField
            label="Episode title"
            value={details.episodeTitle}
            onChangeText={episodeTitle => onChange({ episodeTitle })}
            placeholder="e.g. Pilot"
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  half: { flex: 1 },
});
