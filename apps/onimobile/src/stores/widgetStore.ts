/**
 * widgetStore — Manages the currently active widget (one at a time).
 */

import { create } from 'zustand';

export type WidgetType =
  | 'terminal'
  | 'notes'
  | 'calculator'
  | 'files'
  | 'browser'
  | 'settings'
  | 'activity'
  | 'weather'
  | 'clock'
  | null;

interface WidgetState {
  activeWidget: WidgetType;
  widgetProps: Record<string, any>;
  history: WidgetType[];
  openWidget: (type: WidgetType, props?: Record<string, any>) => void;
  closeWidget: () => void;
  goBack: () => void;
}

const useWidgetStore = create<WidgetState>((set, get) => ({
  activeWidget: null,
  widgetProps: {},
  history: [],

  openWidget: (type, props = {}) => {
    const current = get().activeWidget;
    set({
      activeWidget: type,
      widgetProps: props,
      history: current ? [...get().history, current] : get().history,
    });
  },

  closeWidget: () => {
    set({ activeWidget: null, widgetProps: {}, history: [] });
  },

  goBack: () => {
    const hist = get().history;
    if (hist.length > 0) {
      const prev = hist[hist.length - 1];
      set({
        activeWidget: prev,
        widgetProps: {},
        history: hist.slice(0, -1),
      });
    } else {
      set({ activeWidget: null, widgetProps: {} });
    }
  },
}));

export default useWidgetStore;
