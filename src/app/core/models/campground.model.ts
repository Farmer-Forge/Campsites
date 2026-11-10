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

export function hasLocation(c: Pick<Campground, 'lat' | 'lng'>): boolean {
  return !(c.lat === 0 && c.lng === 0);
}
