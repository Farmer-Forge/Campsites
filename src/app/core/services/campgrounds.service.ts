import { inject, Injectable } from '@angular/core';
import { Campground } from '../models/campground.model';
import { SupabaseService } from './supabase.service';

export interface Coordinates {
  lat: number;
  lng: number;
}

const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCampground(row: any): Campground {
  return {
    id: row.id,
    parkCode: row.park_code,
    name: row.name,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    agency: row.agency,
    state: row.state,
    amenities: row.amenities ?? {},
    fees: row.fees ?? [],
    reservationUrl: row.reservation_url,
    directionsUrl: row.directions_url,
    images: row.images ?? [],
    contact: row.contact,
    distanceMeters: row.distance_m ?? 0,
  };
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
    const params = {
      user_lat: coords.lat,
      user_lng: coords.lng,
      agency_filter: agencies,
      max_distance_m: maxDistanceMeters,
      state_filter: states ?? null,
      park_filter: parks ?? null,
    };
    const all: Campground[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase.client
        .rpc('nearest_campgrounds', params)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      all.push(...rows.map(toCampground));
      if (rows.length < PAGE_SIZE) break;
    }
    return all;
  }

  async getByIds(ids: string[], agencies?: string[]): Promise<Campground[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.client.rpc('get_campgrounds_by_ids', {
      campground_ids: ids,
      agency_filter: agencies ?? null,
    });
    if (error) throw error;
    return (data ?? []).map(toCampground);
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
      if (error) throw error;
      const rows = data ?? [];
      rows.forEach((r) => codes.add(r.park_code));
      if (rows.length < PAGE_SIZE) break;
    }
    return [...codes].sort();
  }

  async getParkNames(): Promise<Record<string, string>> {
    const { data, error } = await this.supabase.client.from('parks').select('park_code, name');
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((p) => [p.park_code, p.name]));
  }

  async searchByName(query: string): Promise<Pick<Campground, 'id' | 'name'>[]> {
    const escaped = query.replace(/[\\%_]/g, '\\$&');
    const { data, error } = await this.supabase.client
      .from('campgrounds')
      .select('id, name')
      .ilike('name', `%${escaped}%`)
      .order('name')
      .limit(20);
    if (error) throw error;
    return data ?? [];
  }
}
