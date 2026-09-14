import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
  createEntry,
  deleteEntry,
  getDayTotals,
  listEntriesForDate,
  updateEntry,
} from '../db/entries';
import { todayKey } from '../lib/date';
import type { DayTotals, FoodEntry, NewFoodEntry } from '../lib/types';

const EMPTY_TOTALS: DayTotals = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

interface LogContextValue {
  /** The day the Log screen is showing. */
  date: string;
  setDate: (date: string) => void;
  entries: FoodEntry[];
  totals: DayTotals;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addEntry: (entry: NewFoodEntry) => Promise<void>;
  editEntry: (id: number, entry: NewFoodEntry) => Promise<void>;
  removeEntry: (id: number) => Promise<void>;
  /**
   * Bumped on every write. Screens that query days other than the selected one
   * (History) watch this instead of re-fetching on every focus.
   */
  version: number;
}

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [date, setDate] = useState<string>(todayKey);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [totals, setTotals] = useState<DayTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async (target: string) => {
    try {
      setError(null);
      const [rows, sums] = await Promise.all([
        listEntriesForDate(target),
        getDayTotals(target),
      ]);
      setEntries(rows);
      setTotals(sums);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('log.loadFailedDefault'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    void load(date);
  }, [date, load]);

  const refresh = useCallback(() => load(date), [date, load]);

  /** Every mutation reloads the visible day and signals other screens. */
  const afterWrite = useCallback(async () => {
    await load(date);
    setVersion((v) => v + 1);
  }, [date, load]);

  const addEntry = useCallback(
    async (entry: NewFoodEntry) => {
      await createEntry(entry);
      await afterWrite();
    },
    [afterWrite]
  );

  const editEntry = useCallback(
    async (id: number, entry: NewFoodEntry) => {
      await updateEntry(id, entry);
      await afterWrite();
    },
    [afterWrite]
  );

  const removeEntry = useCallback(
    async (id: number) => {
      await deleteEntry(id);
      await afterWrite();
    },
    [afterWrite]
  );

  const value = useMemo(
    () => ({
      date,
      setDate,
      entries,
      totals,
      loading,
      error,
      refresh,
      addEntry,
      editEntry,
      removeEntry,
      version,
    }),
    [date, entries, totals, loading, error, refresh, addEntry, editEntry, removeEntry, version]
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used inside a LogProvider');
  return ctx;
}
