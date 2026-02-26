/**
 * ContextEngine — Central context aggregator for OniOS.
 *
 * This is the "middle layer" that connects everything:
 * - Windows (open widgets, their state, commands)
 * - Documents (indexed content, metadata)
 * - Files (recently accessed, project roots)
 * - Commands (registered, recent, per-widget)
 * - Search (unified search across all sources)
 *
 * Any AI agent or command can query the ContextEngine to understand
 * the full state of the OS and find anything.
 */

import { eventBus } from './EventBus.js';
import { commandRegistry } from './CommandRegistry.js';
import useWindowStore from '../stores/windowStore.js';
import { WIDGET_REGISTRY } from './widgetRegistry.js';
import { indexService } from './IndexService.js';
import { widgetContext } from './WidgetContextProvider.js';

class ContextEngine {
    constructor() {
        // Track recently accessed files/docs
        this.recentFiles = [];
        this.maxRecent = 50;

        // Track open document contents (from DocumentViewer instances)
        this.openDocuments = new Map();

        // Listen for events to keep context fresh
        eventBus.on('document:opened', (data) => this._onDocOpened(data));
        eventBus.on('document:closed', (data) => this._onDocClosed(data));
        eventBus.on('document:indexed', (data) => this._onDocIndexed(data));
    }

    // ─── Windows Context ───────────────────────────────────────

    getWindows() {
        const state = useWindowStore.getState();
        return state.windows.map((w) => {
            const reg = WIDGET_REGISTRY[w.widgetType];
            return {
                id: w.id,
                type: w.widgetType,
                title: w.title,
                focused: w.zIndex === state.topZIndex,
                minimized: w.isMinimized,
                commands: reg?.commands || [],
                props: w.props,
            };
        });
    }

    getFocusedWindow() {
        const state = useWindowStore.getState();
        return state.getFocusedWindow();
    }

    // ─── Commands Context ──────────────────────────────────────

    getAllCommands() {
        return commandRegistry.list();
    }

    searchCommands(query) {
        return commandRegistry.search(query);
    }

    // ─── Documents Context ─────────────────────────────────────

    trackFile(filePath, meta = {}) {
        // Add to recent files, dedup
        this.recentFiles = this.recentFiles.filter((f) => f.path !== filePath);
        this.recentFiles.unshift({
            path: filePath,
            timestamp: Date.now(),
            ...meta,
        });
        if (this.recentFiles.length > this.maxRecent) {
            this.recentFiles = this.recentFiles.slice(0, this.maxRecent);
        }
    }

    getRecentFiles() {
        return this.recentFiles;
    }

    registerDocument(filePath, content, meta = {}) {
        this.openDocuments.set(filePath, { content, meta, openedAt: Date.now() });
        this.trackFile(filePath, meta);
        // Index for search
        indexService.addDocument(filePath, content, meta);
        eventBus.emit('context:document:registered', { path: filePath });
    }

    unregisterDocument(filePath) {
        this.openDocuments.delete(filePath);
    }

    getOpenDocuments() {
        const docs = [];
        for (const [path, doc] of this.openDocuments) {
            docs.push({ path, ...doc.meta, openedAt: doc.openedAt });
        }
        return docs;
    }

    getDocumentContent(filePath) {
        const doc = this.openDocuments.get(filePath);
        return doc ? doc.content : null;
    }

    // ─── Universal Search ──────────────────────────────────────

    /**
     * Search across ALL sources: commands, windows, files, document content.
     * Returns categorized results.
     */
    async search(query, options = {}) {
        if (!query || !query.trim()) return { commands: [], windows: [], files: [], documents: [] };

        const q = query.trim().toLowerCase();
        const results = {
            commands: [],
            windows: [],
            files: [],
            documents: [],
        };

        // 1. Search commands
        results.commands = commandRegistry.search(q).slice(0, 8).map((cmd) => ({
            type: 'command',
            path: cmd.path,
            description: cmd.description,
            icon: 'terminal',
        }));

        // 2. Search open windows
        results.windows = this.getWindows()
            .filter(
                (w) =>
                    w.title.toLowerCase().includes(q) ||
                    w.type.toLowerCase().includes(q)
            )
            .map((w) => ({
                type: 'window',
                id: w.id,
                title: w.title,
                widgetType: w.type,
                icon: 'layout',
            }));

        // 3. Search recent files
        results.files = this.recentFiles
            .filter((f) => f.path.toLowerCase().includes(q))
            .slice(0, 8)
            .map((f) => ({
                type: 'file',
                path: f.path,
                name: f.path.split('/').pop(),
                icon: 'file',
            }));

        // 4. Search indexed document content
        results.documents = indexService.search(q, 8).map((r) => ({
            type: 'document',
            path: r.id,
            name: r.meta?.name || r.id.split('/').pop(),
            score: r.score,
            snippet: r.snippet,
            icon: 'file-text',
        }));

        // 5. Also search via backend if enabled
        if (options.backend !== false) {
            try {
                const resp = await fetch('/api/docs/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: q, limit: 8 }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    // Merge backend results, avoiding duplicates
                    for (const r of data.results || []) {
                        if (!results.documents.find((d) => d.path === r.path)) {
                            results.documents.push({
                                type: 'document',
                                path: r.path,
                                name: r.name,
                                score: r.score,
                                snippet: r.matches?.find((m) => m.snippet)?.snippet || '',
                                icon: 'file-text',
                            });
                        }
                    }
                }
            } catch {
                // Backend not available
            }
        }

        return results;
    }

