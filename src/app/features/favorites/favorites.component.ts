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
  private readonly favoritesService = inject(FavoritesService);
  private readonly campgroundsService = inject(CampgroundsService);
  private readonly tripsService = inject(TripsService);
  private readonly router = inject(Router);

  protected readonly notes = this.favoritesService.favoriteNotes;
  private readonly loaded = signal<Campground[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly isLoaded = signal(false);
  protected readonly noteError = signal(false);
  protected readonly selected = signal<Campground | null>(null);

  protected readonly planning = signal(false);
  protected readonly planSelected = signal<Set<string>>(new Set());
  protected readonly tripName = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal(false);

  // Change #1: unfavoriting drops the card at once
  protected readonly campgrounds = computed(() => {
    const ids = this.favoritesService.favoriteIds();
    return this.loaded().filter((c) => ids.has(c.id));
  });
  protected readonly canSave = computed(
    () => this.tripName().trim() !== '' && this.planSelected().size > 0 && !this.saving(),
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.favoritesService.loadFavoriteIds();
      this.loaded.set(await this.campgroundsService.getByIds([...this.favoritesService.favoriteIds()]));
      this.isLoaded.set(true);
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected async onNoteChange(event: { campgroundId: string; note: string }): Promise<void> {
    const note = event.note.trim() === '' ? null : event.note;
    if ((this.notes().get(event.campgroundId) ?? null) === note) return;
    this.noteError.set(false);
    try {
      await this.favoritesService.updateNote(event.campgroundId, note);
    } catch {
      this.noteError.set(true);
    }
  }

  protected togglePlanning(): void {
    this.planning.update((p) => !p);
    this.planSelected.set(new Set());
    this.tripName.set('');
    this.saveError.set(false);
  }

  protected togglePlanStop(id: string): void {
    this.planSelected.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async saveTrip(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(false);
    try {
      const id = await this.tripsService.createTrip(this.tripName().trim(), [...this.planSelected()]);
      await this.router.navigate(['/trips', id]);
    } catch {
      this.saveError.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}
