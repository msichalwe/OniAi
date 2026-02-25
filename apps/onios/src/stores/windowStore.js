/**
 * windowStore — Zustand store managing all open windows.
 * 
 * Supports singleton widgets (only one instance allowed) and exposes
 * an active-widgets context for AI agents to understand screen state.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { WIDGET_REGISTRY } from '../core/widgetRegistry';
import useDesktopStore from './desktopStore';
import { eventBus } from '../core/EventBus';

let topZIndex = 100;

/**
 * Find the best position for a new window using available screen real estate.
 * Tries to place windows in a grid-like layout, filling gaps left by closed
 * windows. Falls back to cascade offset when screen is full.
 * Returns { position, hasRoom } where hasRoom indicates if a no-overlap position was found.
 */
function findBestPosition(existingWindows, width, height) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const taskbarH = 64;
    const padding = 16;
    const usableW = screenW - padding * 2;
    const usableH = screenH - taskbarH - padding * 2;

    // Collect bounding rects of non-minimized windows
    const occupied = existingWindows
        .filter(w => !w.isMinimized)
        .map(w => ({
            x1: w.position.x,
            y1: w.position.y,
            x2: w.position.x + w.size.width,
            y2: w.position.y + w.size.height,
        }));

    // Try candidate positions in a grid scan (step = 40px)
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
                // Perfect — no overlap at all
                return { position: { x, y }, hasRoom: true };
            }

            if (totalOverlap < bestOverlap) {
                bestOverlap = totalOverlap;
                bestPos = { x, y };
            }
        }
    }

    // If we found a position with minimal overlap, use it
    if (bestPos) return { position: bestPos, hasRoom: false };

    // Fallback: cascade from top-left
    const offset = (existingWindows.length % 8) * 30;
    return { position: { x: 80 + offset, y: 60 + offset }, hasRoom: false };
}

/**
 * Threshold: if a desktop has this many non-minimized windows already,
 * consider it "full" for overflow purposes.
 */
const OVERFLOW_THRESHOLD = 6;

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
                const desktopState = useDesktopStore.getState();
                let targetDesktopId = desktopState.activeDesktopId;

                // Singleton check: if already open, focus + update props and return existing ID
                if (reg?.singleton) {
                    const found = existing.find(w => w.widgetType === widgetType);
                    if (found) {
                        topZIndex++;
                        // Switch to that window's desktop
                        if (found.desktopId && found.desktopId !== desktopState.activeDesktopId) {
                            desktopState.switchDesktop(found.desktopId);
                        }
                        set(state => ({
                            windows: state.windows.map(w =>
                                w.id === found.id
                                    ? {
                                        ...w,
                                        zIndex: topZIndex,
                                        isMinimized: false,
                                        props: { ...w.props, ...props },
                                    }
                                    : w
                            ),
                        }));
                        return found.id;
                    }
                }

                const winWidth = meta.defaultWidth || 600;
                const winHeight = meta.defaultHeight || 420;

                // Smart overflow: check if current desktop has room
                const desktopWindows = existing.filter(
                    w => w.desktopId === targetDesktopId && !w.isMinimized
                );
                const { position, hasRoom } = findBestPosition(desktopWindows, winWidth, winHeight);

                // If desktop is crowded and there are multiple desktops, try overflow
                if (!hasRoom && desktopWindows.length >= OVERFLOW_THRESHOLD) {
                    const desktops = desktopState.getSortedDesktops();
                    if (desktops.length > 1) {
                        // Find the first desktop with room
                        for (const d of desktops) {
                            if (d.id === targetDesktopId) continue;
                            const dWins = existing.filter(
                                w => w.desktopId === d.id && !w.isMinimized
                            );
                            const result = findBestPosition(dWins, winWidth, winHeight);
                            if (result.hasRoom) {
                                targetDesktopId = d.id;
                                desktopState.switchDesktop(d.id);
                                break;
                            }
                        }
                    }
                    // If still no room on any desktop, create a new one
                    if (targetDesktopId === desktopState.activeDesktopId && !hasRoom && desktopWindows.length >= OVERFLOW_THRESHOLD) {
                        targetDesktopId = desktopState.getOrCreateNextDesktop();
                        desktopState.switchDesktop(targetDesktopId);
                    }
                }

                // Recalculate position for the target desktop
                const finalDesktopWindows = existing.filter(
                    w => w.desktopId === targetDesktopId && !w.isMinimized
                );
                const finalPos = findBestPosition(finalDesktopWindows, winWidth, winHeight);

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
                    desktopId: targetDesktopId,
                    props,
                };

                set(state => ({
                    windows: [...state.windows, newWindow],
                }));

                eventBus.emit('window:opened', { id: newWindow.id, widgetType, title: newWindow.title, desktopId: targetDesktopId });
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
                            ? { ...w, zIndex: topZIndex, isMinimized: false }
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
             * Move a window to a different desktop.
             */
            moveWindowToDesktop: (windowId, desktopId) => {
                set(state => ({
                    windows: state.windows.map(w =>
                        w.id === windowId ? { ...w, desktopId } : w
                    ),
                }));
            },

            /**
             * Get windows on a specific desktop.
             */
            getWindowsOnDesktop: (desktopId) => {
                return get().windows.filter(w => w.desktopId === desktopId);
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
            getActiveContext: () => {
                const wins = get().windows;
                const focused = get().getFocusedWindow();

                return {
                    windowCount: wins.length,
                    focusedWindowId: focused?.id || null,
                    windows: wins.map(w => {
                        const reg = WIDGET_REGISTRY[w.widgetType];
                        return {
                            windowId: w.id,
                            widgetType: w.widgetType,
                            title: w.title,
                            desktopId: w.desktopId || null,
                            singleton: reg?.singleton || false,
                            isMinimized: w.isMinimized,
                            isMaximized: w.isMaximized,
                            isFocused: focused?.id === w.id,
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
                    desktopId: w.desktopId || null,
                    props: w.props,
                })),
            }),
            // On rehydration, restore icon from WIDGET_REGISTRY and sync topZIndex
            onRehydrateStorage: () => (state) => {
                if (state?.windows?.length) {
                    // Restore non-serialisable fields
                    const activeDesktopId = useDesktopStore.getState().activeDesktopId;
                    state.windows = state.windows
                        .filter(w => WIDGET_REGISTRY[w.widgetType]) // drop windows for removed widgets
                        .map(w => {
                            const reg = WIDGET_REGISTRY[w.widgetType];
                            return {
                                ...w,
                                icon: reg?.icon || null,
                                desktopId: w.desktopId || activeDesktopId,
                            };
                        });
                    // Sync topZIndex to highest persisted value
                    const maxZ = Math.max(...state.windows.map(w => w.zIndex || 100));
                    topZIndex = maxZ + 1;
                }
            },
        },
    ),
);

export default useWindowStore;
