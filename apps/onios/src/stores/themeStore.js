/**
 * themeStore — Zustand store for appearance management.
 * Supports custom wallpaper images via Data URLs.
 */

import { create } from 'zustand';
import { eventBus } from '../core/EventBus';

const useThemeStore = create((set, get) => ({
    theme: localStorage.getItem('onios-theme') || 'dark',
    wallpaper: localStorage.getItem('onios-wallpaper') || 'gradient-dusk',
    // Custom wallpaper is a data URL (base64 image)
    customWallpaper: localStorage.getItem('onios-custom-wallpaper') || null,

    setTheme: (theme) => {
        localStorage.setItem('onios-theme', theme);
        set({ theme });
        document.documentElement.setAttribute('data-theme', theme);
        eventBus.emit('theme:changed', { theme });
    },

    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
    },

    setWallpaper: (wallpaper) => {
        localStorage.setItem('onios-wallpaper', wallpaper);
        set({ wallpaper });
        eventBus.emit('wallpaper:changed', { wallpaper });
    },

    setCustomWallpaper: (dataUrl) => {
        try {
            localStorage.setItem('onios-custom-wallpaper', dataUrl);
        } catch {
            // localStorage quota exceeded — still set in memory
        }
        set({ customWallpaper: dataUrl, wallpaper: 'custom' });
        localStorage.setItem('onios-wallpaper', 'custom');
        eventBus.emit('wallpaper:changed', { wallpaper: 'custom' });
    },

    clearCustomWallpaper: () => {
        localStorage.removeItem('onios-custom-wallpaper');
        set({ customWallpaper: null, wallpaper: 'gradient-dusk' });
        localStorage.setItem('onios-wallpaper', 'gradient-dusk');
    },
}));

export default useThemeStore;
