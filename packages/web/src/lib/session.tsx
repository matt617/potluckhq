import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Community, MeResponse, PublicConfig, Role } from '@potluck/core';
import { api } from '../api';
import { isSignedIn } from './auth';
import { readStore, writeStore } from './storage';

const COMMUNITY_KEY = 'potluck.community';

export type CommunityWithRole = Community & { role: Role };

interface SessionValue {
  signedIn: boolean;
  me: MeResponse | null;
  publicConfig: PublicConfig | null;
  loading: boolean;
  error: unknown;
  community: CommunityWithRole | null;
  setCommunityId: (id: string) => void;
  refreshMe: () => Promise<MeResponse | null>;
  setMe: (me: MeResponse) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const signedIn = isSignedIn();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<unknown>();
  const [communityId, setCommunityIdState] = useState<string | null>(() => readStore(COMMUNITY_KEY));

  useEffect(() => {
    api
      .config()
      .then(setPublicConfig)
      .catch(() => setPublicConfig(null));
  }, []);

  const refreshMe = useCallback(async () => {
    if (!isSignedIn()) return null;
    try {
      const next = await api.me();
      setMe(next);
      setError(undefined);
      return next;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void refreshMe();
  }, [signedIn, refreshMe]);

  const setCommunityId = useCallback((id: string) => {
    setCommunityIdState(id);
    writeStore(COMMUNITY_KEY, id);
  }, []);

  const community = useMemo(() => {
    const list = me?.communities ?? [];
    return list.find((c) => c.id === communityId) ?? list.find((c) => c.id === me?.user.defaultCommunityId) ?? list[0] ?? null;
  }, [me, communityId]);

  const value: SessionValue = {
    signedIn,
    me,
    publicConfig,
    loading,
    error,
    community,
    setCommunityId,
    refreshMe,
    setMe,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** For pages that require a selected community; Layout guarantees it is set. */
export function useCommunity(): CommunityWithRole {
  const { community } = useSession();
  if (!community) throw new Error('No community selected');
  return community;
}

export function canAdmin(role: Role | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
