import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Campground } from '../../core/models/campground.model';
import { Trip, TripStop } from '../../core/models/trip.model';
import { CampgroundsService } from '../../core/services/campgrounds.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { TripsService } from '../../core/services/trips.service';
import { CampgroundDetailPanelComponent } from '../../shared/ui/campground-detail-panel/campground-detail-panel.component';
import { CampgroundMapComponent } from '../../shared/ui/campground-map/campground-map.component';

@Component({
  selector: 'app-trip-detail',
  imports: [DatePipe, FormsModule, RouterLink, CampgroundMapComponent, CampgroundDetailPanelComponent],
  templateUrl: './trip-detail.component.html',
  styles: `
    :host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .back-link {
      align-self: flex-start;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rt-teal);
      text-decoration: none;
    }
    .trip-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .rename-row {
      display: flex;
      gap: 8px;
    }
    .rename-row .rt-input {
      flex: 1;
      font-size: 18px;
      padding: 8px 14px;
    }
    .meta-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .meta {
      font-size: 14px;
      font-weight: 600;
      margin-right: auto;
    }
    .stop-card {
      flex: none;
      border: 2px solid var(--rt-ink);
      border-radius: 14px;
      background: var(--rt-card);
      box-shadow: 3px 3px 0 var(--rt-ink);
    }
    .stop-card.is-open {
      background: var(--rt-cream);
    }
    .card-main {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 12px 14px;
      cursor: pointer;
    }
    .stop-badge {
      width: 58px;
      height: 58px;
      flex: none;
      box-sizing: border-box;
      border-radius: 50%;
      background: var(--rt-cherry);
      color: var(--rt-cream);
      border: 2px solid var(--rt-ink);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
      gap: 2px;
    }
    .badge-top {
      font-family: var(--rt-display);
      font-size: 17px;
    }
    .badge-sub {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
    }
    .card-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .campground-name-link {
      font-weight: 700;
      font-size: 17px;
      line-height: 1.3;
    }
    .tags {
      display: flex;
      gap: 6px;
    }
    .reorder {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .reorder button {
      width: 30px;
      height: 24px;
      padding: 0;
      border: 2px solid var(--rt-ink);
      border-radius: 6px;
      background: var(--rt-cream);
      color: var(--rt-ink);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .reorder button:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .detail {
      padding: 2px 14px 16px 86px;
    }
    .add-stop {
      display: flex;
      gap: 8px;
      padding-top: 14px;
      border-top: 2px dashed var(--rt-ink);
    }
    .add-stop .rt-input {
      flex: 1;
    }
    @media (max-width: 900px) {
      :host {
        flex: none;
      }
      .detail {
        padding-left: 14px;
      }
    }
  `,
})
export class TripDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tripsService = inject(TripsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly campgroundsService = inject(CampgroundsService);

  private tripId = '';
  protected readonly trip = signal<Trip | null>(null);
  protected readonly stops = signal<TripStop[]>([]);
  protected readonly loaded = signal(false);
  protected readonly notFound = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly favorites = signal<Campground[]>([]);
  protected readonly openId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly renaming = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly confirmingDelete = signal(false);
  protected readonly addId = signal('');

  protected readonly campgrounds = computed(() => this.stops().map((s) => s.campground));
  protected readonly available = computed(() => {
    const inTrip = new Set(this.campgrounds().map((c) => c.id));
    return this.favorites().filter((c) => !inTrip.has(c.id));
  });

  ngOnInit(): void {
    this.tripId = this.route.snapshot.paramMap.get('id') ?? '';
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    this.notFound.set(false);
    if (!this.tripId) {
      this.notFound.set(true);
      return;
    }
    try {
      const [trip, stops] = await Promise.all([
        this.tripsService.getTrip(this.tripId),
        this.tripsService.getTripStops(this.tripId),
      ]);
      if (!trip) {
        this.notFound.set(true);
        return;
      }
      this.trip.set(trip);
      this.stops.set(stops);
      this.loaded.set(true);
    } catch {
      this.loadFailed.set(true);
      return;
    }
    try {
      await this.favoritesService.loadFavoriteIds();
      this.favorites.set(await this.campgroundsService.getByIds([...this.favoritesService.favoriteIds()]));
    } catch {
      this.favorites.set([]);
    }
  }

  private async reloadStops(): Promise<void> {
    this.stops.set(await this.tripsService.getTripStops(this.tripId));
  }

  protected toggleOpen(id: string): void {
    this.openId.update((o) => (o === id ? null : id));
  }

  protected startRename(): void {
    this.nameDraft.set(this.trip()?.name ?? '');
    this.error.set('');
    this.renaming.set(true);
  }

  protected async saveRename(): Promise<void> {
    const name = this.nameDraft().trim();
    if (!name) return;
    this.error.set('');
    try {
      await this.tripsService.renameTrip(this.tripId, name);
      this.trip.update((t) => (t ? { ...t, name } : t));
      this.renaming.set(false);
    } catch {
      this.error.set("Couldn't rename this trip — try again.");
    }
  }

  protected async deleteTrip(): Promise<void> {
    this.error.set('');
    this.confirmingDelete.set(false);
    try {
      await this.tripsService.deleteTrip(this.tripId);
      await this.router.navigate(['/trips']);
    } catch {
      this.error.set("Couldn't delete this trip — try again.");
    }
  }

  protected async move(index: number, delta: number): Promise<void> {
    const next = [...this.stops()];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    this.error.set('');
    this.stops.set(next);
    try {
      await this.tripsService.reorderStops(
        this.tripId,
        next.map((s) => s.stopId),
      );
    } catch {
      this.error.set("Couldn't reorder stops — try again.");
      try {
        await this.reloadStops();
      } catch {
        // keep the on-screen order
      }
    }
  }

  protected async removeStop(stopId: string): Promise<void> {
    this.error.set('');
    try {
      await this.tripsService.removeStop(this.tripId, stopId);
      await this.reloadStops();
    } catch {
      this.error.set("Couldn't remove that stop — try again.");
    }
  }

  protected async addStop(): Promise<void> {
    const id = this.addId();
    if (!id) return;
    this.error.set('');
    try {
      await this.tripsService.addStop(this.tripId, id);
      this.addId.set('');
      await this.reloadStops();
    } catch {
      this.error.set("Couldn't add that stop — try again.");
    }
  }
}
