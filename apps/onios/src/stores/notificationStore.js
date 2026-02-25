/**
 * notificationStore — Zustand store for toast notifications.
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { eventBus } from '../core/EventBus';

const useNotificationStore = create((set) => ({
    notifications: [],

    addNotification: (message, type = 'info', duration = 4000) => {
        const id = nanoid(6);

        const notification = { id, message, type, timestamp: Date.now() };
        set(state => ({
            notifications: [...state.notifications, notification],
        }));
        eventBus.emit('notification:created', notification);

        if (duration > 0) {
            setTimeout(() => {
                set(state => ({
                    notifications: state.notifications.filter(n => n.id !== id),
                }));
            }, duration);
        }

        return id;
    },

    dismissNotification: (id) => {
        set(state => ({
            notifications: state.notifications.filter(n => n.id !== id),
        }));
    },

    clearAll: () => set({ notifications: [] }),
}));

export default useNotificationStore;
