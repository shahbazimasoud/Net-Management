import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface DockedModalItem {
  id: string;
  labelEn: string;
  labelFa: string;
  badge?: string;
  category: 'tools' | 'device' | 'terminal' | 'system' | 'config';
  onRestore: () => void;
  onClose?: () => void;
}

interface ModalDockContextType {
  dockedModals: DockedModalItem[];
  dockModal: (item: DockedModalItem) => void;
  undockModal: (id: string) => void;
  isDocked: (id: string) => boolean;
  restoreModal: (id: string) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
}

const ModalDockContext = createContext<ModalDockContextType | undefined>(undefined);

export const ModalDockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dockedModals, setDockedModals] = useState<DockedModalItem[]>([]);

  const dockModal = useCallback((item: DockedModalItem) => {
    setDockedModals((prev) => {
      const filtered = prev.filter((m) => m.id !== item.id);
      return [...filtered, item];
    });
  }, []);

  const undockModal = useCallback((id: string) => {
    setDockedModals((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const isDocked = useCallback(
    (id: string) => dockedModals.some((m) => m.id === id),
    [dockedModals]
  );

  const restoreModal = useCallback(
    (id: string) => {
      const item = dockedModals.find((m) => m.id === id);
      if (item) {
        item.onRestore();
        setDockedModals((prev) => prev.filter((m) => m.id !== id));
      }
    },
    [dockedModals]
  );

  const closeModal = useCallback(
    (id: string) => {
      const item = dockedModals.find((m) => m.id === id);
      if (item && item.onClose) {
        item.onClose();
      }
      setDockedModals((prev) => prev.filter((m) => m.id !== id));
    },
    [dockedModals]
  );

  const closeAllModals = useCallback(() => {
    dockedModals.forEach((item) => {
      if (item.onClose) item.onClose();
    });
    setDockedModals([]);
  }, [dockedModals]);

  return (
    <ModalDockContext.Provider
      value={{
        dockedModals,
        dockModal,
        undockModal,
        isDocked,
        restoreModal,
        closeModal,
        closeAllModals,
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
      closeModal: () => {},
      closeAllModals: () => {},
    };
  }
  return ctx;
};
