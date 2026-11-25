// Utilitários determinísticos de agendamento editorial no fuso de Brasília (UTC-3, sem horário de verão)

export const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

export interface PrimeSlot {
  iso: string;
  label: string;
  shortLabel: string;
  dateKey: string;
  timeLabel: string;
}

const PRIME_SLOTS_BY_LIMIT: Record<number, { h: number; m: number; label: string }[]> = {
  1: [{ h: 8, m: 0, label: '08h00' }],
  2: [
    { h: 8, m: 0, label: '08h00' },
    { h: 18, m: 30, label: '18h30' },
  ],
  3: [
    { h: 8, m: 0, label: '08h00' },
    { h: 12, m: 30, label: '12h30' },
    { h: 18, m: 30, label: '18h30' },
  ],
};

function toBrtParts(date: Date): { year: number; month: number; day: number; dateKey: string } {
  const shifted = new Date(date.getTime() + BRT_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { year, month, day, dateKey: `${year}-${pad(month)}-${pad(day)}` };
}

function brtSlotToUtc(year: number, month: number, day: number, h: number, m: number): Date {
  // BRT (UTC-3) => UTC = BRT + 3h
  return new Date(Date.UTC(year, month - 1, day, h + 3, m, 0, 0));
}

export function formatBrtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const shifted = new Date(d.getTime() + BRT_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)} às ${pad(shifted.getUTCHours())}h${pad(shifted.getUTCMinutes())}`;
}

export function isScheduledPauta(row: { status?: string; published_at?: string | null }, now = new Date()): boolean {
  if (row.status !== 'published' || !row.published_at) return false;
  const ts = new Date(row.published_at).getTime();
  return !Number.isNaN(ts) && ts > now.getTime();
}

export function findNextPrimeSlot(
  existingPublishedIsos: (string | null | undefined)[],
  dailyLimit = 3,
  now = new Date()
): PrimeSlot | null {
  const clampedLimit = Math.max(1, Math.min(3, Math.round(dailyLimit)));
  const slotsForDay = PRIME_SLOTS_BY_LIMIT[clampedLimit] || PRIME_SLOTS_BY_LIMIT[3];

  const validDates = existingPublishedIsos
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()));

  const countByDate = new Map<string, number>();
  for (const d of validDates) {
    const { dateKey } = toBrtParts(d);
    countByDate.set(dateKey, (countByDate.get(dateKey) || 0) + 1);
  }

  const todayKey = toBrtParts(now).dateKey;
  const tomorrowKey = toBrtParts(new Date(now.getTime() + 86400000)).dateKey;
  const minTs = now.getTime() + 10 * 60 * 1000; // pelo menos 10 min no futuro

  for (let offsetDays = 0; offsetDays < 30; offsetDays++) {
    const candidateDay = new Date(now.getTime() + offsetDays * 86400000);
    const { year, month, day, dateKey } = toBrtParts(candidateDay);

    if ((countByDate.get(dateKey) || 0) >= clampedLimit) continue;

    for (const slot of slotsForDay) {
      const slotDate = brtSlotToUtc(year, month, day, slot.h, slot.m);
      if (slotDate.getTime() < minTs) continue;

      const hasCollision = validDates.some(
        (d) => Math.abs(d.getTime() - slotDate.getTime()) < 90 * 60 * 1000
      );
      if (hasCollision) continue;

      const pad = (n: number) => String(n).padStart(2, '0');
      const dayLabel =
        dateKey === todayKey
          ? 'Hoje'
          : dateKey === tomorrowKey
            ? 'Amanhã'
            : `${pad(day)}/${pad(month)}`;

      return {
        iso: slotDate.toISOString(),
        label: `${dayLabel} às ${slot.label}`,
        shortLabel: `${dayLabel} ${slot.label}`,
        dateKey,
        timeLabel: slot.label,
      };
    }
  }

  return null;
}

export function computeNextPrimeSlot(
  existingPublishedIsos: (string | null | undefined)[],
  dailyLimit = 3,
  now = new Date()
): PrimeSlot {
  const found = findNextPrimeSlot(existingPublishedIsos, dailyLimit, now);
  if (found) return found;
  const fallback = new Date(now.getTime() + 3600000);
  return {
    iso: fallback.toISOString(),
    label: formatBrtDateTime(fallback.toISOString()),
    shortLabel: formatBrtDateTime(fallback.toISOString()),
    dateKey: toBrtParts(fallback).dateKey,
    timeLabel: '08h00',
  };
}

export interface EditorialRhythmMetrics {
  publishedToday: number;
  scheduledTotal: number;
  scheduledToday: number;
  publishedLast7Days: number;
  oldestRecentCheckNeeded: boolean;
  nextSlotNormal: PrimeSlot;
  nextSlotCaution: PrimeSlot;
}

export function getEditorialRhythmMetrics(
  pautas: { status?: string; published_at?: string | null }[],
  now = new Date()
): EditorialRhythmMetrics {
  const todayKey = toBrtParts(now).dateKey;
  const nowMs = now.getTime();
  const sevenDaysAgoMs = nowMs - 7 * 86400000;
  const threeDaysAgoMs = nowMs - 3 * 86400000;

  let publishedToday = 0;
  let scheduledTotal = 0;
  let scheduledToday = 0;
  let publishedLast7Days = 0;
  let oldestRecentCheckNeeded = false;

  const publishedIsos: string[] = [];

  for (const p of pautas) {
    if (p.status !== 'published' || !p.published_at) continue;
    const d = new Date(p.published_at);
    const ts = d.getTime();
    if (Number.isNaN(ts)) continue;
    publishedIsos.push(p.published_at);
    const { dateKey } = toBrtParts(d);

    if (ts > nowMs) {
      scheduledTotal++;
      if (dateKey === todayKey) scheduledToday++;
    } else {
      if (dateKey === todayKey) publishedToday++;
      if (ts >= sevenDaysAgoMs) publishedLast7Days++;
      if (ts <= threeDaysAgoMs && ts >= sevenDaysAgoMs) {
        oldestRecentCheckNeeded = true;
      }
    }
  }

  return {
    publishedToday,
    scheduledTotal,
    scheduledToday,
    publishedLast7Days,
    oldestRecentCheckNeeded,
    nextSlotNormal: computeNextPrimeSlot(publishedIsos, 3, now),
    nextSlotCaution: computeNextPrimeSlot(publishedIsos, 2, now),
  };
}
