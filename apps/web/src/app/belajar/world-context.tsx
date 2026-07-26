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

function hydrateWorld(raw: Partial<DemoWorld> | null | undefined): DemoWorld {
  const seed = createSeedWorld();
  if (!raw || raw.version !== 1) return seed;
  return {
    ...seed,
    ...raw,
    characters: { ...seed.characters, ...raw.characters },
    leave: { ...seed.leave, ...raw.leave },
    session: { ...seed.session, ...raw.session },
    devices: { ...seed.devices, ...raw.devices },
    studentDay: { ...seed.studentDay, ...raw.studentDay },
    stats: { ...seed.stats, ...raw.stats },
    flags: Array.isArray(raw.flags) ? raw.flags : seed.flags,
    picketNotes: Array.isArray(raw.picketNotes) ? raw.picketNotes : seed.picketNotes,
    sessionsToday: Array.isArray(raw.sessionsToday) ? raw.sessionsToday : seed.sessionsToday,
    auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : seed.auditLog,
    trend: Array.isArray(raw.trend) ? raw.trend : seed.trend,
    notifications: { ...seed.notifications, ...raw.notifications },
    events: Array.isArray(raw.events) ? raw.events : seed.events
  };
}

function readStoredWorld(): DemoWorld {
  try {
    const raw = localStorage.getItem(WORLD_STORAGE_KEY);
    if (!raw) return createSeedWorld();
    return hydrateWorld(JSON.parse(raw) as Partial<DemoWorld>);
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
        setWorld(hydrateWorld(JSON.parse(event.newValue) as Partial<DemoWorld>));
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
