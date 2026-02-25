/**
 * desktopStore — Zustand store managing virtual desktops.
 *
 * Each desktop is a workspace that holds a set of windows.
 * Windows are assigned to desktops via their desktopId field in windowStore.
 *
 * Features:
 * - Multiple desktops (Desktop 1, 2, 3, etc.)
 * - Switch between desktops
 * - Auto-create new desktop when current is full
 * - Move windows between desktops
 * - Per-tab only (NOT persisted — each browser tab gets its own desktops)
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { eventBus } from '../core/EventBus';

const useDesktopStore = create(
    (set, get) => ({
        desktops: [
            { id: 'desktop-1', name: 'Desktop 1', order: 0 },
        ],
        activeDesktopId: 'desktop-1',

        /**
         * Get the active desktop object.
         */
        getActiveDesktop: () => {
            const { desktops, activeDesktopId } = get();
            return desktops.find(d => d.id === activeDesktopId) || desktops[0];
        },

        /**
         * Switch to a desktop by ID.
         */
        switchDesktop: (desktopId) => {
            const { desktops, activeDesktopId: prevId } = get();
            const target = desktops.find(d => d.id === desktopId);
            if (target && desktopId !== prevId) {
                set({ activeDesktopId: desktopId });
                eventBus.emit('desktop:switched', { id: desktopId, name: target.name, previousId: prevId });
            }
        },

        /**
         * Switch to desktop by index (0-based).
         */
        switchToIndex: (index) => {
            const { desktops } = get();
            const sorted = [...desktops].sort((a, b) => a.order - b.order);
            if (sorted[index]) {
                set({ activeDesktopId: sorted[index].id });
            }
        },

        /**
         * Go to next desktop.
         */
        nextDesktop: () => {
            const { desktops, activeDesktopId } = get();
            const sorted = [...desktops].sort((a, b) => a.order - b.order);
            const idx = sorted.findIndex(d => d.id === activeDesktopId);
            const next = sorted[(idx + 1) % sorted.length];
            if (next) set({ activeDesktopId: next.id });
        },

        /**
         * Go to previous desktop.
         */
        prevDesktop: () => {
            const { desktops, activeDesktopId } = get();
            const sorted = [...desktops].sort((a, b) => a.order - b.order);
            const idx = sorted.findIndex(d => d.id === activeDesktopId);
            const prev = sorted[(idx - 1 + sorted.length) % sorted.length];
            if (prev) set({ activeDesktopId: prev.id });
        },

        /**
         * Add a new desktop and optionally switch to it.
         * @returns {string} new desktop ID
         */
        addDesktop: (name, switchTo = true) => {
            const { desktops } = get();
            const maxOrder = Math.max(...desktops.map(d => d.order), -1);
            const newDesktop = {
                id: `desktop-${nanoid(6)}`,
                name: name || `Desktop ${desktops.length + 1}`,
                order: maxOrder + 1,
            };
            set(state => ({
                desktops: [...state.desktops, newDesktop],
                ...(switchTo ? { activeDesktopId: newDesktop.id } : {}),
            }));
            eventBus.emit('desktop:added', { id: newDesktop.id, name: newDesktop.name });
            return newDesktop.id;
        },

        /**
         * Remove a desktop. Cannot remove the last desktop.
         * Windows on the removed desktop are moved to the previous desktop.
         * @returns {string|null} ID of desktop windows were moved to, or null if refused
         */
        removeDesktop: (desktopId) => {
            const { desktops, activeDesktopId } = get();
            if (desktops.length <= 1) return null;

            const sorted = [...desktops].sort((a, b) => a.order - b.order);
            const idx = sorted.findIndex(d => d.id === desktopId);
            const fallbackDesktop = sorted[idx > 0 ? idx - 1 : 1];

            const newDesktops = desktops.filter(d => d.id !== desktopId);
            const newActive = activeDesktopId === desktopId
                ? fallbackDesktop.id
                : activeDesktopId;

            const removed = desktops.find(d => d.id === desktopId);
            set({
                desktops: newDesktops,
                activeDesktopId: newActive,
            });

            eventBus.emit('desktop:removed', { id: desktopId, name: removed?.name, movedTo: fallbackDesktop.id });
            return fallbackDesktop.id;
        },

        /**
         * Rename a desktop.
         */
        renameDesktop: (desktopId, name) => {
            set(state => ({
                desktops: state.desktops.map(d =>
                    d.id === desktopId ? { ...d, name } : d
                ),
            }));
            eventBus.emit('desktop:renamed', { id: desktopId, name });
        },

        /**
         * Get desktops sorted by order.
         */
        getSortedDesktops: () => {
            return [...get().desktops].sort((a, b) => a.order - b.order);
        },

        /**
         * Get the desktop after the active one (for overflow).
         * If none exists, creates one.
         */
        getOrCreateNextDesktop: () => {
            const { desktops, activeDesktopId } = get();
            const sorted = [...desktops].sort((a, b) => a.order - b.order);
            const idx = sorted.findIndex(d => d.id === activeDesktopId);

            if (idx < sorted.length - 1) {
                return sorted[idx + 1].id;
            }

            // Create a new desktop
            return get().addDesktop(null, false);
        },

        /**
         * Get context snapshot for AI agents.
         */
        getContext: () => {
            const { desktops, activeDesktopId } = get();
            const sorted = [...desktops].sort((a, b) => a.order - b.order);
            return {
                desktopCount: desktops.length,
                activeDesktopId,
                activeDesktopName: sorted.find(d => d.id === activeDesktopId)?.name || 'Unknown',
                desktops: sorted.map((d, i) => ({
                    id: d.id,
                    name: d.name,
                    index: i,
                    isActive: d.id === activeDesktopId,
                })),
            };
        },
    }),
);

export default useDesktopStore;
