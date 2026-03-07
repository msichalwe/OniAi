/**
 * storageStore — Reactive Zustand wrapper around StorageService.
 *
 * Provides reactive state for the Storage widget UI:
 * stats, entries, namespaces, refresh triggers.
 */

import { create } from 'zustand';
import { storageService } from '../core/StorageService.js';

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const useStorageStore = create((set, get) => ({
    stats: null,
    entries: null,
    namespaces: [],
    selectedCategory: 'all', // 'all', 'system', 'storage', 'widgetState', 'other'
    selectedNamespace: null,
    searchQuery: '',
    inspectingKey: null, // full localStorage key being inspected
    inspectingAiItem: null, // { type, data } for AI items

    // ─── Refresh ─────────────────────────────────────

    refresh: () => {
        const stats = storageService.getStats();
        const entries = storageService.getAllEntries();
        const namespaces = storageService.getNamespaces();
        set({ stats, entries, namespaces });
    },

    // ─── Filters ─────────────────────────────────────

    setCategory: (cat) => set({ selectedCategory: cat, selectedNamespace: null }),
    setNamespace: (ns) => set({ selectedNamespace: ns }),
    setSearch: (q) => set({ searchQuery: q }),
    setInspecting: (key) => set({ inspectingKey: key }),

    // ─── Storage CRUD ────────────────────────────────

    setValue: (namespace, key, value) => {
        storageService.set(namespace, key, value);
        get().refresh();
    },

    getValue: (namespace, key) => {
        return storageService.get(namespace, key);
    },

    deleteKey: (fullLocalStorageKey) => {
        localStorage.removeItem(fullLocalStorageKey);
        get().refresh();
    },

    deleteNamespace: (namespace) => {
        storageService.clearNamespace(namespace);
        get().refresh();
    },

    clearWidgetStates: () => {
        storageService.clearAllWidgetStates();
        get().refresh();
    },

    // ─── Export / Import ─────────────────────────────

    exportData: () => {
        return storageService.exportAll();
    },

    importData: (data, mode = 'merge') => {
        const result = storageService.importAll(data, mode);
        get().refresh();
        return result;
    },

    // ─── Helpers ─────────────────────────────────────

    getFilteredEntries: () => {
        const { entries, selectedCategory, selectedNamespace, searchQuery } = get();
        if (!entries) return [];

        let items = [];
        if (selectedCategory === 'all') {
            items = [
                ...entries.system,
                ...entries.storage,
                ...entries.widgetState,
                ...entries.other,
            ];
        } else if (selectedCategory === 'storage' && selectedNamespace) {
            items = entries.storage.filter(e => e.namespace === selectedNamespace);
        } else {
            items = entries[selectedCategory] || [];
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(e =>
                e.key.toLowerCase().includes(q) ||
                (e.preview && e.preview.toLowerCase().includes(q)) ||
                (e.namespace && e.namespace.toLowerCase().includes(q)) ||
                (e.shortKey && e.shortKey.toLowerCase().includes(q))
            );
        }

        return items;
    },

    getRawValue: (fullKey) => {
        return localStorage.getItem(fullKey);
    },
}));

export default useStorageStore;
