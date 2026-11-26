import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

export interface DockedModalItem {
  id: string;
  labelEn: string;
  labelFa: string;
  badge?: string;
  category: 'tools' | 'device' | 'terminal' | 'system' | 'config';
  /** Active application tab when the modal was minimized (auto-stamped if omitted). */
  ownerTab?: string;
  /**
   * Set to true for portal-rendered modals (such as Remote Server RDP/VNC/SSH modals)
   * that render directly on document.body and can restore cleanly on top of any tab
   * without switching away from the user's current view.
   */
  keepCurrentTab?: boolean;
  onRestore: () => void;
  onClose?: () => void;
}

interface ModalDockContextType {
  dockedModals: DockedModalItem[];
  dockModal: (item: DockedModalItem) => void;
  undockModal: (id: string) => void;
  isDocked: (id: string) => boolean;
  restoreModal: (id: string) => void;
  restoreAllModals: () => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
  setActiveTabContext: (tab: string) => void;
  registerTabNavigator: (navigator: (tab: string) => void) => void;
}

const ModalDockContext = createContext<ModalDockContextType | undefined>(undefined);

export const ModalDockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dockedModals, setDockedModals] = useState<DockedModalItem[]>([]);
  const dockedModalsRef = useRef<DockedModalItem[]>([]);
  dockedModalsRef.current = dockedModals;

  const activeTabRef = useRef<string>('dashboard');
  const tabNavigatorRef = useRef<((tab: string) => void) | null>(null);

  const setActiveTabContext = useCallback((tab: string) => {
    activeTabRef.current = tab;
  }, []);

  const registerTabNavigator = useCallback((navigator: (tab: string) => void) => {
    tabNavigatorRef.current = navigator;
  }, []);

  const dockModal = useCallback((item: DockedModalItem) => {
    const stampedItem: DockedModalItem = {
      ...item,
      ownerTab: item.ownerTab || activeTabRef.current,
    };
    setDockedModals((prev) => {
      const filtered = prev.filter((m) => m.id !== stampedItem.id);
      const next = [...filtered, stampedItem];
      dockedModalsRef.current = next;
      return next;
    });
  }, []);

  const undockModal = useCallback((id: string) => {
    setDockedModals((prev) => {
      const next = prev.filter((m) => m.id !== id);
      dockedModalsRef.current = next;
      return next;
    });
  }, []);

  const isDocked = useCallback(
    (id: string) => dockedModals.some((m) => m.id === id),
    [dockedModals]
  );

  const restoreModal = useCallback((id: string) => {
    const item = dockedModalsRef.current.find((m) => m.id === id);
    if (!item) return;

    setDockedModals((prev) => {
      const next = prev.filter((m) => m.id !== id);
      dockedModalsRef.current = next;
      return next;
    });

    if (
      !item.keepCurrentTab &&
      item.ownerTab &&
      activeTabRef.current !== item.ownerTab &&
      tabNavigatorRef.current
    ) {
      tabNavigatorRef.current(item.ownerTab);
    }

    item.onRestore();
  }, []);

  const restoreAllModals = useCallback(() => {
    const items = [...dockedModalsRef.current];
    if (items.length === 0) return;

    dockedModalsRef.current = [];
    setDockedModals([]);

    let targetTab: string | undefined;
    items.forEach((item) => {
      if (!item.keepCurrentTab && item.ownerTab && item.ownerTab !== activeTabRef.current) {
        targetTab = item.ownerTab;
      }
      item.onRestore();
    });

    if (targetTab && tabNavigatorRef.current) {
      tabNavigatorRef.current(targetTab);
    }
  }, []);

  const closeModal = useCallback((id: string) => {
    const item = dockedModalsRef.current.find((m) => m.id === id);
    setDockedModals((prev) => {
      const next = prev.filter((m) => m.id !== id);
      dockedModalsRef.current = next;
      return next;
    });
    if (item && item.onClose) {
      item.onClose();
    }
  }, []);

  const closeAllModals = useCallback(() => {
    const items = [...dockedModalsRef.current];
    dockedModalsRef.current = [];
    setDockedModals([]);
    items.forEach((item) => {
      if (item.onClose) item.onClose();
    });
  }, []);

  return (
    <ModalDockContext.Provider
      value={{
        dockedModals,
        dockModal,
        undockModal,
        isDocked,
        restoreModal,
        restoreAllModals,
        closeModal,
        closeAllModals,
        setActiveTabContext,
        registerTabNavigator,
      }}
    >
      {children}
    </ModalDockContext.Provider>
  );
};

export const useModalDock = (): ModalDockContextType => {
  const ctx = useContext(ModalDockContext);
  if (!ctx) {
    // Fallback safe dummy context if used outside provider
    return {
      dockedModals: [],
      dockModal: () => {},
      undockModal: () => {},
      isDocked: () => false,
      restoreModal: () => {},
      restoreAllModals: () => {},
      closeModal: () => {},
      closeAllModals: () => {},
      setActiveTabContext: () => {},
      registerTabNavigator: () => {},
    };
  }
  return ctx;
};
