import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Campground } from '../../core/models/campground.model';
import { CampgroundsService } from '../../core/services/campgrounds.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { TripsService } from '../../core/services/trips.service';
import { CampgroundMapComponent } from '../../shared/ui/campground-map/campground-map.component';
import { CampgroundTableComponent } from '../../shared/ui/campground-table/campground-table.component';

@Component({
  selector: 'app-favorites',
  imports: [FormsModule, CampgroundMapComponent, CampgroundTableComponent],
  templateUrl: './favorites.component.html',
  styles: `
    :host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .favorites-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .plan-button {
      margin-left: auto;
    }
    .planner-hint {
      font-size: 14px;
      font-weight: 600;
    }
    .planner-row {
      display: flex;
      gap: 8px;
    }
    .planner-row .rt-input {
      flex: 1;
      background: var(--rt-card);
    }
    .empty {
      margin: 0;
    }
    @media (max-width: 900px) {
      :host {
        flex: none;
      }
    }
  `,
})
export class FavoritesComponent implements OnInit {
  private readonly campgroundsService = inject(CampgroundsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly trips = inject(TripsService);
  private readonly router = inject(Router);

  protected readonly loaded = signal<Campground[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noteError = signal(false);
  protected readonly planning = signal(false);
  protected readonly planOrder = signal<string[]>([]);
  protected readonly tripName = signal('');
  protected readonly saveError = signal(false);
  protected readonly saving = signal(false);
  protected readonly selected = signal<Campground | null>(null);
  protected readonly notes = this.favoritesService.favoriteNotes;

  // Change #1: unfavoriting removes the card right away.
  protected readonly campgrounds = computed(() => {
    const ids = this.favoritesService.favoriteIds();
    return this.loaded().filter((c) => ids.has(c.id));
  });
  protected readonly planSelected = computed(() => new Set(this.planOrder()));
  protected readonly canSave = computed(
    () => this.tripName().trim().length > 0 && this.planOrder().length > 0 && !this.saving(),
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.favoritesService.loadFavoriteIds();
      const ids = [...this.favoritesService.favoriteIds()];
      this.loaded.set(await this.campgroundsService.getByIds(ids));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected togglePlanning(): void {
    this.planning.update((p) => !p);
    this.planOrder.set([]);
    this.tripName.set('');
    this.saveError.set(false);
  }

  protected onPlanToggle(id: string): void {
    this.planOrder.update((order) => (order.includes(id) ? order.filter((x) => x !== id) : [...order, id]));
  }

  protected async saveTrip(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(false);
    try {
      const id = await this.trips.createTrip(this.tripName().trim(), this.planOrder());
      await this.router.navigate(['/trips', id]);
    } catch {
      this.saveError.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected async onNoteChange(event: { campgroundId: string; note: string | null }): Promise<void> {
    this.noteError.set(false);
    try {
      await this.favoritesService.updateNote(event.campgroundId, event.note);
    } catch {
      this.noteError.set(true);
    }
  }
}
