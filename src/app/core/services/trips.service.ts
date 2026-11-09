import { inject, Injectable, signal } from '@angular/core';
import { Trip, TripStop } from '../models/trip.model';
import { CampgroundsService } from './campgrounds.service';
import { SupabaseService } from './supabase.service';

interface TripRow {
  id: string;
  name: string;
  created_at: string;
}

function toTrip(row: TripRow): Trip {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

@Injectable({ providedIn: 'root' })
export class TripsService {
  private readonly supabase = inject(SupabaseService);
  private readonly campgrounds = inject(CampgroundsService);
  readonly trips = signal<Trip[]>([]);

  constructor() {
    this.supabase.onSignOut(() => this.trips.set([]));
  }

  private get userId(): string | undefined {
    return this.supabase.session()?.user.id;
  }

  async loadTrips(): Promise<void> {
    const userId = this.userId;
    if (!userId) {
      this.trips.set([]);
      return;
    }
    const { data, error } = await this.supabase.client
      .from('trips')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    this.trips.set(((data ?? []) as TripRow[]).map(toTrip));
  }

  async getTrip(id: string): Promise<Trip | null> {
    const userId = this.userId;
    if (!userId) {
      return null;
    }
    const { data, error } = await this.supabase.client
      .from('trips')
      .select('id, name, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data ? toTrip(data as TripRow) : null;
  }

  async getTripStops(id: string): Promise<TripStop[]> {
    const { data, error } = await this.supabase.client
      .from('trip_stops')
      .select('id, campground_id, position')
      .eq('trip_id', id)
      .order('position');
    if (error) {
      throw error;
    }
    const stops = data ?? [];
    const found = await this.campgrounds.getByIds(stops.map((s) => s.campground_id as string));
    const byId = new Map(found.map((c) => [c.id, c]));
    const result: TripStop[] = [];
    for (const stop of stops) {
      const campground = byId.get(stop.campground_id as string);
      if (campground) {
        result.push({ stopId: stop.id as string, campground });
      }
    }
    return result;
  }

  async loadAllStops(tripIds: string[]): Promise<Map<string, TripStop[]>> {
    const result = new Map<string, TripStop[]>(tripIds.map((id) => [id, []]));
    if (tripIds.length === 0) {
      return result;
    }
    const { data, error } = await this.supabase.client
      .from('trip_stops')
      .select('id, trip_id, campground_id, position')
      .in('trip_id', tripIds)
      .order('position');
    if (error) {
      throw error;
    }
    const stops = data ?? [];
    const found = await this.campgrounds.getByIds([
      ...new Set(stops.map((s) => s.campground_id as string)),
    ]);
    const byId = new Map(found.map((c) => [c.id, c]));
    for (const stop of stops) {
      const campground = byId.get(stop.campground_id as string);
      if (campground) {
        result.get(stop.trip_id as string)?.push({ stopId: stop.id as string, campground });
      }
    }
    return result;
  }

  async createTrip(name: string, campgroundIds: string[]): Promise<string> {
    const userId = this.userId;
    if (!userId) {
      throw new Error('Not signed in');
    }
    const { data, error } = await this.supabase.client
      .from('trips')
      .insert({ user_id: userId, name })
      .select('id')
      .single();
    if (error) {
      throw error;
    }
    const tripId = data.id as string;
    if (campgroundIds.length > 0) {
      const { error: stopsError } = await this.supabase.client.from('trip_stops').insert(
        campgroundIds.map((campgroundId, position) => ({
          trip_id: tripId,
          campground_id: campgroundId,
          position,
        })),
      );
      if (stopsError) {
        await this.supabase.client.from('trips').delete().eq('id', tripId);
        throw stopsError;
      }
    }
    await this.loadTrips();
    return tripId;
  }

  async renameTrip(id: string, name: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('trips')
      .update({ name })
      .eq('id', id)
      .select('id');
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error('No matching trip to rename');
    }
    this.trips.update((trips) => trips.map((t) => (t.id === id ? { ...t, name } : t)));
  }

  async deleteTrip(id: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('trips')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error('No matching trip to delete');
    }
    this.trips.update((trips) => trips.filter((t) => t.id !== id));
  }

  async addStop(tripId: string, campgroundId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('trip_stops')
      .select('position')
      .eq('trip_id', tripId)
      .order('position', { ascending: false })
      .limit(1);
    if (error) {
      throw error;
    }
    const position = data && data.length > 0 ? (data[0].position as number) + 1 : 0;
    const { error: insertError } = await this.supabase.client
      .from('trip_stops')
      .insert({ trip_id: tripId, campground_id: campgroundId, position });
    if (insertError) {
      throw insertError;
    }
  }

  async removeStop(tripId: string, stopId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('trip_stops')
      .delete()
      .eq('id', stopId)
      .eq('trip_id', tripId);
    if (error) {
      throw error;
    }
  }

  async getTripIdsForCampground(campgroundId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('trip_stops')
      .select('trip_id')
      .eq('campground_id', campgroundId);
    if (error) {
      throw error;
    }
    return [...new Set((data ?? []).map((r) => r.trip_id as string))];
  }

  async reorderStops(tripId: string, orderedStopIds: string[]): Promise<void> {
    const { error } = await this.supabase.client.rpc('reorder_trip_stops', {
      p_trip_id: tripId,
      p_stop_ids: orderedStopIds,
    });
    if (error) {
      throw error;
    }
  }
}
