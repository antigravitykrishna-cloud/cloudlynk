import { Dimensions } from 'react-native';
import { ContentType } from '@/lib/data/posts';

export const H = Dimensions.get('window').height;

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getTypeColor(type: ContentType): string {
  const map: Record<ContentType, string> = {
    movie: '#2E7DFF',
    series: '#0090ff',
    short: '#00d4aa',
    post: '#a371f7',
  };
  return map[type] ?? '#2E7DFF';
}
