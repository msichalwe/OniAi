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
    aiData: null, // { memories, personality, conversations, knowledge, stats }
    oniData: null, // { files, agent, totalFiles, totalSize }
    aiMode: 'personal', // 'personal' | 'oni'
    selectedCategory: 'all', // 'all', 'system', 'storage', 'widgetState', 'other', 'aiMemory', 'oni'
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
        // Also refresh AI + OniAI data asynchronously
        get().refreshAI();
        get().refreshOniAI();
    },

    refreshAI: async () => {
        try {
            const [memRes, persRes, convRes, knowRes] = await Promise.all([
                fetch('/api/ai/memory/list?limit=200').then(r => r.json()).catch(() => null),
                fetch('/api/ai/personality').then(r => r.json()).catch(() => null),
                fetch('/api/ai/conversations').then(r => r.json()).catch(() => null),
                fetch('/api/ai/knowledge').then(r => r.json()).catch(() => null),
            ]);
            set({
                aiData: {
                    memories: memRes?.memories || [],
                    memoryTotal: memRes?.total || 0,
                    memoryCategories: memRes?.categories || {},
                    personality: persRes || {},
                    conversations: convRes?.conversations || [],
                    knowledge: knowRes?.entries || [],
                    knowledgeCategories: knowRes?.categories || {},
                },
            });
        } catch { /* server not ready */ }
    },

    refreshOniAI: async () => {
        try {
            const cfgRes = await fetch('/api/oni/config').then(r => r.json()).catch(() => ({}));
            set({ aiMode: cfgRes?.mode || 'personal' });
            if (cfgRes?.mode === 'oni' && cfgRes?.enabled) {
                const wsRes = await fetch('/api/oni/workspace').then(r => r.json()).catch(() => null);
                set({ oniData: wsRes });
            }
        } catch { /* skip */ }
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
        const { entries, selectedCategory, selectedNamespace, searchQuery, aiData, aiMode } = get();
        if (!entries) return [];

        let items = [];
        if (selectedCategory === 'oni') {
            items = get().getOniAIEntries();
        } else if (selectedCategory === 'aiMemory') {
            items = get().getAIEntries();
        } else if (selectedCategory === 'all') {
            items = [
                ...entries.system,
                ...entries.storage,
                ...entries.widgetState,
                ...entries.other,
                ...(aiMode === 'oni' ? get().getOniAIEntries() : get().getAIEntries()),
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

    getAIEntries: () => {
        const { aiData } = get();
        if (!aiData) return [];
        const items = [];

        // Personality as single entry
        if (aiData.personality?.name) {
            items.push({
                key: 'ai:personality',
                shortKey: 'personality',
                namespace: 'AI',
                type: 'object',
                size: JSON.stringify(aiData.personality).length,
                sizeFormatted: formatBytes(JSON.stringify(aiData.personality).length),
                preview: `${aiData.personality.name} — ${aiData.personality.tone}`,
                _aiType: 'personality',
                _aiData: aiData.personality,
            });
        }

        // Memories
        for (const mem of (aiData.memories || [])) {
            items.push({
                key: `ai:memory:${mem.id}`,
                shortKey: mem.id,
                namespace: `AI/${mem.category}`,
                type: mem.hasEmbedding ? 'vector' : 'text',
                size: mem.content.length,
                sizeFormatted: formatBytes(mem.content.length),
                preview: mem.content.substring(0, 80),
                _aiType: 'memory',
                _aiData: mem,
            });
        }

        // Conversations
        for (const conv of (aiData.conversations || [])) {
            items.push({
                key: `ai:conversation:${conv.id}`,
                shortKey: conv.title?.substring(0, 40) || conv.id,
                namespace: 'AI/conversations',
                type: 'conversation',
                size: conv.messageCount || 0,
                sizeFormatted: `${conv.messageCount || 0} msgs`,
                preview: conv.title || 'Untitled',
                _aiType: 'conversation',
                _aiData: conv,
            });
        }

        // Knowledge
        for (const entry of (aiData.knowledge || [])) {
            const valStr = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
            items.push({
                key: `ai:knowledge:${entry.id}`,
                shortKey: entry.key,
                namespace: `AI/${entry.category || 'knowledge'}`,
                type: typeof entry.value,
                size: valStr.length,
                sizeFormatted: formatBytes(valStr.length),
                preview: `${entry.key}: ${valStr.substring(0, 60)}`,
                _aiType: 'knowledge',
                _aiData: entry,
            });
        }

        return items;
    },

    getOniAIEntries: () => {
        const { oniData } = get();
        if (!oniData?.files) return [];
        return oniData.files.map(f => ({
            key: `oc:${f.name}`,
            shortKey: f.name,
            namespace: f.type === 'skill' ? 'OniAI/skills' : 'OniAI',
            type: f.name.endsWith('.md') ? 'markdown' : 'file',
            size: f.size,
            sizeFormatted: formatBytes(f.size),
            preview: f.content?.substring(0, 80)?.replace(/\n/g, ' ') || '',
            _ocFile: f,
        }));
    },

    getRawValue: (fullKey) => {
        // For OniAI files, return file content
        if (fullKey.startsWith('oc:')) {
            const { oniData } = get();
            if (!oniData?.files) return null;
            const fileName = fullKey.slice(3);
            const file = oniData.files.find(f => f.name === fileName);
            return file?.content || null;
        }
        // For AI items, return the cached data
        if (fullKey.startsWith('ai:')) {
            const { aiData } = get();
            if (!aiData) return null;
            if (fullKey === 'ai:personality') return JSON.stringify(aiData.personality, null, 2);
            const memMatch = fullKey.match(/^ai:memory:(.+)$/);
            if (memMatch) {
                const mem = aiData.memories?.find(m => m.id === memMatch[1]);
                return mem ? JSON.stringify(mem, null, 2) : null;
            }
            const convMatch = fullKey.match(/^ai:conversation:(.+)$/);
            if (convMatch) {
                const conv = aiData.conversations?.find(c => c.id === convMatch[1]);
                return conv ? JSON.stringify(conv, null, 2) : null;
            }
            const knowMatch = fullKey.match(/^ai:knowledge:(.+)$/);
            if (knowMatch) {
                const entry = aiData.knowledge?.find(e => e.id === knowMatch[1]);
                return entry ? JSON.stringify(entry, null, 2) : null;
            }
            return null;
        }
        return localStorage.getItem(fullKey);
    },

    deleteAIItem: async (fullKey) => {
        if (fullKey === 'ai:personality') return; // Can't delete personality
        const memMatch = fullKey.match(/^ai:memory:(.+)$/);
        if (memMatch) {
            await fetch(`/api/ai/memory/delete?id=${encodeURIComponent(memMatch[1])}`, { method: 'DELETE' });
        }
        const convMatch = fullKey.match(/^ai:conversation:(.+)$/);
        if (convMatch) {
            await fetch(`/api/ai/conversations/delete?id=${encodeURIComponent(convMatch[1])}`, { method: 'DELETE' });
        }
        const knowMatch = fullKey.match(/^ai:knowledge:(.+)$/);
        if (knowMatch) {
            await fetch(`/api/ai/knowledge/delete?id=${encodeURIComponent(knowMatch[1])}`, { method: 'DELETE' });
        }
        get().refreshAI();
    },
}));

export default useStorageStore;
