import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'campsite-finder.map-maximized';

/**
 * Whether the map pages (Finder, Favorites, Trip detail) show the map at full width with the
 * list hidden (spec 3, change #13). Remembered for the browser tab, like the Finder's saved state.
 */
@Injectable({ providedIn: 'root' })
export class MapSizeService {
  private readonly state = signal(MapSizeService.load());
  readonly maximized = this.state.asReadonly();

  toggle(): void {
    this.set(!this.state());
  }

  reduce(): void {
    this.set(false);
  }

  private set(value: boolean): void {
    this.state.set(value);
    try {
      sessionStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // No storage (a private window): the choice lasts until the page reloads.
    }
  }

  private static load(): boolean {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
