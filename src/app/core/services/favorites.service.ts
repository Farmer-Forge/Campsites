import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly supabase = inject(SupabaseService);
  readonly favoriteIds = signal<Set<string>>(new Set());
  readonly favoriteNotes = signal<Map<string, string | null>>(new Map());

  constructor() {
    this.supabase.onSignOut(() => this.clear());
  }

  async loadFavoriteIds(): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) {
      this.clear();
      return;
    }
    const { data, error } = await this.supabase.client
      .from('favorites')
      .select('campground_id, note')
      .eq('user_id', userId);
    if (error) throw error;
    const rows = data ?? [];
    this.favoriteIds.set(new Set(rows.map((r) => r.campground_id)));
    this.favoriteNotes.set(new Map(rows.map((r) => [r.campground_id, r.note])));
  }

  async toggleFavorite(id: string): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) throw new Error('Not signed in');
    if (this.favoriteIds().has(id)) {
      const { error } = await this.supabase.client
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('campground_id', id);
      if (error) throw error;
      this.favoriteIds.update((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      this.favoriteNotes.update((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
    } else {
      const { error } = await this.supabase.client
        .from('favorites')
        .insert({ user_id: userId, campground_id: id });
      if (error) throw error;
      this.favoriteIds.update((s) => new Set(s).add(id));
      this.favoriteNotes.update((m) => new Map(m).set(id, null));
    }
  }

  async updateNote(id: string, note: string | null): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await this.supabase.client
      .from('favorites')
      .update({ note })
      .eq('user_id', userId)
      .eq('campground_id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No matching favorite to update');
    this.favoriteNotes.update((m) => new Map(m).set(id, note));
  }

  private clear(): void {
    this.favoriteIds.set(new Set());
    this.favoriteNotes.set(new Map());
  }
}
