// ---------------------------------------------------------------------------
// EVERY local-first queue, in one shape. Audit §3.5.
//
// This app writes five kinds of thing locally first and syncs them in the
// background with retries: logged sets, water, grocery items, cardio logs and
// meal events. Each gives up after a handful of attempts and moves the item
// to its own dead-letter store, where it stays until someone deals with it.
//
// Only ONE of the five had a screen. OfflineStatusIndicator subscribed to
// set-log-store alone, so water, grocery, cardio and meal events could each
// exhaust their retries and be dropped permanently with no indicator anywhere
// in the app, on any screen. A user could log a week of water on a bad
// connection, lose all of it, and never be told.
//
// This module is a READER, not a second queue. Every store still owns its own
// localStorage key, its own op format, and its own retry/discard logic — the
// alternative, an indicator reaching into five different storage layouts
// itself, is five copies of a rule waiting to drift apart. All this does is
// give them one interface and one label vocabulary.
// ---------------------------------------------------------------------------

import * as setLogStore from './set-log-store'
import * as waterStore from './water-store'
import * as groceryStore from './grocery-store'
import * as cardioStore from './cardio-log-store'
import * as mealStore from './meal-store'

/** Which queue an item came from — drives the label the user reads, nothing else. */
export type QueueKind = 'set' | 'water' | 'grocery' | 'cardio' | 'meal'

export const QUEUE_LABEL: Record<QueueKind, string> = {
  set: 'Logged set',
  water: 'Water',
  grocery: 'Shopping item',
  cardio: 'Cardio',
  meal: 'Meal',
}

/** One permanently-failed item, from any of the five queues. */
export interface FailedItem {
  queue: QueueKind
  clientId: string
  /** What it was, in the user's words — "3 sets of Barbell Squats", "500 ml". */
  label: string
  /** The day it belongs to, when the queue records one. */
  date: string
  /** The underlying failure, for the details line. Never the primary message. */
  errorMessage: string
  failedAt: string
}

/**
 * Everything currently stuck across all five queues, newest failure first.
 *
 * Defensive per queue: a store whose localStorage entry is corrupt must not
 * take the whole indicator down with it, because the indicator is the only
 * thing that would tell the user anything is wrong at all.
 */
export function getAllFailedItems(): FailedItem[] {
  const out: FailedItem[] = []
  const collect = (fn: () => FailedItem[]) => {
    try { out.push(...fn()) } catch { /* one bad queue must not hide the other four */ }
  }

  collect(() => setLogStore.getDeadLetterItems().map(i => ({
    queue: 'set' as const,
    clientId: i.clientId,
    label: `${i.exerciseName} · set ${i.setNumber}`,
    date: i.date,
    errorMessage: i.errorMessage,
    failedAt: i.failedAt,
  })))

  collect(() => waterStore.getDeadLetterItems().map(i => ({
    queue: 'water' as const,
    clientId: i.clientId,
    label: i.label,
    date: i.date,
    errorMessage: i.errorMessage,
    failedAt: i.failedAt,
  })))

  collect(() => groceryStore.getDeadLetterItems().map(i => ({
    queue: 'grocery' as const,
    clientId: i.clientId,
    label: i.label,
    date: '',
    errorMessage: i.errorMessage,
    failedAt: i.failedAt,
  })))

  // Cardio has no separate dead-letter store — a failed log stays in the
  // pending list marked `failed`, which is the same state by another name.
  collect(() => cardioStore.getPendingCardioFailures().map(i => ({
    queue: 'cardio' as const,
    clientId: i.clientId ?? '',
    label: i.activity_name || 'Cardio',
    date: i.date,
    errorMessage: "Wouldn't sync",
    failedAt: i.date,
  })))

  collect(() => mealStore.getDeadLetterItems().map(i => ({
    queue: 'meal' as const,
    clientId: i.clientId,
    label: i.label,
    date: i.date,
    errorMessage: i.errorMessage,
    failedAt: i.failedAt,
  })))

  return out.sort((a, b) => b.failedAt.localeCompare(a.failedAt))
}

/** Re-queues one failed item in whichever store owns it, and kicks that store's flush. */
export function retryFailedItem(item: FailedItem): void {
  switch (item.queue) {
    case 'set': return setLogStore.retryDeadLetterItem(item.clientId)
    case 'water': return waterStore.retryDeadLetterItem(item.clientId)
    case 'grocery': return groceryStore.retryDeadLetterItem(item.clientId)
    case 'cardio': return cardioStore.retryFailedCardioLog(item.clientId)
    case 'meal': return mealStore.retryDeadLetterItem(item.clientId)
  }
}

/** Permanently drops one failed item — the user chose not to retry it. */
export function discardFailedItem(item: FailedItem): void {
  switch (item.queue) {
    case 'set': return setLogStore.discardDeadLetterItem(item.clientId)
    case 'water': return waterStore.discardDeadLetterItem(item.clientId)
    case 'grocery': return groceryStore.discardDeadLetterItem(item.clientId)
    case 'cardio': return cardioStore.discardFailedCardioLog(item.clientId)
    case 'meal': return mealStore.discardDeadLetterItem(item.clientId)
  }
}

/**
 * Subscribes to every queue that publishes changes, returning one unsubscribe.
 *
 * set-log-store's own subscribeSyncState stays the indicator's primary signal
 * (it is the only one carrying online/syncing/queued counts); this covers the
 * other four so a water or grocery failure repaints the badge too, instead of
 * waiting for an unrelated set to be logged.
 */
export function subscribeAllQueues(fn: () => void): () => void {
  const unsubs = [
    waterStore.subscribeWaterStore(fn),
    groceryStore.subscribeGroceryStore(fn),
    cardioStore.subscribeCardioLogStore(fn),
    // Added 5 Sep 2026, when meal-store finally grew one. Its absence here is
    // why a dead-lettered meal was the one failure the badge never showed.
    mealStore.subscribeMealStore(fn),
  ]
  return () => unsubs.forEach(u => u())
}

/** Best-effort retry of every queue's pending work — the "try everything again" button. */
export async function flushAllQueues(): Promise<void> {
  await Promise.allSettled([
    setLogStore.flushPending(),
    waterStore.flushPending(),
    groceryStore.flushPending(),
    cardioStore.flushPending(),
    mealStore.flushPending(),
  ])
}
