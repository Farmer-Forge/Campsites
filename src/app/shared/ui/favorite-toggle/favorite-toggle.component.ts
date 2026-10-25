import { Component, computed, inject, input } from '@angular/core';
import { FavoritesService } from '../../../core/services/favorites.service';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-favorite-toggle',
  template: `
    @if (supabase.session()) {
      <button
        type="button"
        class="rt-icon-btn favorite-button"
        [title]="isFavorite() ? 'Remove favorite' : 'Favorite'"
        [attr.aria-pressed]="isFavorite()"
        (click)="toggle($event)"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          [attr.fill]="isFavorite() ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
          />
        </svg>
      </button>
    }
  `,
  styles: `
    .favorite-button {
      color: var(--rt-cherry);
    }
  `,
})
export class FavoriteToggleComponent {
  readonly campgroundId = input.required<string>();
  protected readonly supabase = inject(SupabaseService);
  private readonly favorites = inject(FavoritesService);
  protected readonly isFavorite = computed(() => this.favorites.favoriteIds().has(this.campgroundId()));

  protected async toggle(event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.favorites.toggleFavorite(this.campgroundId());
    } catch {
      // The heart simply stays as it was.
    }
  }
}
