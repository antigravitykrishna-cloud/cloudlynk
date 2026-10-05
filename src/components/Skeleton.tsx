import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Colors, Radius } from '../constants/theme';

// Loading placeholders shaped like the content they are standing in for.
//
// Explore previously showed a centred spinner on an empty black screen while
// it fetched. A spinner communicates "wait" and nothing else — the screen
// stays blank, so a slow network is indistinguishable from a broken app, and
// when content arrives it appears all at once and the layout jumps.
//
// Netflix, Instagram and YouTube all draw the *shape* of the page instead:
// the eye reads the layout immediately, the arrival of real content is a
// crossfade rather than a jump, and perceived load time drops even though the
// actual request takes exactly as long.

/** One shimmering block. Everything else here composes these. */
function Shimmer({ style }: { style?: object }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // A slow, looping opacity pulse rather than a translating highlight: a
    // moving gradient needs a masked overlay per block, which on a list of 20
    // placeholders costs more than the loading state is worth.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.block,
        style,
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }) },
      ]}
    />
  );
}

/** The Explore screen mid-load: a hero, then two poster rows. */
export function ExploreSkeleton() {
  return (
    <View style={styles.wrap}>
      <Shimmer style={styles.hero} />

      {[0, 1].map(row => (
        <View key={row} style={styles.section}>
          <Shimmer style={styles.rowTitle} />
          <View style={styles.row}>
            {[0, 1, 2].map(i => (
              <View key={i}>
                <Shimmer style={styles.poster} />
                <Shimmer style={styles.caption} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A vertical list of rows — files, channels, admin tables. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={styles.listWrap}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <Shimmer style={styles.avatar} />
          <View style={{ flex: 1, gap: 7 }}>
            <Shimmer style={styles.lineWide} />
            <Shimmer style={styles.lineNarrow} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm },

  wrap: { flex: 1 },
  hero: { height: 460, borderRadius: 0, marginBottom: 20 },
  section: { marginBottom: 22 },
  rowTitle: { width: 130, height: 19, marginLeft: 16, marginBottom: 12, borderRadius: 5 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  poster: { width: 132, height: 198, borderRadius: 8 },
  caption: { width: 104, height: 11, marginTop: 8, borderRadius: 4 },

  listWrap: { paddingHorizontal: 16, paddingTop: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  avatar: { width: 44, height: 44, borderRadius: 12 },
  lineWide: { width: '62%', height: 13, borderRadius: 4 },
  lineNarrow: { width: '38%', height: 10, borderRadius: 4 },
});
