import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyDemoAction,
  createSeedWorld,
  WORLD_STORAGE_KEY,
  type DemoAction,
  type DemoEvent,
  type DemoWorld
} from './world';

type WorldContextValue = {
  world: DemoWorld;
  lastEvent: DemoEvent | null;
  clearLastEvent: () => void;
  dispatch: (action: DemoAction) => DemoEvent | null;
  resetWorld: () => void;
};

const WorldContext = createContext<WorldContextValue | null>(null);

function readStoredWorld(): DemoWorld {
  try {
    const raw = localStorage.getItem(WORLD_STORAGE_KEY);
    if (!raw) return createSeedWorld();
    const parsed = JSON.parse(raw) as DemoWorld;
    if (parsed?.version !== 1) return createSeedWorld();
    return parsed;
  } catch {
    return createSeedWorld();
  }
}

function writeStoredWorld(world: DemoWorld) {
  try {
    localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(world));
  } catch {
    // lab remains usable without persistence
  }
}

export function DemoWorldProvider({ children }: { children: ReactNode }) {
  const [world, setWorld] = useState<DemoWorld>(() => readStoredWorld());
  const [lastEvent, setLastEvent] = useState<DemoEvent | null>(null);
  const worldRef = useRef(world);
  worldRef.current = world;

  useEffect(() => {
    writeStoredWorld(world);
  }, [world]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORLD_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as DemoWorld;
        if (parsed?.version === 1) setWorld(parsed);
      } catch {
        // ignore corrupt peer tab payload
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const dispatch = useCallback((action: DemoAction) => {
    const result = applyDemoAction(worldRef.current, action);
    worldRef.current = result.world;
    setWorld(result.world);
    if (result.event) setLastEvent(result.event);
    return result.event;
  }, []);

  const resetWorld = useCallback(() => {
    const fresh = createSeedWorld();
    worldRef.current = fresh;
    setWorld(fresh);
    setLastEvent(null);
    writeStoredWorld(fresh);
  }, []);

  const clearLastEvent = useCallback(() => setLastEvent(null), []);

  const value = useMemo(
    () => ({ world, lastEvent, clearLastEvent, dispatch, resetWorld }),
    [world, lastEvent, clearLastEvent, dispatch, resetWorld]
  );

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>;
}

export function useDemoWorld() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error('useDemoWorld must be used inside DemoWorldProvider');
  return ctx;
}
