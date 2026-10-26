import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface AdminStats {
  favoritesCount: number;
  tripsCount: number;
}

@Injectable({ providedIn: 'root' })
export class AdminStatsService {
  private readonly supabase = inject(SupabaseService);
  readonly stats = signal<AdminStats>({ favoritesCount: 0, tripsCount: 0 });

  constructor() {
    this.supabase.onSignOut(() => this.stats.set({ favoritesCount: 0, tripsCount: 0 }));
  }

  async loadStats(): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('get_admin_stats');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    this.stats.set({
      favoritesCount: Number(row?.favorites_count ?? 0),
      tripsCount: Number(row?.trips_count ?? 0),
    });
  }
}
