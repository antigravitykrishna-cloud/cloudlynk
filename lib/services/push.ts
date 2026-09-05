import { IPushService } from './types';

export class NoOpPushService implements IPushService {
  async requestPermission(): Promise<boolean> { return false; }
  async getToken(): Promise<string | null> { return null; }
  onMessage(_handler: (message: { title: string; body: string; data?: Record<string, unknown> }) => void): () => void {
    return () => {};
  }
}
