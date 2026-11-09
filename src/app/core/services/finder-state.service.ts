import { Injectable } from '@angular/core';
import { Coordinates } from './campgrounds.service';

export interface FinderSnapshot {
  location: Coordinates;
  agencies: string[];
  states: string[];
  regions: string[];
  parks: string[] | null;
  nearMeEnabled: boolean;
  radiusMiles: number;
}

const STORAGE_KEY = 'campsite-finder.finder';

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isValid(value: unknown): value is FinderSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const s = value as Record<string, unknown>;
  const loc = s['location'] as Record<string, unknown> | null | undefined;
  if (!loc || typeof loc !== 'object') {
    return false;
  }
  const lat = loc['lat'];
  const lng = loc['lng'];
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    isStringList(s['agencies']) &&
    isStringList(s['states']) &&
    isStringList(s['regions']) &&
    (s['parks'] === null || isStringList(s['parks'])) &&
    typeof s['nearMeEnabled'] === 'boolean' &&
    typeof s['radiusMiles'] === 'number'
  );
}

@Injectable({ providedIn: 'root' })
export class FinderStateService {
  private current: FinderSnapshot | null = null;

  snapshot(): FinderSnapshot | null {
    if (this.current) {
      return this.current;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) {
        this.current = parsed;
        return parsed;
      }
    } catch {
      // unreadable storage or bad JSON: no saved state
    }
    return null;
  }

  save(snapshot: FinderSnapshot): void {
    this.current = snapshot;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // storage unavailable: keep it in memory only
    }
  }
}
