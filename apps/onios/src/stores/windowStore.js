/**
 * windowStore — Zustand store managing all open windows.
 * 
 * Single desktop. Max 5 windows open at once.
 * When limit is hit, auto-closes the oldest non-focused window.
 * Supports singleton widgets and exposes active-widgets context for AI agents.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { WIDGET_REGISTRY } from '../core/widgetRegistry';
import { eventBus } from '../core/EventBus';

let topZIndex = 100;

/** Maximum number of windows that can be open simultaneously. */
const MAX_WINDOWS = 5;

/**
 * Find the best position for a new window.
 * Grid-scan for no-overlap positions, cascade fallback.
 */
function findBestPosition(existingWindows, width, height) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const taskbarH = 64;
    const padding = 16;
    const usableW = screenW - padding * 2;
    const usableH = screenH - taskbarH - padding * 2;

    const occupied = existingWindows
        .filter(w => !w.isMinimized)
        .map(w => ({
            x1: w.position.x,
            y1: w.position.y,
            x2: w.position.x + w.size.width,
            y2: w.position.y + w.size.height,
        }));

    const step = 40;
    let bestPos = null;
    let bestOverlap = Infinity;

    for (let y = padding; y + height <= usableH + padding; y += step) {
        for (let x = padding; x + width <= usableW + padding; x += step) {
            const candidate = { x1: x, y1: y, x2: x + width, y2: y + height };
            let totalOverlap = 0;

            for (const rect of occupied) {
                const overlapX = Math.max(0, Math.min(candidate.x2, rect.x2) - Math.max(candidate.x1, rect.x1));
                const overlapY = Math.max(0, Math.min(candidate.y2, rect.y2) - Math.max(candidate.y1, rect.y1));
                totalOverlap += overlapX * overlapY;
            }

            if (totalOverlap === 0) {
                return { position: { x, y }, hasRoom: true };
            }

            if (totalOverlap < bestOverlap) {
                bestOverlap = totalOverlap;
                bestPos = { x, y };
            }
        }
    }

    if (bestPos) return { position: bestPos, hasRoom: false };

    const offset = (existingWindows.length % 8) * 30;
    return { position: { x: 80 + offset, y: 60 + offset }, hasRoom: false };
}

/**
 * Determine which window to auto-close when at max capacity.
 * Hierarchy: close the oldest, least-recently-interacted, non-focused window.
 * Prefers closing minimized windows first, then non-singleton windows.
 */
function pickWindowToClose(windows, focusedId) {
    const candidates = windows
        .filter(w => w.id !== focusedId)
        .sort((a, b) => {
            // Prefer closing minimized windows
            if (a.isMinimized && !b.isMinimized) return -1;
            if (!a.isMinimized && b.isMinimized) return 1;
            // Prefer closing non-singleton
            const aReg = WIDGET_REGISTRY[a.widgetType];
            const bReg = WIDGET_REGISTRY[b.widgetType];
            if (!aReg?.singleton && bReg?.singleton) return -1;
            if (aReg?.singleton && !bReg?.singleton) return 1;
            // Oldest interaction first
            return (a.lastInteractedAt || 0) - (b.lastInteractedAt || 0);
        });
    return candidates[0] || null;
}

