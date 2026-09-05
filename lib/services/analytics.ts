import { IAnalyticsService } from './types';

export class NoOpAnalyticsService implements IAnalyticsService {
  logEvent(_name: string, _properties?: Record<string, unknown>): void {}
  setUserId(_userId: string): void {}
  logError(_error: Error, _context?: Record<string, unknown>): void {}
}
