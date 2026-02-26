/**
 * themeStore — Zustand store for appearance management.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorScheme } from '../theme/colors';

interface ThemeState {
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => void;
  toggleScheme: () => void;
  hydrated: boolean;
  hydrate: () => Promise<void>;
}

const useThemeStore = create<ThemeState>((set, get) => ({
  scheme: 'light',
  hydrated: false,

  setScheme: (scheme) => {
    set({ scheme });
    AsyncStorage.setItem('onios-theme', scheme).catch(() => {});
  },

  toggleScheme: () => {
    const next = get().scheme === 'dark' ? 'light' : 'dark';
    get().setScheme(next);
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem('onios-theme');
      if (stored === 'dark' || stored === 'light') {
        set({ scheme: stored, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));

export default useThemeStore;
