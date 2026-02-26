/**
 * gatewayStore — Manages gateway connection state and config.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GatewayState {
  gatewayUrl: string;
  gatewayType: 'oni' | 'openclaw';
  connected: boolean;
  setupComplete: boolean;
  setGatewayUrl: (url: string) => void;
  setGatewayType: (type: 'oni' | 'openclaw') => void;
  setConnected: (connected: boolean) => void;
  setSetupComplete: (complete: boolean) => void;
  hydrate: () => Promise<void>;
}

const useGatewayStore = create<GatewayState>((set) => ({
  gatewayUrl: 'http://127.0.0.1:5173',
  gatewayType: 'oni',
  connected: false,
  setupComplete: false,

  setGatewayUrl: (url) => {
    set({ gatewayUrl: url });
    AsyncStorage.setItem('onios-gateway-url', url).catch(() => {});
  },

  setGatewayType: (type) => {
    set({ gatewayType: type });
    AsyncStorage.setItem('onios-gateway-type', type).catch(() => {});
  },

  setConnected: (connected) => set({ connected }),

  setSetupComplete: (complete) => {
    set({ setupComplete: complete });
    AsyncStorage.setItem('onios-setup-complete', complete ? '1' : '0').catch(() => {});
  },

  hydrate: async () => {
    try {
      const [url, type, setup] = await Promise.all([
        AsyncStorage.getItem('onios-gateway-url'),
        AsyncStorage.getItem('onios-gateway-type'),
        AsyncStorage.getItem('onios-setup-complete'),
      ]);
      set({
        gatewayUrl: url || 'http://127.0.0.1:5173',
        gatewayType: (type as 'oni' | 'openclaw') || 'oni',
        setupComplete: setup === '1',
      });
    } catch {}
  },
}));

export default useGatewayStore;
