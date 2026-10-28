export interface Campground {
  id: string;
  parkCode: string | null;
  name: string;
  description: string;
  lat: number;
  lng: number;
  agency: string;
  state: string | null;
  amenities: Record<string, unknown>;
  fees: unknown[];
  reservationUrl: string;
  directionsUrl: string;
  images: unknown[];
  contact: unknown;
  distanceMeters: number;
}

/**
 * False for campgrounds stored at exactly 0,0: RIDB's "no location" (Shawn, 2026-10-27).
 * They get no map marker or route point, and no Directions link.
 */
export function hasLocation(c: Pick<Campground, 'lat' | 'lng'>): boolean {
  return !(c.lat === 0 && c.lng === 0);
}
