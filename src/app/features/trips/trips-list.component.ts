import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TripStop } from '../../core/models/trip.model';
import { TripsService } from '../../core/services/trips.service';

@Component({
  selector: 'app-trips-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './trips-list.component.html',
  styles: `
    .rt-content {
      max-width: 1100px;
    }
    .empty {
      margin: 0;
      font-size: 16px;
    }
    .postcards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .postcard {
      border: 3px solid var(--rt-ink);
      border-radius: 16px;
      background: var(--rt-card);
      box-shadow: 5px 5px 0 var(--rt-ink);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .postcard-header {
      display: flex;
      flex-direction: column;
      padding: 18px 20px;
      background: var(--rt-teal);
      color: var(--rt-cream);
      border-bottom: 3px solid var(--rt-ink);
      text-decoration: none;
    }
    .postcard-header:hover {
      color: var(--rt-cream);
    }
    .greetings {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .trip-name {
      font-family: var(--rt-script);
      font-size: 36px;
      line-height: 1.1;
      text-shadow: 2px 2px 0 var(--rt-cherry);
      overflow-wrap: anywhere;
    }
    .postcard-body {
      padding: 14px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 14px;
    }
    .stop-count {
      font-weight: 600;
    }
    .postcard-footer {
      margin-top: auto;
      padding: 12px 20px;
      border-top: 2px dashed var(--rt-ink);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .open {
      margin-left: auto;
    }
    .confirm {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class TripsListComponent implements OnInit {
  protected readonly tripsService = inject(TripsService);

  protected readonly trips = this.tripsService.trips;
  protected readonly stops = signal<Map<string, TripStop[]>>(new Map());
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly deleteError = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.stops.set(new Map());
    try {
      await this.tripsService.loadTrips();
    } catch {
      this.loadError.set(true);
      return;
    } finally {
      this.loading.set(false);
    }
    try {
      this.stops.set(await this.tripsService.loadAllStops(this.trips().map((t) => t.id)));
    } catch {
      // A trip whose stops fail to load shows no summary.
    }
  }

  protected stopCount(tripId: string): string {
    const n = this.stops().get(tripId)?.length ?? 0;
    return `${n} ${n === 1 ? 'stop' : 'stops'}`;
  }

  protected route(tripId: string): string {
    return (this.stops().get(tripId) ?? []).map((s) => s.campground.name).join(' → ');
  }

  protected askDelete(id: string): void {
    this.deleteError.set(false);
    this.confirmingId.set(id);
  }

  protected async confirmDelete(id: string): Promise<void> {
    try {
      await this.tripsService.deleteTrip(id);
      this.confirmingId.set(null);
    } catch {
      this.confirmingId.set(null);
      this.deleteError.set(true);
    }
  }
}
