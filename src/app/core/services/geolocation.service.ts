import { Injectable } from '@angular/core';
import { Coordinates } from './campgrounds.service';

export type PermissionStateResult = 'granted' | 'denied' | 'prompt' | 'unsupported';

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  getCurrentPosition(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
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

  async checkPermissionState(): Promise<PermissionStateResult> {
    try {
      if (!navigator.permissions) {
        return 'unsupported';
      }
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state;
    } catch {
      return 'unsupported';
    }
  }

  private messageFor(error: GeolocationPositionError): string {
    switch (error.code) {
      case 1:
        return 'Location access was denied. Enter your coordinates below to search manually.';
      case 2:
        return 'Your location could not be determined. Enter your coordinates below to search manually.';
      case 3:
        return 'Locating you took too long. Enter your coordinates below to search manually.';
      default:
        return 'Your location could not be determined. Enter your coordinates below to search manually.';
    }
  }
}