const useWindowStore = create(
    persist(
        (set, get) => ({
            windows: [],

            /**
             * Open a new window. If the widget is singleton and already open,
             * focus the existing instance instead of creating a duplicate.
             * Returns the window ID (existing or new).
             */
            openWindow: (widgetType, props = {}, meta = {}) => {
                const existing = get().windows;
                const reg = WIDGET_REGISTRY[widgetType];

                // Singleton check: if already open, focus + update props
                if (reg?.singleton) {
                    const found = existing.find(w => w.widgetType === widgetType);
                    if (found) {
                        topZIndex++;
                        set(state => ({
                            windows: state.windows.map(w =>
                                w.id === found.id
                                    ? {
                                        ...w,
                                        zIndex: topZIndex,
                                        isMinimized: false,
                                        lastInteractedAt: Date.now(),
                                        props: { ...w.props, ...props },
                                    }
                                    : w
                            ),
                        }));
                        return found.id;
                    }
                }

                // Auto-close oldest window if at max capacity
                if (existing.length >= MAX_WINDOWS) {
                    const focused = get().getFocusedWindow();
                    const victim = pickWindowToClose(existing, focused?.id);
                    if (victim) {
                        set(state => ({
                            windows: state.windows.filter(w => w.id !== victim.id),
                        }));
                        eventBus.emit('window:auto-closed', {
                            id: victim.id,
                            widgetType: victim.widgetType,
                            title: victim.title,
                            reason: 'max_windows_reached',
                        });
                    }
                }

                const winWidth = meta.defaultWidth || 600;
                const winHeight = meta.defaultHeight || 420;
                const visibleWindows = get().windows.filter(w => !w.isMinimized);
                const finalPos = findBestPosition(visibleWindows, winWidth, winHeight);

                const newWindow = {
                    id: nanoid(8),
                    widgetType,
                    title: meta.title || widgetType,
                    icon: meta.icon || null,
                    position: finalPos.position,
                    size: {
                        width: winWidth,
                        height: winHeight,
                    },
                    minSize: {
                        width: meta.minWidth || 320,
                        height: meta.minHeight || 240,
                    },
                    zIndex: ++topZIndex,
                    isMinimized: false,
                    isMaximized: false,
                    preMaximizeState: null,
                    lastInteractedAt: Date.now(),
                    props,
                };

                set(state => ({
                    windows: [...state.windows, newWindow],
                }));

                eventBus.emit('window:opened', { id: newWindow.id, widgetType, title: newWindow.title });
                return newWindow.id;
            },

            closeWindow: (id) => {
                const win = get().windows.find(w => w.id === id);
                set(state => ({
                    windows: state.windows.filter(w => w.id !== id),
                }));
                if (win) eventBus.emit('window:closed', { id, widgetType: win.widgetType, title: win.title });
            },

            focusWindow: (id) => {
                topZIndex++;
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id
                            ? { ...w, zIndex: topZIndex, isMinimized: false, lastInteractedAt: Date.now() }
                            : w
                    ),
                }));
                const win = get().windows.find(w => w.id === id);
                if (win) eventBus.emit('window:focused', { id, widgetType: win.widgetType, title: win.title });
            },

            minimizeWindow: (id) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, isMinimized: true } : w
                    ),
                }));
                const win = get().windows.find(w => w.id === id);
                if (win) eventBus.emit('window:minimized', { id, widgetType: win.widgetType, title: win.title });
            },

            restoreWindow: (id) => {
                topZIndex++;
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, isMinimized: false, zIndex: topZIndex } : w
                    ),
                }));
            },

            maximizeWindow: (id) => {
                const before = get().windows.find(w => w.id === id);
                set(state => ({
                    windows: state.windows.map(w => {
                        if (w.id !== id) return w;
                        if (w.isMaximized) {
                            const restored = w.preMaximizeState || { position: w.position, size: w.size };
                            return {
                                ...w,
                                isMaximized: false,
                                position: restored.position,
                                size: restored.size,
                                preMaximizeState: null,
                            };
                        } else {
                            return {
                                ...w,
                                isMaximized: true,
                                preMaximizeState: {
                                    position: { ...w.position },
                                    size: { ...w.size },
                                },
                            };
                        }
                    }),
                }));
                if (before) {
                    const action = before.isMaximized ? 'restored' : 'maximized';
                    eventBus.emit(`window:${action}`, { id, widgetType: before.widgetType, title: before.title });
                }
            },

            moveWindow: (id, position) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, position } : w
                    ),
                }));
            },

            resizeWindow: (id, size) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, size } : w
                    ),
                }));
            },

            /**
             * Combined move + resize in a single state update.
             * Used during drag-resize to avoid double re-renders.
             */
            moveAndResizeWindow: (id, position, size) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, position, size } : w
                    ),
                }));
            },

            updateWindowProps: (id, props) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, props: { ...w.props, ...props } } : w
                    ),
                }));
            },

            updateWindowTitle: (id, title) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, title } : w
                    ),
                }));
            },

            getWindowsByType: (type) => {
                return get().windows.filter(w => w.widgetType === type);
            },

            /**
             * Auto-close oldest non-focused window to free up space.
             * Returns the closed window's info or null.
             */
            autoCloseOldest: () => {
                const wins = get().windows;
                const focused = get().getFocusedWindow();
                const victim = pickWindowToClose(wins, focused?.id);
                if (victim) {
                    set(state => ({
                        windows: state.windows.filter(w => w.id !== victim.id),
                    }));
                    eventBus.emit('window:auto-closed', {
                        id: victim.id,
                        widgetType: victim.widgetType,
                        title: victim.title,
                        reason: 'ai_requested',
                    });
                    return { id: victim.id, title: victim.title, widgetType: victim.widgetType };
                }
                return null;
            },

            /**
             * Get the topmost (focused) window.
             */
            getFocusedWindow: () => {
                const wins = get().windows.filter(w => !w.isMinimized);
                if (wins.length === 0) return null;
                return wins.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
            },

            /**
             * Get window by ID.
             */
            getWindowById: (id) => {
                return get().windows.find(w => w.id === id) || null;
            },

            /**
             * Active Widgets Context — returns a serialisable snapshot of all open
             * windows with their IDs, types, titles, available commands, and state.
             * This is the primary interface for AI agents to understand screen state.
             */
            /** Max windows constant exposed for AI context */
            getMaxWindows: () => MAX_WINDOWS,

            getActiveContext: () => {
                const wins = get().windows;
                const focused = get().getFocusedWindow();

                return {
                    windowCount: wins.length,
                    maxWindows: MAX_WINDOWS,
                    focusedWindowId: focused?.id || null,
                    windows: wins.map(w => {
                        const reg = WIDGET_REGISTRY[w.widgetType];
                        return {
                            windowId: w.id,
                            widgetType: w.widgetType,
                            title: w.title,
                            singleton: reg?.singleton || false,
                            isMinimized: w.isMinimized,
                            isMaximized: w.isMaximized,
                            isFocused: focused?.id === w.id,
                            lastInteractedAt: w.lastInteractedAt || 0,
                            props: w.props,
                            position: w.position,
                            size: w.size,
                            availableCommands: reg?.commands || [],
                        };
                    }),
                };
            },
        }),
        {
            name: 'onios-windows',
            // Only persist serialisable window data (strip icon which is a React component)
            partialize: (state) => ({
                windows: state.windows.map(w => ({
                    id: w.id,
                    widgetType: w.widgetType,
                    title: w.title,
                    position: w.position,
                    size: w.size,
                    minSize: w.minSize,
                    zIndex: w.zIndex,
                    isMinimized: w.isMinimized,
                    isMaximized: w.isMaximized,
                    preMaximizeState: w.preMaximizeState,
                    lastInteractedAt: w.lastInteractedAt || 0,
                    props: w.props,
                })),
            }),
            onRehydrateStorage: () => (state) => {
                if (state?.windows?.length) {
                    // Enforce max windows on rehydration
                    let wins = state.windows
                        .filter(w => WIDGET_REGISTRY[w.widgetType])
                        .map(w => {
                            const reg = WIDGET_REGISTRY[w.widgetType];
                            return { ...w, icon: reg?.icon || null };
                        });
                    // Trim to max
                    if (wins.length > MAX_WINDOWS) {
                        wins.sort((a, b) => (b.lastInteractedAt || 0) - (a.lastInteractedAt || 0));
                        wins = wins.slice(0, MAX_WINDOWS);
                    }
                    state.windows = wins;
                    const maxZ = Math.max(...wins.map(w => w.zIndex || 100));
                    topZIndex = maxZ + 1;
                }
            },
        },
    ),
);

export default useWindowStore;
