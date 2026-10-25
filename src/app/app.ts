import { Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FavoritesService } from './core/services/favorites.service';
import { SupabaseService } from './core/services/supabase.service';
import { UserService } from './core/services/user.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly supabase = inject(SupabaseService);
  protected readonly userService = inject(UserService);
  private readonly favorites = inject(FavoritesService);

  constructor() {
    effect(() => {
      if (this.supabase.session()) {
        void this.userService.loadProfile();
        void this.favorites.loadFavoriteIds().catch(() => undefined);
      }
    });
  }
}