    // ─── Widget Live Context ────────────────────────────────────

    /**
     * Get the live internal state of all widgets.
     * This is the key method for AI agents to understand what each
     * widget is showing without screenshots or DOM reading.
     */
    getWidgetContexts() {
        return widgetContext.getAll();
    }

    /**
     * Get live context for a specific widget type.
     */
    getWidgetContext(widgetType) {
        return widgetContext.getWidgetState(widgetType);
    }

    /**
     * Get human/AI-readable summary of all widget live states.
     */
    getWidgetContextSummary() {
        return widgetContext.getSummary();
    }

    /**
     * Get structured snapshot of all widget live states.
     */
    getWidgetContextSnapshot() {
        return widgetContext.getSnapshot();
    }

    // ─── Full Context Snapshot ──────────────────────────────────

    /**
     * Get a complete snapshot of the OS context.
     * Useful for AI agents to understand everything at once.
     */
    getFullContext() {
        return {
            windows: this.getWindows(),
            focusedWindow: this.getFocusedWindow(),
            widgetStates: widgetContext.getSnapshot(),
            openDocuments: this.getOpenDocuments(),
            recentFiles: this.recentFiles.slice(0, 10),
            commandCount: commandRegistry.list().length,
            indexedDocuments: indexService.getStats(),
            windowContext: useWindowStore.getState().getActiveContext(),
            timestamp: Date.now(),
        };
    }

    /**
     * Get a human/AI-readable summary of the full OS context.
     */
    getSummary() {
        const ctx = this.getFullContext();
        const wCtx = ctx.windowContext;
        const lines = ['=== OniOS Context ==='];

        // Windows
        lines.push(`\nWindows (${wCtx.windowCount}/${wCtx.maxWindows} max):`);
        if (ctx.windows.length === 0) {
            lines.push('  No windows open.');
        } else {
            for (const w of ctx.windows) {
                const flags = [w.focused && 'FOCUSED', w.minimized && 'minimized'].filter(Boolean).join(', ');
                lines.push(`  • ${w.title} (${w.type}) ${flags ? `[${flags}]` : ''}`);
            }
        }

        // Widget live states
        const widgetCtx = ctx.widgetStates;
        if (widgetCtx.widgetCount > 0) {
            lines.push(`\n--- Widget Live States (${widgetCtx.widgetCount}) ---`);
            for (const ws of widgetCtx.widgets) {
                lines.push(`\n[${ws.widgetType}] (window: ${ws.windowId})`);
                const state = ws.state;
                if (!state || typeof state !== 'object') {
                    lines.push('  (no state)');
                    continue;
                }
                for (const [key, value] of Object.entries(state)) {
                    if (value === null || value === undefined) continue;
                    if (Array.isArray(value)) {
                        if (value.length === 0) {
                            lines.push(`  ${key}: (empty)`);
                        } else if (value.length <= 5) {
                            const items = value.map(v =>
                                typeof v === 'object' ? (v.name || v.title || v.label || v.id || JSON.stringify(v)) : String(v)
                            );
                            lines.push(`  ${key}: [${items.join(', ')}]`);
                        } else {
                            const preview = value.slice(0, 3).map(v =>
                                typeof v === 'object' ? (v.name || v.title || v.label || v.id || '...') : String(v)
                            );
                            lines.push(`  ${key}: [${value.length} items] ${preview.join(', ')}...`);
                        }
                    } else if (typeof value === 'object') {
                        const keys = Object.keys(value);
                        if (keys.length <= 4) {
                            lines.push(`  ${key}: {${keys.map(k => `${k}: ${String(value[k]).slice(0, 40)}`).join(', ')}}`);
                        } else {
                            lines.push(`  ${key}: {${keys.length} keys}`);
                        }
                    } else {
                        const str = String(value);
                        lines.push(`  ${key}: ${str.length > 100 ? str.slice(0, 100) + '...' : str}`);
                    }
                }
            }
        }

        // Documents
        if (ctx.openDocuments.length > 0) {
            lines.push(`\nOpen Documents (${ctx.openDocuments.length}):`);
            for (const d of ctx.openDocuments) {
                lines.push(`  • ${d.path}`);
            }
        }

        // Recent files
        if (ctx.recentFiles.length > 0) {
            lines.push(`\nRecent Files:`);
            for (const f of ctx.recentFiles) {
                lines.push(`  • ${f.path}`);
            }
        }

        // Index stats
        const stats = ctx.indexedDocuments;
        lines.push(`\nIndex: ${stats.documentCount} docs, ${stats.totalTokens} tokens`);
        lines.push(`Commands: ${ctx.commandCount} registered`);

        return lines.join('\n');
    }

    // ─── Private Event Handlers ────────────────────────────────

    _onDocOpened(data) {
        if (data.path) this.trackFile(data.path, data.meta);
    }

    _onDocClosed(data) {
        if (data.path) this.unregisterDocument(data.path);
    }

    _onDocIndexed(data) {
        if (data.path && data.text) {
            indexService.addDocument(data.path, data.text, data.meta);
        }
    }
}

export const contextEngine = new ContextEngine();
export default contextEngine;
