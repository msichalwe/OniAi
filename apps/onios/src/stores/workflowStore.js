/**
 * workflowStore — Zustand store for workflow definitions.
 *
 * Workflow shape:
 * {
 *   id, name, description, nodes[], connections[], trigger,
 *   createdAt, updatedAt, lastRunAt, lastRunStatus, enabled
 * }
 *
 * Node shape:
 * {
 *   id, type, label, config, x, y, status, output, runId
 * }
 *
 * Connection shape:
 * { id, from, to, fromPort, toPort, label }
 *
 * Node types:
 * - trigger:   Starts the workflow (manual, cron, event)
 * - command:   Executes any registered command
 * - condition: If/else branch based on previous output
 * - delay:     Wait N seconds before continuing
 * - output:    Final result / notification / log
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { eventBus } from '../core/EventBus';

const useWorkflowStore = create(
    persist(
        (set, get) => ({
            workflows: [],
            activeWorkflowId: null,

            // Execution logs: wfId → [{ ts, nodeId, label, type, level, message, data }]
            executionLogs: {},

            addLog: (wfId, entry) => {
                set((s) => ({
                    executionLogs: {
                        ...s.executionLogs,
                        [wfId]: [
                            ...(s.executionLogs[wfId] || []),
                            { ts: Date.now(), ...entry },
                        ],
                    },
                }));
            },

            clearLogs: (wfId) => {
                set((s) => ({
                    executionLogs: { ...s.executionLogs, [wfId]: [] },
                }));
            },

            getLogs: (wfId) => get().executionLogs[wfId] || [],

            // ─── Workflow CRUD ─────────────────────────────

            createWorkflow: (data = {}) => {
                const wf = {
                    id: nanoid(10),
                    name: data.name || 'New Workflow',
                    description: data.description || '',
                    nodes: data.nodes || [
                        {
                            id: nanoid(8),
                            type: 'trigger',
                            label: 'Start',
                            config: { triggerType: 'manual' },
                            x: 60,
                            y: 200,
                            status: 'idle',
                            output: null,
                            runId: null,
                        },
                    ],
                    connections: data.connections || [],
                    enabled: true,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    lastRunAt: null,
                    lastRunStatus: null,
                };
                set((s) => ({
                    workflows: [...s.workflows, wf],
                    activeWorkflowId: wf.id,
                }));
                eventBus.emit('workflow:created', { id: wf.id, name: wf.name, nodeCount: wf.nodes.length });
                return wf;
            },

            updateWorkflow: (id, updates) => {
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
                    ),
                }));
                if ('enabled' in updates) {
                    const wf = get().workflows.find(w => w.id === id);
                    eventBus.emit('workflow:toggled', { id, name: wf?.name, enabled: updates.enabled });
                }
            },

            deleteWorkflow: (id) => {
                const wf = get().workflows.find(w => w.id === id);
                set((s) => ({
                    workflows: s.workflows.filter((w) => w.id !== id),
                    activeWorkflowId: s.activeWorkflowId === id ? null : s.activeWorkflowId,
                }));
                if (wf) eventBus.emit('workflow:deleted', { id, name: wf.name });
            },

            duplicateWorkflow: (id) => {
                const wf = get().workflows.find((w) => w.id === id);
                if (!wf) return null;
                const copy = {
                    ...JSON.parse(JSON.stringify(wf)),
                    id: nanoid(10),
                    name: wf.name + ' (copy)',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    lastRunAt: null,
                    lastRunStatus: null,
                };
                // Re-generate node IDs
                const idMap = {};
                copy.nodes.forEach((n) => {
                    const oldId = n.id;
                    n.id = nanoid(8);
                    idMap[oldId] = n.id;
                    n.status = 'idle';
                    n.output = null;
                    n.runId = null;
                });
                copy.connections = copy.connections.map((c) => ({
                    ...c,
                    id: nanoid(8),
                    from: idMap[c.from] || c.from,
                    to: idMap[c.to] || c.to,
                }));
                set((s) => ({ workflows: [...s.workflows, copy] }));
                return copy;
            },

            setActive: (id) => set({ activeWorkflowId: id }),

            getWorkflow: (id) => get().workflows.find((w) => w.id === id) || null,

            getActive: () => {
                const { workflows, activeWorkflowId } = get();
                return workflows.find((w) => w.id === activeWorkflowId) || null;
            },

            // ─── Node CRUD ────────────────────────────────

            addNode: (wfId, nodeData) => {
                const node = {
                    id: nanoid(8),
                    type: nodeData.type || 'command',
                    label: nodeData.label || nodeData.type || 'Node',
                    config: nodeData.config || {},
                    x: nodeData.x ?? 300,
                    y: nodeData.y ?? 200,
                    status: 'idle',
                    output: null,
                    runId: null,
                };
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? { ...w, nodes: [...w.nodes, node], updatedAt: Date.now() }
                            : w
                    ),
                }));
                return node;
            },

            updateNode: (wfId, nodeId, updates) => {
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? {
                                ...w,
                                nodes: w.nodes.map((n) =>
                                    n.id === nodeId ? { ...n, ...updates } : n
                                ),
                                updatedAt: Date.now(),
                            }
                            : w
                    ),
                }));
            },

            deleteNode: (wfId, nodeId) => {
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? {
                                ...w,
                                nodes: w.nodes.filter((n) => n.id !== nodeId),
                                connections: w.connections.filter(
                                    (c) => c.from !== nodeId && c.to !== nodeId
                                ),
                                updatedAt: Date.now(),
                            }
                            : w
                    ),
                }));
            },

            moveNode: (wfId, nodeId, x, y) => {
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? {
                                ...w,
                                nodes: w.nodes.map((n) =>
                                    n.id === nodeId ? { ...n, x, y } : n
                                ),
                            }
                            : w
                    ),
                }));
            },

            // Reset all node execution states
            resetNodeStates: (wfId) => {
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? {
                                ...w,
                                nodes: w.nodes.map((n) => ({
                                    ...n,
                                    status: 'idle',
                                    output: null,
                                    input: null,
                                    runId: null,
                                })),
                            }
                            : w
                    ),
                }));
            },

            // ─── Connections ──────────────────────────────

            addConnection: (wfId, from, to, label = null) => {
                // Prevent duplicates and self-connections
                const wf = get().workflows.find((w) => w.id === wfId);
                if (!wf) return null;
                if (from === to) return null;
                if (wf.connections.find((c) => c.from === from && c.to === to)) return null;

                const conn = {
                    id: nanoid(8),
                    from,
                    to,
                    fromPort: 'out',
                    toPort: 'in',
                    label: label || null,
                };
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? { ...w, connections: [...w.connections, conn], updatedAt: Date.now() }
                            : w
                    ),
                }));
                return conn;
            },

            deleteConnection: (wfId, connId) => {
                set((s) => ({
                    workflows: s.workflows.map((w) =>
                        w.id === wfId
                            ? {
                                ...w,
                                connections: w.connections.filter((c) => c.id !== connId),
                                updatedAt: Date.now(),
                            }
                            : w
                    ),
                }));
            },

            // ─── Helpers ──────────────────────────────────

            getDownstream: (wfId, nodeId) => {
                const wf = get().workflows.find((w) => w.id === wfId);
                if (!wf) return [];
                return wf.connections
                    .filter((c) => c.from === nodeId)
                    .map((c) => wf.nodes.find((n) => n.id === c.to))
                    .filter(Boolean);
            },

            getUpstream: (wfId, nodeId) => {
                const wf = get().workflows.find((w) => w.id === wfId);
                if (!wf) return [];
                return wf.connections
                    .filter((c) => c.to === nodeId)
                    .map((c) => wf.nodes.find((n) => n.id === c.from))
                    .filter(Boolean);
            },
        }),
        {
            name: 'onios-workflows',
            partialize: (state) => ({
                workflows: state.workflows.map((w) => ({
                    ...w,
                    nodes: w.nodes.map((n) => ({ ...n, status: 'idle', output: null, input: null, runId: null })),
                })),
                activeWorkflowId: state.activeWorkflowId,
                // Don't persist execution logs
            }),
        },
    ),
);

export default useWorkflowStore;
