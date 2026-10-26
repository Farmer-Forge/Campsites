import { inject, Injectable, signal } from '@angular/core';
import { CampgroundAttribute } from '../models/campground-attribute.model';
import { SupabaseService } from './supabase.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAttribute(row: any): CampgroundAttribute {
  return {
    id: row.id,
    campgroundId: row.campground_id,
    type: row.type,
    name: row.name,
    value: row.value,
    createdAt: row.created_at,
  };
}

const COLUMNS = 'id, campground_id, type, name, value, created_at';

@Injectable({ providedIn: 'root' })
export class CampgroundAttributesService {
  private readonly supabase = inject(SupabaseService);
  readonly attributes = signal<CampgroundAttribute[]>([]);

  constructor() {
    this.supabase.onSignOut(() => this.attributes.set([]));
  }

  async loadForCampground(campgroundId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('campground_attributes')
      .select(COLUMNS)
      .eq('campground_id', campgroundId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    this.attributes.set((data ?? []).map(toAttribute));
  }

  async addAttribute(
    campgroundId: string,
    type: string,
    name: string,
    value: string | null,
  ): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('campground_attributes')
      .insert({ campground_id: campgroundId, type, name, value })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    this.attributes.update((list) => [...list, toAttribute(data)]);
  }

  async updateAttribute(
    id: string,
    type: string,
    name: string,
    value: string | null,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('campground_attributes')
      .update({ type, name, value })
      .eq('id', id);
    if (error) throw error;
    this.attributes.update((list) =>
      list.map((a) => (a.id === id ? { ...a, type, name, value } : a)),
    );
  }

  async deleteAttribute(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('campground_attributes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.attributes.update((list) => list.filter((a) => a.id !== id));
  }
}
