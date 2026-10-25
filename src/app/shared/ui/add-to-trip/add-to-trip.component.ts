import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { TripsService } from '../../../core/services/trips.service';

@Component({
  selector: 'app-add-to-trip',
  template: `
    <div class="add-to-trip-panel">
      <div class="rt-label">ADD TO TRIP</div>
      <div class="trip-options">
        @for (trip of trips.trips(); track trip.id) {
          <button
            type="button"
            class="rt-btn rt-btn--sm trip-option"
            [disabled]="busy() || tripIdsWithCampground().has(trip.id)"
            (click)="addTo(trip.id)"
          >
            {{ trip.name }}{{ tripIdsWithCampground().has(trip.id) ? ' (added)' : '' }}
          </button>
        }
      </div>
      <div class="add-to-trip-new">
        <input
          type="text"
          class="rt-input rt-input--sm"
          placeholder="New trip name"
          aria-label="New trip name"
          [value]="newName()"
          (input)="newName.set($any($event.target).value)"
          (keydown.enter)="createAndAdd()"
        />
        <button
          type="button"
          class="rt-btn rt-btn--sm rt-btn--cherry"
          [disabled]="busy()"
          (click)="createAndAdd()"
        >
          Create &amp; Add
        </button>
      </div>
      @if (error()) {
        <div class="rt-error">{{ error() }}</div>
      }
    </div>
  `,
  styles: `
    .add-to-trip-panel {
      margin: 0 14px 14px;
      padding: 12px;
      border: 2px dashed var(--rt-ink);
      border-radius: 12px;
      background: var(--rt-cream);
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: default;
    }
    .rt-label {
      font-size: 13px;
    }
    .trip-options {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .trip-option:disabled {
      background: var(--rt-sand);
      opacity: 1;
    }
    .add-to-trip-new {
      display: flex;
      gap: 8px;
    }
    .add-to-trip-new .rt-input {
      flex: 1;
      background: var(--rt-card);
    }
  `,
})
export class AddToTripComponent implements OnInit {
  readonly campgroundId = input.required<string>();
  readonly done = output<void>();

  protected readonly trips = inject(TripsService);
  protected readonly tripIdsWithCampground = signal<Set<string>>(new Set());
  protected readonly newName = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      await this.trips.loadTrips();
      this.tripIdsWithCampground.set(new Set(await this.trips.getTripIdsForCampground(this.campgroundId())));
    } catch {
      this.error.set("Couldn't load trips — try again.");
    }
  }

  protected async addTo(tripId: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.trips.addStop(tripId, this.campgroundId());
      this.done.emit();
    } catch {
      this.error.set("Couldn't add to that trip — try again.");
    } finally {
      this.busy.set(false);
    }
  }

  protected async createAndAdd(): Promise<void> {
    const name = this.newName().trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.trips.createTrip(name, [this.campgroundId()]);
      this.done.emit();
    } catch {
      this.error.set("Couldn't create that trip — try again.");
    } finally {
      this.busy.set(false);
    }
  }
}
