/**
 * commandStore — Zustand store for command history and activity log.
 * Command history persists across refreshes via localStorage.
 *
 * Every executeCommand() now returns a CommandRunHandle with:
 *   .runId     — unique run ID
 *   .await()   — promise resolving to full CommandRun
 *   .status    — current status
 *   .output    — resolved output
 *   .chainId   — if part of a pipe chain
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { commandRegistry } from '../core/CommandRegistry.js';
import { eventBus } from '../core/EventBus.js';

const useCommandStore = create(
    persist(
        (set, get) => ({
            commandHistory: [],
            activityLog: [],
            isCommandBarOpen: false,

            toggleCommandBar: () => {
                set(state => ({ isCommandBarOpen: !state.isCommandBarOpen }));
            },

            openCommandBar: () => set({ isCommandBarOpen: true }),
            closeCommandBar: () => set({ isCommandBarOpen: false }),

            /**
             * Execute a command. Returns a CommandRunHandle immediately.
             * The handle has .runId, .await(), .status, .output, .chainId.
             * Also logs to history once the run completes.
             */
            executeCommand: (rawCommand, source = 'human') => {
                const handle = commandRegistry.execute(rawCommand, source);

                // Log to history immediately with the runId
                set(state => ({
                    commandHistory: [
                        ...state.commandHistory,
                        {
                            command: rawCommand,
                            timestamp: Date.now(),
                            source,
                            runId: handle.runId,
                            chainId: handle.chainId,
                        },
                    ].slice(-200),
                }));

                return handle;
            },

            addActivity: (entry) => {
                set(state => ({
                    activityLog: [
                        ...state.activityLog,
                        { ...entry, id: Date.now() + Math.random() },
                    ].slice(-500),
                }));
            },

            clearHistory: () => set({ commandHistory: [] }),
            clearActivityLog: () => set({ activityLog: [] }),
        }),
        {
            name: 'onios-commands',
            partialize: (state) => ({
                commandHistory: state.commandHistory.slice(-100),
            }),
        },
    ),
);

// Listen for command executions from the registry
eventBus.on('command:executed', (entry) => {
    useCommandStore.getState().addActivity({
        type: 'command',
        ...entry,
    });
});

eventBus.on('command:error', (entry) => {
    useCommandStore.getState().addActivity({
        type: 'error',
        ...entry,
        timestamp: Date.now(),
    });
});

export default useCommandStore;
