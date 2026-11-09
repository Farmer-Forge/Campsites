import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { Campground } from '../../core/models/campground.model';
import { CampgroundsService, Coordinates } from '../../core/services/campgrounds.service';
import { FinderSnapshot, FinderStateService } from '../../core/services/finder-state.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { CampgroundMapComponent } from '../../shared/ui/campground-map/campground-map.component';
import { CampgroundTableComponent } from '../../shared/ui/campground-table/campground-table.component';

const METERS_PER_MILE = 1609.34;
const SHOW_ALL_METERS = 20_038_000;
const DEFAULT_RADIUS = 50;
const AGENCIES = ['NPS', 'USFS', 'BLM', 'USACE', 'FWS'];
const RADIUS_CHOICES: (number | null)[] = [null, 25, 50, 100, 250];
const REGIONS: { name: string; states: string[] }[] = [
  { name: 'Northeast', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'] },
  { name: 'Midwest', states: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'] },
  {
    name: 'South',
    states: ['AL', 'AR', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS', 'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV', 'DC'],
  },
  { name: 'West', states: ['AK', 'AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'NM', 'OR', 'UT', 'WA', 'WY'] },
];
const ALL_STATES = REGIONS.flatMap((r) => r.states);
const BLOCKED_HELP =
  'Location is blocked for this site. Click the icon left of the address bar → Site settings → Location → Allow, then press Use my device location again.';

@Component({
  selector: 'app-finder',
  imports: [NgTemplateOutlet, FormsModule, MultiSelectModule, CampgroundMapComponent, CampgroundTableComponent],
  templateUrl: './finder.component.html',
  styleUrl: './finder.component.scss',
})
export class FinderComponent implements OnInit {
  private readonly campgrounds = inject(CampgroundsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly finderState = inject(FinderStateService);

  protected readonly agencies = AGENCIES;
  protected readonly radiusChoices = RADIUS_CHOICES;
  protected readonly blockedHelp = BLOCKED_HELP;
  protected readonly whereGroups = REGIONS.map((r) => ({
    label: r.name,
    items: r.states.map((s) => ({ label: s, value: s })),
  }));

  protected readonly selectedAgencies = signal<string[]>([...AGENCIES]);
  protected readonly selectedStates = signal<string[]>([...ALL_STATES]);
  protected readonly parkCodes = signal<string[]>([]);
  protected readonly parkNames = signal<Record<string, string>>({});
  protected readonly selectedParks = signal<string[]>([]);
  protected readonly nearMeEnabled = signal(false);
  protected readonly radiusMiles = signal(DEFAULT_RADIUS);

  protected readonly results = signal<Campground[]>([]);
  protected readonly searchLocation = signal<Coordinates | null>(null);
  protected readonly selected = signal<Campground | null>(null);
  protected readonly pickerFor = signal<string | null>(null);

  protected readonly loading = signal(true);
  protected readonly updating = signal(false);
  protected readonly error = signal('');
  protected readonly deviceLocationError = signal('');
  protected readonly locationBlocked = signal(false);
  protected readonly manualOpen = signal(false);
  protected manualLat = '';
  protected manualLng = '';

  private hasLoaded = false;
  private requestId = 0;

  protected readonly allStatesSelected = computed(() => this.selectedStates().length === ALL_STATES.length);
  protected readonly allParksSelected = computed(
    () => this.selectedParks().length === this.parkCodes().length,
  );

  protected readonly whereLabel = computed(() => {
    const n = this.selectedStates().length;
    if (n === ALL_STATES.length) {
      return 'All states';
    }
    return n === 0 ? 'No states' : `${n} states`;
  });

  protected readonly parkLabel = computed(() => {
    const n = this.selectedParks().length;
    if (this.allParksSelected()) {
      return 'All parks';
    }
    return n === 0 ? 'No parks' : `${n} parks`;
  });

  protected readonly parkOptions = computed(() => {
    const names = this.parkNames();
    return this.parkCodes()
      .map((code) => {
        const name = names[code] ?? code;
        return { label: name.length > 30 ? `${name.slice(0, 30)}…` : name, value: code, sort: name };
      })
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ label, value }) => ({ label, value }));
  });

  protected readonly filtersAtStart = computed(
    () =>
      this.selectedAgencies().length === AGENCIES.length &&
      this.allStatesSelected() &&
      this.allParksSelected() &&
      !this.nearMeEnabled() &&
      this.radiusMiles() === DEFAULT_RADIUS,
  );

  async ngOnInit(): Promise<void> {
    const saved = this.finderState.snapshot();
    if (!saved) {
      await Promise.all([this.loadNearest(), this.loadParks(null)]);
      return;
    }
    this.selectedAgencies.set(AGENCIES.filter((a) => saved.agencies.includes(a)));
    this.selectedStates.set(ALL_STATES.filter((s) => saved.states.includes(s)));
    this.nearMeEnabled.set(saved.nearMeEnabled);
    if (RADIUS_CHOICES.includes(saved.radiusMiles) && saved.radiusMiles !== null) {
      this.radiusMiles.set(saved.radiusMiles);
    }
    await this.loadParks(saved.parks);
    await this.loadNearest(saved.location);
  }

  private async loadParks(savedParks: string[] | null): Promise<void> {
    try {
      const [codes, names] = await Promise.all([
        this.campgrounds.getParkCodes(),
        this.campgrounds.getParkNames().catch(() => ({}) as Record<string, string>),
      ]);
      this.parkNames.set(names);
      this.parkCodes.set(codes);
      this.selectedParks.set(savedParks === null ? [...codes] : codes.filter((c) => savedParks.includes(c)));
    } catch {
      this.parkCodes.set([]);
      this.selectedParks.set([]);
    }
  }

  protected async loadNearest(coords?: Coordinates): Promise<void> {
    const request = ++this.requestId;
    if (this.hasLoaded) {
      this.updating.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set('');
    this.deviceLocationError.set('');
    if (!coords) {
      this.locationBlocked.set(false);
    }

    let location: Coordinates;
    if (coords) {
      location = coords;
    } else {
      try {
        location = await this.geolocation.getCurrentPosition();
      } catch (e) {
        const state = await this.geolocation.checkPermissionState();
        if (request !== this.requestId) {
          return;
        }
        this.locationBlocked.set(state === 'denied');
        const message = (e as Error).message;
        if (this.searchLocation()) {
          this.deviceLocationError.set(message);
        } else {
          this.error.set(message);
        }
        this.loading.set(false);
        this.updating.set(false);
        return;
      }
    }

    try {
      const maxDistance = this.nearMeEnabled() ? this.radiusMiles() * METERS_PER_MILE : SHOW_ALL_METERS;
      const states = this.allStatesSelected() ? undefined : this.selectedStates();
      const parks =
        this.parkCodes().length === 0 || this.allParksSelected() ? undefined : this.selectedParks();
      const found = await this.campgrounds.getNearest(location, this.selectedAgencies(), maxDistance, states, parks);
      if (request !== this.requestId) {
        return;
      }
      this.results.set(found);
      this.selected.set(null);
      this.searchLocation.set(location);
      this.finderState.save(this.buildSnapshot(location));
      this.hasLoaded = true;
    } catch (e) {
      if (request !== this.requestId) {
        return;
      }
      this.error.set((e as { message?: string } | null)?.message || 'Unable to load nearby campgrounds.');
    }
    this.loading.set(false);
    this.updating.set(false);
  }

  private buildSnapshot(location: Coordinates): FinderSnapshot {
    const states = this.selectedStates();
    return {
      location,
      agencies: this.selectedAgencies(),
      states,
      regions: REGIONS.filter((r) => r.states.every((s) => states.includes(s))).map((r) => r.name),
      parks: this.allParksSelected() ? null : this.selectedParks(),
      nearMeEnabled: this.nearMeEnabled(),
      radiusMiles: this.radiusMiles(),
    };
  }

  private rerun(): void {
    const location = this.searchLocation();
    if (location) {
      void this.loadNearest(location);
    }
  }

  protected toggleAgency(agency: string): void {
    const current = this.selectedAgencies();
    this.selectedAgencies.set(AGENCIES.filter((a) => (a === agency ? !current.includes(a) : current.includes(a))));
    this.rerun();
  }

  protected onStatesChange(states: string[]): void {
    this.selectedStates.set(ALL_STATES.filter((s) => states.includes(s)));
    this.rerun();
  }

  protected onParksChange(parks: string[]): void {
    this.selectedParks.set(parks);
    this.rerun();
  }

  protected selectRadius(miles: number | null): void {
    if (miles === null) {
      this.nearMeEnabled.set(false);
    } else {
      this.nearMeEnabled.set(true);
      this.radiusMiles.set(miles);
    }
    this.rerun();
  }

  protected resetFilters(): void {
    this.selectedAgencies.set([...AGENCIES]);
    this.selectedStates.set([...ALL_STATES]);
    this.selectedParks.set([...this.parkCodes()]);
    this.nearMeEnabled.set(false);
    this.radiusMiles.set(DEFAULT_RADIUS);
    this.rerun();
  }

  protected useDeviceLocation(): void {
    void this.loadNearest();
  }

  protected toggleManual(): void {
    this.manualOpen.update((open) => !open);
  }

  protected searchManual(): void {
    const lat = Number(this.manualLat);
    const lng = Number(this.manualLng);
    if (this.manualLat === '' || this.manualLng === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    this.manualOpen.set(false);
    void this.loadNearest({ lat, lng });
  }

  protected onLocationPick(coords: Coordinates): void {
    this.manualOpen.set(false);
    void this.loadNearest(coords);
  }

  protected onSelectedChange(campground: Campground | null): void {
    this.selected.set(campground);
  }

  protected onViewDetails(id: string): void {
    this.selected.set(this.results().find((c) => c.id === id) ?? null);
  }

  protected onAddToTrip(id: string): void {
    this.onViewDetails(id);
    this.pickerFor.set(id);
  }
}
