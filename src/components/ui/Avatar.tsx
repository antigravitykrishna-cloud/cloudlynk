import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, FontWeight } from '@/theme';

/** "Asha Rao" -> "AR". */
export function initialsOf(name: string | null | undefined): string {
  return (name || '?')
    .split(/\s+/)
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** A round profile picture, or the person's initials when there is none. */
export function Avatar({
  uri,
  name,
  size = 40,
  tone = 'brand',
}: {
  uri?: string | null;
  name: string | null | undefined;
  size?: number;
  /** `brand` fills the initials circle with the brand colour; `muted` with a surface. */
  tone?: 'brand' | 'muted';
}) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image source={uri} style={[circle, styles.image]} contentFit="cover" transition={200} />
    );
  }
  return (
    <View
      style={[
        circle,
        styles.fallback,
        { backgroundColor: tone === 'brand' ? Colors.brandBlue : Colors.surfaceElevated },
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            fontSize: Math.round(size * 0.33),
            color: tone === 'brand' ? Colors.text : Colors.textSecondary,
          },
        ]}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: Colors.surfaceElevated },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: FontWeight.extrabold },
});
