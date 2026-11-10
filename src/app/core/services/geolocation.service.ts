import { Injectable } from '@angular/core';
import { Coordinates } from './campgrounds.service';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

const MANUAL_HINT = 'Enter your coordinates below to search manually.';

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  getCurrentPosition(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => reject(new Error(this.messageFor(error))),
        { timeout: 10000 },
      );
    });
  }

  async checkPermissionState(): Promise<PermissionState> {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state;
    } catch {
      return 'unsupported';
    }
  }

  private messageFor(error: GeolocationPositionError): string {
    switch (error.code) {
      case 1:
        return `Location access was denied. ${MANUAL_HINT}`;
      case 3:
        return `Locating you took too long. ${MANUAL_HINT}`;
      default:
        return `Your location could not be determined. ${MANUAL_HINT}`;
    }
  }
}
