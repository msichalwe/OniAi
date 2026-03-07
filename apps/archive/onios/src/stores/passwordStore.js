/**
 * passwordStore — Zustand store for the password vault.
 *
 * Persists to localStorage with basic XOR obfuscation.
 * NOT real encryption — this is a demo/dev tool, not production security.
 * For real use, integrate Web Crypto API or a proper vault backend.
 *
 * Entry shape:
 * {
 *   id, title, username, password (obfuscated), url,
 *   notes, category, createdAt, updatedAt, favorite
 * }
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

// Simple XOR obfuscation (NOT real encryption — demo only)
const OBFUSCATION_KEY = 'oniOS-vault-k3y';

function obfuscate(str) {
    if (!str) return '';
    return Array.from(str)
        .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)))
        .join('');
}

function deobfuscate(str) {
    return obfuscate(str); // XOR is symmetric
}

/**
 * Generate a random password.
 */
function generatePassword(length = 16, options = {}) {
    const {
        uppercase = true,
        lowercase = true,
        numbers = true,
        symbols = true,
    } = options;

    let chars = '';
    if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (numbers) chars += '0123456789';
    if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (n) => chars[n % chars.length]).join('');
}

/**
 * Calculate password strength (0-100).
 */
function calculateStrength(password) {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 20;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 15;
    if (new Set(password).size >= password.length * 0.7) score += 15;
    return Math.min(100, score);
}

function strengthLabel(score) {
    if (score >= 80) return 'Strong';
    if (score >= 50) return 'Medium';
    if (score >= 30) return 'Weak';
    return 'Very Weak';
}

const usePasswordStore = create(
    persist(
        (set, get) => ({
            entries: [],
            vaultLocked: true,
            masterHash: null, // stored hash of master password

            // ─── Vault Lock ───────────────────────────────

            setMasterPassword: (password) => {
                // Simple hash for demo (NOT production-grade)
                const hash = Array.from(password).reduce(
                    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0
                ).toString(36);
                set({ masterHash: hash, vaultLocked: false });
            },

            unlock: (password) => {
                const hash = Array.from(password).reduce(
                    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0
                ).toString(36);
                if (hash === get().masterHash) {
                    set({ vaultLocked: false });
                    return true;
                }
                return false;
            },

            lock: () => set({ vaultLocked: true }),

            isSetup: () => get().masterHash !== null,

            // ─── CRUD ─────────────────────────────────────

            addEntry: (data) => {
                const entry = {
                    id: nanoid(10),
                    title: data.title || 'Untitled',
                    username: data.username || '',
                    password: obfuscate(data.password || ''),
                    url: data.url || '',
                    notes: data.notes || '',
                    category: data.category || 'general',
                    favorite: data.favorite || false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                set((state) => ({ entries: [...state.entries, entry] }));
                return { ...entry, password: '***' };
            },

            updateEntry: (id, updates) => {
                set((state) => ({
                    entries: state.entries.map((e) => {
                        if (e.id !== id) return e;
                        const updated = { ...e, ...updates, updatedAt: Date.now() };
                        if (updates.password !== undefined) {
                            updated.password = obfuscate(updates.password);
                        }
                        return updated;
                    }),
                }));
            },

            deleteEntry: (id) => {
                set((state) => ({
                    entries: state.entries.filter((e) => e.id !== id),
                }));
            },

            toggleFavorite: (id) => {
                set((state) => ({
                    entries: state.entries.map((e) =>
                        e.id === id ? { ...e, favorite: !e.favorite, updatedAt: Date.now() } : e
                    ),
                }));
            },

            // ─── Queries ──────────────────────────────────

            getEntry: (id) => {
                const entry = get().entries.find((e) => e.id === id);
                if (!entry) return null;
                return { ...entry, password: deobfuscate(entry.password) };
            },

            getDecryptedPassword: (id) => {
                const entry = get().entries.find((e) => e.id === id);
                return entry ? deobfuscate(entry.password) : null;
            },

            search: (query) => {
                const q = query.toLowerCase();
                return get().entries.filter(
                    (e) =>
                        e.title.toLowerCase().includes(q) ||
                        e.username.toLowerCase().includes(q) ||
                        e.url.toLowerCase().includes(q) ||
                        e.category.toLowerCase().includes(q)
                ).map((e) => ({ ...e, password: '***' }));
            },

            getByCategory: (category) => {
                return get().entries
                    .filter((e) => e.category === category)
                    .map((e) => ({ ...e, password: '***' }));
            },

            getCategories: () => {
                const cats = new Set(get().entries.map((e) => e.category));
                return Array.from(cats);
            },

            getFavorites: () => {
                return get().entries
                    .filter((e) => e.favorite)
                    .map((e) => ({ ...e, password: '***' }));
            },

            // ─── Utils ────────────────────────────────────

            generatePassword,
            calculateStrength,
            strengthLabel,
        }),
        {
            name: 'onios-vault',
            partialize: (state) => ({
                entries: state.entries,
                masterHash: state.masterHash,
                vaultLocked: true, // always lock on reload
            }),
        },
    ),
);

export default usePasswordStore;
export { generatePassword, calculateStrength, strengthLabel };
