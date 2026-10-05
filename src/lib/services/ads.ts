import { IAdsService } from './types';

export class NoOpAdsService implements IAdsService {
  async showBanner(): Promise<void> {}
  async hideBanner(): Promise<void> {}
  async showInterstitial(): Promise<void> {}
}
