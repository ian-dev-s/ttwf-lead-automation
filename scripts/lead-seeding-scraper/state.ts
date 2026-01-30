/**
 * Shared state for the lead seeding scraper
 */

// Flag to stop all workers if API fails permanently
export let stopAllWorkers = false;

// Shared counter for tracking progress across workers
export let totalAdded = 0;

export function setStopAllWorkers(value: boolean): void {
  stopAllWorkers = value;
}

export function incrementTotalAdded(): number {
  return ++totalAdded;
}

export function getTotalAdded(): number {
  return totalAdded;
}

export function resetState(): void {
  stopAllWorkers = false;
  totalAdded = 0;
}
