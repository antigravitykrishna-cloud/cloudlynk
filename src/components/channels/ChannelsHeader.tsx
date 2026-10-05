import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Colors } from '@/constants/theme';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { Icon } from '@/components/ui/Icon';
import { FILTERS, TABS, type ChannelFilter, type ChannelTab } from './shared';

/** Title, search box, Discover/Feed/Joined tabs and the sort pills. */
export function ChannelsHeader({
  query,
  onQueryChange,
  tab,
  onTabChange,
  filter,
  onFilterChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  tab: ChannelTab;
  onTabChange: (t: ChannelTab) => void;
  filter: ChannelFilter;
  onFilterChange: (f: ChannelFilter) => void;
}) {
  return (
    <>
      <View style={styles.titleBar}>
        <Text style={styles.title}>Channels</Text>
        <CloudlynkLogo size={28} />
      </View>

      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={onQueryChange}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => onQueryChange('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.searchClear}>{'✕'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={styles.tab}
            onPress={() => onTabChange(t.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            {tab === t.key && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
              onPress={() => onFilterChange(f.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  titleBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  searchBarWrap: { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingBottom: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  searchClear: { fontSize: 14, color: Colors.textMuted, padding: 4 },
  tabBar: {
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 24,
  },
  tab: { paddingVertical: 4, alignItems: 'center' },
  tabText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#ffffff', fontWeight: '800' },
  tabUnderline: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  filterBar: {
    backgroundColor: Colors.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  filterPillText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  filterPillTextActive: { color: '#ffffff' },
});
