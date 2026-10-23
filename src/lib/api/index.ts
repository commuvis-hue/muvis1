import { config } from '@/lib/config';
import { HttpApi } from './httpApi';
import { MockApi } from './mockApi';
import type { MockApiControls, MuvisApi } from './types';

export function createApi(): MuvisApi {
  return config.apiMode === 'http' ? new HttpApi(config.apiBase) : new MockApi();
}

export function mockApiControls(api: MuvisApi): MockApiControls | null {
  return api instanceof MockApi ? api : null;
}

export { ApiError } from './types';
export type { MuvisApi, LoginQr } from './types';
