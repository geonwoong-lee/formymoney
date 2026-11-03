// Starred products live only in this browser, like the rest of a visitor's inputs.
export interface WatchedProduct {
  kind: 'deposit' | 'saving'
  company: string
  productCode: string
  productName: string
}

export const WATCHLIST_KEY = 'very-rich:watch-products:v1'
export const MAX_WATCHED = 30
const DISMISSED_KEY = 'very-rich:rate-alert-dismissed:v1'

const sameProduct = (a: WatchedProduct, b: WatchedProduct) => a.kind === b.kind && a.company === b.company && a.productCode === b.productCode

export function loadWatchlist(): WatchedProduct[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')
    return Array.isArray(value)
      ? value.filter((item) => item && typeof item.company === 'string' && typeof item.productCode === 'string' && (item.kind === 'deposit' || item.kind === 'saving')).slice(0, MAX_WATCHED)
      : []
  } catch {
    return []
  }
}

function saveWatchlist(items: WatchedProduct[]) {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items))
  } catch {
    // Storage blocked: the star simply does not stick.
  }
}

export function isWatched(items: WatchedProduct[], product: WatchedProduct) {
  return items.some((item) => sameProduct(item, product))
}

/** Adds or removes the product; returns the new list, unchanged when the list is full. */
export function toggleWatched(items: WatchedProduct[], product: WatchedProduct): WatchedProduct[] {
  const next = isWatched(items, product)
    ? items.filter((item) => !sameProduct(item, product))
    : items.length >= MAX_WATCHED ? items : [...items, product]
  saveWatchlist(next)
  return next
}

export function loadDismissedDay(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

export function saveDismissedDay(day: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, day)
  } catch {
    // Storage blocked: the notice comes back on the next visit.
  }
}

/** Replaces the whole list (after loading from the account or removing one), without duplicates and within the cap. */
export function replaceWatchlist(items: WatchedProduct[]): WatchedProduct[] {
  const unique = items.filter((item, index) => items.findIndex((other) => sameProduct(other, item)) === index).slice(0, MAX_WATCHED)
  saveWatchlist(unique)
  return unique
}

/** This device's products first, then the account's that are not already here, up to the cap. */
export function mergeWatchlists(local: WatchedProduct[], remote: WatchedProduct[]): WatchedProduct[] {
  return [...local, ...remote.filter((item) => !isWatched(local, item))].slice(0, MAX_WATCHED)
}
