/**
 * All day keys are local-calendar `YYYY-MM-DD`. Deliberately not UTC: a day in
 * a food log is the day the user was awake for, not a timezone-shifted slice.
 */
import i18n from '../i18n/index';

export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return dateKey();
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const date = keyToDate(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** Inclusive count of days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  const ms = keyToDate(to).getTime() - keyToDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

const WEEKDAYS: Record<'en' | 'bg', string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  bg: ['Нед', 'Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб'],
};
const MONTHS_SHORT: Record<'en' | 'bg', string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  bg: ['яну', 'фев', 'март', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'],
};
const MONTHS_LONG: Record<'en' | 'bg', string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  bg: [
    'януари', 'февруари', 'март', 'април', 'май', 'юни',
    'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
  ],
};

/** Current app language, narrowed to the two locales this file knows about. */
function lang(): 'en' | 'bg' {
  return i18n.language === 'bg' ? 'bg' : 'en';
}

/** "Today", "Yesterday", or "Mon 2 Sep". */
export function formatDayLabel(key: string, today: string = todayKey()): string {
  if (key === today) return i18n.t('common.today');
  if (key === addDays(today, -1)) return i18n.t('common.yesterday');
  const date = keyToDate(key);
  const l = lang();
  return `${WEEKDAYS[l][date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[l][date.getMonth()]}`;
}

/** "2 September 2026" — for headers where the full date matters. */
export function formatLongDate(key: string): string {
  const date = keyToDate(key);
  const l = lang();
  return `${date.getDate()} ${MONTHS_LONG[l][date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
