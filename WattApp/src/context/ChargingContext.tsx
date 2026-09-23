import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

interface ChargingContextType {
  activeSessionId: string | null;
  activeStationName: string | null;
  activePackageId: string | null;
  setActiveSession: (id: string, name: string, packageId?: string) => void;
  clearActiveSession: () => void;
}

const ChargingContext = createContext<ChargingContextType>({
  activeSessionId: null,
  activeStationName: null,
  activePackageId: null,
  setActiveSession: () => {},
  clearActiveSession: () => {},
});

export function ChargingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [activeStationName, setActiveStationName] = useState<string | null>(null);

  const setActiveSession = (id: string, name: string, packageId?: string) => {
    setActiveSessionId(id);
    setActiveStationName(name);
    setActivePackageId(packageId ?? null);
  };

  const clearActiveSession = () => {
    setActiveSessionId(null);
    setActiveStationName(null);
    setActivePackageId(null);
  };

  // Recover an in-progress charging session after an app restart. The context
  // is in-memory, so a force-close would otherwise orphan the session — the
  // user couldn't see or stop it (it would just run until auto-shutoff bills
  // it). On login we look up any still-active session and restore the banner.
  useEffect(() => {
    if (!session?.user?.id) {
      setActiveSessionId(null);
      setActiveStationName(null);
      setActivePackageId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await api.sessions.active().catch(() => null);
      if (cancelled || !data) return;
      const name =
        data.station?.name ||
        data.listing?.station_name ||
        data.listing?.address ||
        '';
      // Don't clobber a session already being tracked from the live flow.
      setActiveSessionId(prev => prev ?? data.id);
      setActiveStationName(prev => prev ?? name);
      setActivePackageId(prev => prev ?? data.entitlement_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  return (
    <ChargingContext.Provider value={{ activeSessionId, activeStationName, activePackageId, setActiveSession, clearActiveSession }}>
      {children}
    </ChargingContext.Provider>
  );
}

export const useCharging = () => useContext(ChargingContext);
