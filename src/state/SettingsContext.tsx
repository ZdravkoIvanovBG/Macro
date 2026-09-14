import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getLocales } from 'expo-localization';

import i18n, { type AppLanguage } from '../i18n/index';
import { getSetting, setSetting } from '../db/settings';

const LANGUAGE_KEY = 'language';

function detectDeviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'bg' ? 'bg' : 'en';
}

interface SettingsContextValue {
  language: AppLanguage;
  /** True until the persisted/detected language has been applied once. */
  loading: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let next: AppLanguage;
      try {
        const stored = await getSetting(LANGUAGE_KEY);
        if (stored === 'en' || stored === 'bg') {
          next = stored;
        } else {
          next = detectDeviceLanguage();
          await setSetting(LANGUAGE_KEY, next);
        }
      } catch {
        next = detectDeviceLanguage();
      }
      if (cancelled) return;
      await i18n.changeLanguage(next);
      setLanguageState(next);
      setLoading(false);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    await i18n.changeLanguage(next);
    setLanguageState(next);
    await setSetting(LANGUAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ language, loading, setLanguage }), [language, loading, setLanguage]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside a SettingsProvider');
  return ctx;
}
