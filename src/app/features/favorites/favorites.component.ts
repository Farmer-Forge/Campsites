import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Campground } from '../../core/models/campground.model';
import { CampgroundsService } from '../../core/services/campgrounds.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { TripsService } from '../../core/services/trips.service';
import { CampgroundMapComponent } from '../../shared/ui/campground-map/campground-map.component';
import { CampgroundTableComponent } from '../../shared/ui/campground-table/campground-table.component';

@Component({
  selector: 'app-favorites',
  imports: [CampgroundMapComponent, CampgroundTableComponent],
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
  private readonly favorites = inject(FavoritesService);
  private readonly campgroundsService = inject(CampgroundsService);
  private readonly trips = inject(TripsService);
  private readonly router = inject(Router);

  protected readonly loaded = signal<Campground[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noteError = signal(false);
  protected readonly planning = signal(false);
  protected readonly tripName = signal('');
  protected readonly planSelected = signal<Set<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly saveError = signal(false);
  protected readonly notes = this.favorites.favoriteNotes;

  /** The loaded campgrounds that are still favorites, so unhearting removes the card at once. */
  protected readonly campgrounds = computed(() => {
    const ids = this.favorites.favoriteIds();
    return this.loaded().filter((c) => ids.has(c.id));
  });

  protected readonly canSave = computed(
    () => this.tripName().trim().length > 0 && this.visibleSelection().length > 0 && !this.saving(),
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.favorites.loadFavoriteIds();
      this.loaded.set(await this.campgroundsService.getByIds([...this.favorites.favoriteIds()]));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected togglePlanning(): void {
    this.planning.update((p) => !p);
    this.planSelected.set(new Set());
    this.tripName.set('');
    this.saveError.set(false);
  }

  protected onPlanToggle(id: string): void {
    this.planSelected.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected onNameInput(event: Event): void {
    this.tripName.set((event.target as HTMLInputElement).value);
  }

  protected async onNoteChange(change: { campgroundId: string; note: string }): Promise<void> {
    this.noteError.set(false);
    try {
      await this.favorites.updateNote(change.campgroundId, change.note.trim() || null);
    } catch {
      this.noteError.set(true);
    }
  }

  protected async saveTrip(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(false);
    try {
      const id = await this.trips.createTrip(this.tripName().trim(), this.visibleSelection());
      await this.router.navigate(['/trips', id]);
    } catch {
      this.saveError.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  /** Ticked ids in tick order, leaving out any that were unhearted since. */
  private visibleSelection(): string[] {
    const ids = this.favorites.favoriteIds();
    return [...this.planSelected()].filter((id) => ids.has(id));
  }
}
