import { Component, computed, input } from '@angular/core';
import { Campground, hasLocation } from '../../../core/models/campground.model';

@Component({
  selector: 'app-campground-detail-panel',
  template: `
    <div class="campground-detail-panel">
      <div class="description" [innerHTML]="campground().description"></div>
      <div class="links">
        @if (campground().reservationUrl) {
          <a
            class="rt-btn rt-btn--cherry rt-btn--shadow"
            [href]="campground().reservationUrl"
            target="_blank"
            rel="noopener"
            >Reserve on recreation.gov</a
          >
        }
        @if (directionsUrl()) {
          <a class="rt-btn" [href]="directionsUrl()" target="_blank" rel="noopener">Directions</a>
        }
      </div>
    </div>
  `,
  styles: `
    .campground-detail-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      cursor: default;
    }

    .description {
      font-size: 15px;
      line-height: 1.5;
      text-wrap: pretty;
      overflow-wrap: anywhere;
    }

    .description :first-child {
      margin-top: 0;
    }

    .description :last-child {
      margin-bottom: 0;
    }

    .links {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `,
})
export class CampgroundDetailPanelComponent {
  readonly campground = input.required<Campground>();

  readonly directionsUrl = computed(() => {
    const c = this.campground();
    if (c.directionsUrl) return c.directionsUrl;
    // No location (0,0): no Google Maps fallback, so no Directions button.
    return hasLocation(c) ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : '';
  });
}
