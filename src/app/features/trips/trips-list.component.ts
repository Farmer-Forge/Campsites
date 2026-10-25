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
  `,
})
export class TripsListComponent implements OnInit {
  private readonly tripsService = inject(TripsService);

  protected readonly trips = this.tripsService.trips;
  protected readonly stopsByTrip = signal<Map<string, TripStop[]>>(new Map());
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly deleteError = signal(false);
  protected readonly confirmingId = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.tripsService.loadTrips();
    } catch {
      this.loadFailed.set(true);
      return;
    }
    this.loaded.set(true);
    try {
      this.stopsByTrip.set(await this.tripsService.loadAllStops(this.trips().map((t) => t.id)));
    } catch {
      // a trip whose stops fail to load shows no summary
    }
  }

  protected route(stops: TripStop[]): string {
    return stops.map((s) => s.campground.name).join(' → ');
  }

  async remove(id: string): Promise<void> {
    this.deleteError.set(false);
    this.confirmingId.set(null);
    try {
      await this.tripsService.deleteTrip(id);
    } catch {
      this.deleteError.set(true);
    }
  }
}
