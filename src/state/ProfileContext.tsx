import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getProfile, saveProfile } from '../db/profile';
import type { Profile, ProfileInput } from '../lib/types';

interface ProfileContextValue {
  profile: Profile | null;
  /** True until the first read from SQLite settles. */
  loading: boolean;
  error: string | null;
  save: (input: ProfileInput) => Promise<void>;
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setProfile(await getProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: ProfileInput) => {
    // Let the caller surface failures — it knows which form to attach them to.
    const saved = await saveProfile(input);
    setProfile(saved);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ profile, loading, error, save, reload }),
    [profile, loading, error, save, reload]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside a ProfileProvider');
  return ctx;
}
