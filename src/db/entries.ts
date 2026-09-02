import type { DaySummary, DayTotals, FoodEntry, NewFoodEntry } from '../lib/types';
import { getDb } from './index';
import {
  DELETE_ENTRY,
  INSERT_ENTRY,
  SELECT_DAY_SUMMARIES,
  SELECT_DAY_TOTALS,
  SELECT_ENTRIES_FOR_DATE,
  SELECT_ENTRY_BY_ID,
  SELECT_RECENT_FOODS,
  UPDATE_ENTRY,
  insertEntryParams,
  updateEntryParams,
} from './sql';

const EMPTY_TOTALS: DayTotals = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

export async function listEntriesForDate(date: string): Promise<FoodEntry[]> {
  const db = await getDb();
  return db.getAllAsync<FoodEntry>(SELECT_ENTRIES_FOR_DATE, [date]);
}

export async function getEntry(id: number): Promise<FoodEntry | null> {
  const db = await getDb();
  return (await db.getFirstAsync<FoodEntry>(SELECT_ENTRY_BY_ID, [id])) ?? null;
}

export async function createEntry(entry: NewFoodEntry): Promise<FoodEntry> {
  const db = await getDb();
  const logged_at = entry.logged_at ?? new Date().toISOString();
  const result = await db.runAsync(INSERT_ENTRY, insertEntryParams(entry, logged_at));
  return { ...entry, logged_at, id: result.lastInsertRowId };
}

/** Replaces every editable field on an existing entry. */
export async function updateEntry(id: number, entry: NewFoodEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPDATE_ENTRY, updateEntryParams(entry, id));
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(DELETE_ENTRY, [id]);
}

export async function getDayTotals(date: string): Promise<DayTotals> {
  const db = await getDb();
  const row = await db.getFirstAsync<DayTotals>(SELECT_DAY_TOTALS, [date]);
  return row ?? EMPTY_TOTALS;
}

/**
 * One row per day that has at least one entry, newest first.
 * Days with nothing logged are simply absent — callers decide how to show gaps.
 */
export async function listDaySummaries(fromDate: string, toDate: string): Promise<DaySummary[]> {
  const db = await getDb();
  return db.getAllAsync<DaySummary>(SELECT_DAY_SUMMARIES, [fromDate, toDate]);
}

export async function listRecentFoods(limit = 20): Promise<FoodEntry[]> {
  const db = await getDb();
  return db.getAllAsync<FoodEntry>(SELECT_RECENT_FOODS, [limit]);
}
