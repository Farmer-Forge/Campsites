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

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isValidSnapshot = (value: unknown): value is FinderSnapshot => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const loc = v['location'] as Record<string, unknown> | null | undefined;
  if (!loc || typeof loc !== 'object') return false;
  const { lat, lng } = loc;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return (
    isStringList(v['agencies']) &&
    isStringList(v['states']) &&
    isStringList(v['regions']) &&
    (v['parks'] === null || isStringList(v['parks'])) &&
    typeof v['nearMeEnabled'] === 'boolean' &&
    typeof v['radiusMiles'] === 'number'
  );
};

@Injectable({ providedIn: 'root' })
export class FinderStateService {
  private current: FinderSnapshot | null = null;

  snapshot(): FinderSnapshot | null {
    if (this.current) return this.current;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isValidSnapshot(parsed)) return null;
      this.current = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  save(snapshot: FinderSnapshot): void {
    this.current = snapshot;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // storage unavailable: keep the state in memory only
    }
  }
}
