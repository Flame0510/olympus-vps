'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface ProviderEntry {
  provider: string;
  emoji: string;
  models: { id: string; label: string }[];
}

interface ModelsContextValue {
  providers: ProviderEntry[];
  loaded: boolean;
}

const ModelsContext = createContext<ModelsContextValue>({ providers: [], loaded: false });

export function ModelsProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length) setProviders(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true)); // fallback silenzioso
  }, []);

  return (
    <ModelsContext.Provider value={{ providers, loaded }}>
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels() {
  return useContext(ModelsContext);
}
