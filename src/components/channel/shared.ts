import { Dimensions } from 'react-native';
import { ContentType } from '@/lib/data/posts';

export const H = Dimensions.get('window').height;

export function getTypeColor(type: ContentType): string {
  const map: Record<ContentType, string> = {
    movie: '#2E7DFF',
    series: '#0090ff',
    short: '#00d4aa',
    post: '#a371f7',
  };
  return map[type] ?? '#2E7DFF';
}
