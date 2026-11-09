import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly supabase = inject(SupabaseService);
  private readonly _favoriteIds = signal<Set<string>>(new Set());
  private readonly _favoriteNotes = signal<Map<string, string | null>>(new Map());
  readonly favoriteIds = this._favoriteIds.asReadonly();
  readonly favoriteNotes = this._favoriteNotes.asReadonly();

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
    if (error) {
      throw error;
    }
    const rows = data ?? [];
    this._favoriteIds.set(new Set(rows.map((r) => r.campground_id as string)));
    this._favoriteNotes.set(
      new Map(rows.map((r) => [r.campground_id as string, (r.note as string | null) ?? null])),
    );
  }

  async toggleFavorite(id: string): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) {
      return;
    }
    if (this._favoriteIds().has(id)) {
      const { error } = await this.supabase.client
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('campground_id', id);
      if (error) {
        throw error;
      }
      this._favoriteIds.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      this._favoriteNotes.update((notes) => {
        const next = new Map(notes);
        next.delete(id);
        return next;
      });
    } else {
      const { error } = await this.supabase.client
        .from('favorites')
        .insert({ user_id: userId, campground_id: id });
      if (error) {
        throw error;
      }
      this._favoriteIds.update((ids) => new Set(ids).add(id));
      this._favoriteNotes.update((notes) => new Map(notes).set(id, null));
    }
  }

  async updateNote(id: string, note: string | null): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) {
      throw new Error('Not signed in');
    }
    const { data, error } = await this.supabase.client
      .from('favorites')
      .update({ note })
      .eq('user_id', userId)
      .eq('campground_id', id)
      .select();
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error('No matching favorite to update');
    }
    this._favoriteNotes.update((notes) => new Map(notes).set(id, note));
  }

  private clear(): void {
    this._favoriteIds.set(new Set());
    this._favoriteNotes.set(new Map());
  }
}
