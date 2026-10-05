import { Dimensions } from 'react-native';
import { ContentType } from '@/features/content/api/postsApi';
import { Colors } from '@/theme';

export const H = Dimensions.get('window').height;

export function getTypeColor(type: ContentType): string {
  const map: Record<ContentType, string> = {
    movie: Colors.brandBlue,
    series: Colors.brandCyan,
    short: Colors.pastelMint,
    post: Colors.pastelLavender,
  };
  return map[type] ?? Colors.brandBlue;
}
