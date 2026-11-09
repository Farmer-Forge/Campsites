import { inject, Injectable, signal } from '@angular/core';
import { CampgroundAttribute } from '../models/campground-attribute.model';
import { SupabaseService } from './supabase.service';

export interface AttributeFields {
  type: string;
  name: string;
  value: string | null;
}

@Injectable({ providedIn: 'root' })
export class CampgroundAttributesService {
  private readonly supabase = inject(SupabaseService);
  private readonly _attributes = signal<CampgroundAttribute[]>([]);
  readonly attributes = this._attributes.asReadonly();

  constructor() {
    this.supabase.onSignOut(() => this._attributes.set([]));
  }

  async loadForCampground(campgroundId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('campground_attributes')
      .select('*')
      .eq('campground_id', campgroundId)
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    this._attributes.set((data ?? []).map((r) => this.toAttribute(r)));
  }

  async addAttribute(campgroundId: string, fields: AttributeFields): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('campground_attributes')
      .insert({ campground_id: campgroundId, ...fields })
      .select()
      .single();
    if (error) {
      throw error;
    }
    this._attributes.update((list) => [...list, this.toAttribute(data)]);
  }

  async updateAttribute(id: string, fields: AttributeFields): Promise<void> {
    const { error } = await this.supabase.client
      .from('campground_attributes')
      .update(fields)
      .eq('id', id);
    if (error) {
      throw error;
    }
    this._attributes.update((list) => list.map((a) => (a.id === id ? { ...a, ...fields } : a)));
  }

  async deleteAttribute(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('campground_attributes').delete().eq('id', id);
    if (error) {
      throw error;
    }
    this._attributes.update((list) => list.filter((a) => a.id !== id));
  }

  private toAttribute(r: Record<string, unknown>): CampgroundAttribute {
    return {
      id: r['id'] as string,
      campgroundId: r['campground_id'] as string,
      type: r['type'] as string,
      name: r['name'] as string,
      value: (r['value'] as string | null) ?? null,
      createdAt: r['created_at'] as string,
    };
  }
}
