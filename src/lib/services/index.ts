import { createContext, useContext } from 'react';
import { IIapService, IAnalyticsService, IAdsService, IErrorService, IPushService } from './types';
import { getIapService } from './iap';
import { NoOpAnalyticsService } from './analytics';
import { NoOpAdsService } from './ads';
import { NoOpErrorService } from './error';
import { NoOpPushService } from './push';

export interface Services {
  iap: IIapService;
  analytics: IAnalyticsService;
  ads: IAdsService;
  error: IErrorService;
  push: IPushService;
}

export function createServices(): Services {
  return {
    iap: getIapService(),
    analytics: new NoOpAnalyticsService(),
    ads: new NoOpAdsService(),
    error: new NoOpErrorService(),
    push: new NoOpPushService(),
  };
}

const ServiceContext = createContext<Services | null>(null);
export const ServiceProvider = ServiceContext.Provider;

export function useService<T extends keyof Services>(key: T): Services[T] {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error(`useService(${String(key)}) called outside ServiceProvider`);
  return ctx[key];
}
