import { Injectable, inject } from '@angular/core';
import { Campground } from '../models/campground.model';
import { SupabaseService } from './supabase.service';

export interface Coordinates {
  lat: number;
  lng: number;
}

const PAGE_SIZE = 1000;

interface CampgroundRow {
  id: string;
  park_code: string | null;
  name: string;
  description: string;
  lat: number;
  lng: number;
  agency: string;
  state: string | null;
  amenities: Record<string, unknown> | null;
  fees: unknown[] | null;
  reservation_url: string;
  directions_url: string;
  images: unknown[] | null;
  contact: unknown;
  distance_m?: number | null;
}

@Injectable({ providedIn: 'root' })
export class CampgroundsService {
  private readonly supabase = inject(SupabaseService);

  async getNearest(
    coords: Coordinates,
    agencies: string[],
    maxDistanceMeters: number,
    states?: string[],
    parks?: string[],
  ): Promise<Campground[]> {
    const results: Campground[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase.client
        .rpc('nearest_campgrounds', {
          user_lat: coords.lat,
          user_lng: coords.lng,
          agency_filter: agencies,
          max_distance_m: maxDistanceMeters,
          state_filter: states ?? null,
          park_filter: parks ?? null,
        })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as CampgroundRow[];
      results.push(...rows.map((row) => this.toCampground(row)));
      if (rows.length < PAGE_SIZE) {
        return results;
      }
    }
  }

  async getByIds(ids: string[], agencies?: string[]): Promise<Campground[]> {
    if (ids.length === 0) {
      return [];
    }
    const { data, error } = await this.supabase.client.rpc('get_campgrounds_by_ids', {
      campground_ids: ids,
      agency_filter: agencies ?? null,
    });
    if (error) {
      throw error;
    }
    return ((data ?? []) as CampgroundRow[]).map((row) => this.toCampground(row));
  }

  async getParkCodes(): Promise<string[]> {
    const codes = new Set<string>();
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase.client
        .from('campgrounds')
        .select('park_code')
        .not('park_code', 'is', null)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as { park_code: string }[];
      rows.forEach((row) => codes.add(row.park_code));
      if (rows.length < PAGE_SIZE) {
        return [...codes].sort();
      }
    }
  }

  async getParkNames(): Promise<Record<string, string>> {
    const { data, error } = await this.supabase.client.from('parks').select('park_code, name');
    if (error) {
      throw error;
    }
    const names: Record<string, string> = {};
    for (const row of (data ?? []) as { park_code: string; name: string }[]) {
      names[row.park_code] = row.name;
    }
    return names;
  }

  async searchByName(query: string): Promise<{ id: string; name: string }[]> {
    const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const { data, error } = await this.supabase.client
      .from('campgrounds')
      .select('id, name')
      .ilike('name', `%${escaped}%`)
      .order('name')
      .limit(20);
    if (error) {
      throw error;
    }
    return (data ?? []) as { id: string; name: string }[];
  }

  private toCampground(row: CampgroundRow): Campground {
    return {
      id: row.id,
      parkCode: row.park_code ?? null,
      name: row.name,
      description: row.description,
      lat: row.lat,
      lng: row.lng,
      agency: row.agency,
      state: row.state ?? null,
      amenities: row.amenities ?? {},
      fees: row.fees ?? [],
      reservationUrl: row.reservation_url,
      directionsUrl: row.directions_url,
      images: row.images ?? [],
      contact: row.contact,
      distanceMeters: row.distance_m ?? 0,
    };
  }
}
