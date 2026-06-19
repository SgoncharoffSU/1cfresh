import { create } from 'zustand';
import { DocumentRegistry, Integration, IntegrationKey, WidgetVisibility } from '@/types';

interface DocumentState {
  documents:         DocumentRegistry[];
  integrations:      Integration[];
  widgetVisibility:  WidgetVisibility;
  setDocuments:             (docs: DocumentRegistry[]) => void;
  toggleIntegration:        (key: IntegrationKey) => void;
  toggleWidgetVisibility:   (w: keyof WidgetVisibility) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  widgetVisibility: { stats: true, documents: true, integrations: true },

  integrations: [
    { key: 'TG',            label: 'Telegram',        icon: '✈️',  enabled: true,  connected: false },
    { key: 'MAX',           label: 'MAX',             icon: '⚡',  enabled: false, connected: false },
    { key: 'VK',            label: 'ВКонтакте',       icon: '💬',  enabled: true,  connected: true  },
    { key: 'INTERNAL_CHAT', label: 'Внутренний чат',  icon: '🏠',  enabled: true,  connected: true  },
    { key: '1C',            label: '1С:Фреш',         icon: '🔴',  enabled: true,  connected: false },
    { key: 'MOYSKLAD',      label: 'МойСклад',        icon: '📦',  enabled: false, connected: false },
    { key: 'B24',           label: 'Битрикс24',       icon: '🅱️',  enabled: false, connected: false },
    { key: 'DIADOC',        label: 'Диадок',          icon: '📄',  enabled: true,  connected: true  },
  ],

  setDocuments: (documents) => set({ documents }),

  toggleIntegration: (key) =>
    set((s) => ({
      integrations: s.integrations.map((i) =>
        i.key === key ? { ...i, enabled: !i.enabled } : i,
      ),
    })),

  toggleWidgetVisibility: (w) =>
    set((s) => ({
      widgetVisibility: { ...s.widgetVisibility, [w]: !s.widgetVisibility[w] },
    })),
}));
