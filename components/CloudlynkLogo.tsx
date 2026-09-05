import { Image } from 'react-native';

type Props = {
  size?: number;
};

export function CloudlynkLogo({ size = 32 }: Props) {
  return (
    <Image
      source={require('../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
      resizeMode="contain"
    />
  );
}
