import { Injectable } from '@angular/core';
import { Coordinates } from './campgrounds.service';

export type PermissionStateResult = 'granted' | 'denied' | 'prompt' | 'unsupported';

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
        (error) => {
          switch (error.code) {
            case 1:
              reject(
                new Error(
                  'Location access was denied. Enter your coordinates below to search manually.',
                ),
              );
              break;
            case 2:
              reject(
                new Error(
                  'Your location could not be determined. Enter your coordinates below to search manually.',
                ),
              );
              break;
            case 3:
              reject(
                new Error(
                  'Locating you took too long. Enter your coordinates below to search manually.',
                ),
              );
              break;
            default:
              reject(new Error(error.message));
          }
        },
        { timeout: 10000 },
      );
    });
  }

  async checkPermissionState(): Promise<PermissionStateResult> {
    try {
      if (!navigator.permissions) return 'unsupported';
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state;
    } catch {
      return 'unsupported';
    }
  }
}
