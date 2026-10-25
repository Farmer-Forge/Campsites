import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelect } from 'primeng/multiselect';
import { Campground } from '../../core/models/campground.model';
import { CampgroundsService, Coordinates } from '../../core/services/campgrounds.service';
import { FinderSnapshot, FinderStateService } from '../../core/services/finder-state.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { CampgroundMapComponent } from '../../shared/ui/campground-map/campground-map.component';
import { CampgroundTableComponent } from '../../shared/ui/campground-table/campground-table.component';

const METERS_PER_MILE = 1609.34;
const SHOW_ALL_METERS = 20_038_000;
const DEFAULT_RADIUS_MILES = 50;
const NEAREST_LIMIT_FALLBACK = 'Unable to load nearby campgrounds.';
const BLOCKED_HELP =
  'Location is blocked for this site. Click the icon left of the address bar → Site settings → Location → Allow, then press Use my device location again.';

export const AGENCIES = ['NPS', 'USFS', 'BLM', 'USACE', 'FWS'];
export const RADIUS_CHOICES: (number | null)[] = [null, 25, 50, 100, 250];

export const REGIONS: { region: string; states: string[] }[] = [
  { region: 'Northeast', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'] },
  {
    region: 'Midwest',
    states: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'],
  },
  {
    region: 'South',
    states: [
      'AL', 'AR', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS', 'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV',
      'DC',
    ],
  },
  {
    region: 'West',
    states: ['AK', 'AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'NM', 'OR', 'UT', 'WA', 'WY'],
  },
];

export const ALL_STATES = REGIONS.flatMap((r) => r.states);

const WHERE_OPTIONS = REGIONS.map((r) => ({
  label: r.region,
  value: r.region,
  items: r.states.map((s) => ({ label: s, value: s })),
}));

const countLabel = (selected: number, total: number, noun: string): string =>
  selected === total ? `All ${noun}` : selected === 0 ? `No ${noun}` : `${selected} ${noun}`;

const truncate = (name: string): string => (name.length > 30 ? `${name.slice(0, 30)}…` : name);

@Component({
  selector: 'app-finder',
  imports: [FormsModule, MultiSelect, CampgroundMapComponent, CampgroundTableComponent],
  templateUrl: './finder.component.html',
  styleUrl: './finder.component.scss',
})
export class FinderComponent implements OnInit {
  private readonly campgroundsService = inject(CampgroundsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly finderState = inject(FinderStateService);

  protected readonly agencies = AGENCIES;
  protected readonly radiusChoices = RADIUS_CHOICES;
  protected readonly whereOptions = WHERE_OPTIONS;
  protected readonly blockedHelp = BLOCKED_HELP;

  protected readonly selectedAgencies = signal<string[]>([...AGENCIES]);
  protected readonly selectedStates = signal<string[]>([...ALL_STATES]);
  protected readonly parkCodes = signal<string[]>([]);
  protected readonly parkNames = signal<Record<string, string>>({});
  protected readonly selectedParks = signal<string[]>([]);
  protected readonly nearMeEnabled = signal(false);
  protected readonly radiusMiles = signal(DEFAULT_RADIUS_MILES);

  protected readonly results = signal<Campground[]>([]);
  protected readonly searchLocation = signal<Coordinates | null>(null);
  // loading is the first load only (change #5); updating covers every reload after it
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deviceLocationError = signal<string | null>(null);
  protected readonly locationBlocked = signal(false);

  protected readonly showManual = signal(false);
  protected manualLat: number | null = null;
  protected manualLng: number | null = null;

  protected readonly selected = signal<Campground | null>(null);
  protected readonly openPickerFor = signal<string | null>(null);

  private loadedOnce = false;
  private requestId = 0;

  protected readonly whereLabel = computed(() =>
    countLabel(this.selectedStates().length, ALL_STATES.length, 'states'),
  );

  protected readonly allParksSelected = computed(
    () => this.selectedParks().length === this.parkCodes().length,
  );

  protected readonly parkLabel = computed(() =>
    countLabel(this.selectedParks().length, this.parkCodes().length, 'parks'),
  );

  protected readonly parkOptions = computed(() => {
    const names = this.parkNames();
    return this.parkCodes()
      .map((code) => ({ label: truncate(names[code] ?? code), value: code, name: names[code] ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ label, value }) => ({ label, value }));
  });

  ngOnInit(): void {
    const saved = this.finderState.snapshot();
    if (!saved) {
      void this.loadParks(null);
      void this.loadNearest();
      return;
    }
    this.restoreFilters(saved);
    void this.loadParks(saved.parks).then(() => this.loadNearest(saved.location));
  }

  protected isRadiusOn(miles: number | null): boolean {
    return miles === null ? !this.nearMeEnabled() : this.nearMeEnabled() && this.radiusMiles() === miles;
  }

  protected toggleAgency(agency: string): void {
    const current = this.selectedAgencies();
    this.selectedAgencies.set(
      AGENCIES.filter((a) => (a === agency ? !current.includes(a) : current.includes(a))),
    );
    this.onFilterChange();
  }

  protected setStates(states: string[]): void {
    this.selectedStates.set(ALL_STATES.filter((s) => states.includes(s)));
    this.onFilterChange();
  }

  protected setParks(parks: string[]): void {
    this.selectedParks.set(this.parkCodes().filter((p) => parks.includes(p)));
    this.onFilterChange();
  }

  protected setRadius(miles: number | null): void {
    if (miles === null) {
      this.nearMeEnabled.set(false);
    } else {
      this.nearMeEnabled.set(true);
      this.radiusMiles.set(miles);
    }
    this.onFilterChange();
  }

  protected toggleManual(): void {
    this.showManual.update((open) => !open);
  }

  protected useDeviceLocation(): void {
    void this.loadNearest();
  }

  protected submitManual(): void {
    const lat = Number(this.manualLat);
    const lng = Number(this.manualLng);
    if (this.manualLat === null || this.manualLng === null) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.showManual.set(false);
    void this.loadNearest({ lat, lng });
  }

  protected onLocationPick(coords: Coordinates): void {
    this.showManual.set(false);
    void this.loadNearest(coords);
  }

  protected onViewDetails(id: string): void {
    this.selected.set(this.results().find((c) => c.id === id) ?? null);
  }

  protected onAddToTrip(id: string): void {
    this.onViewDetails(id);
    this.openPickerFor.set(id);
  }

  private onFilterChange(): void {
    const location = this.searchLocation();
    if (location) void this.loadNearest(location);
  }

  private restoreFilters(saved: FinderSnapshot): void {
    this.selectedAgencies.set(AGENCIES.filter((a) => saved.agencies.includes(a)));
    this.selectedStates.set(ALL_STATES.filter((s) => saved.states.includes(s)));
    this.nearMeEnabled.set(saved.nearMeEnabled);
    if (RADIUS_CHOICES.includes(saved.radiusMiles) && saved.radiusMiles !== null) {
      this.radiusMiles.set(saved.radiusMiles);
    }
  }

  private async loadParks(savedParks: string[] | null): Promise<void> {
    try {
      const codes = await this.campgroundsService.getParkCodes();
      this.parkCodes.set(codes);
      this.selectedParks.set(savedParks ? codes.filter((c) => savedParks.includes(c)) : [...codes]);
    } catch {
      return; // no park codes: the Park filter stays hidden
    }
    try {
      this.parkNames.set(await this.campgroundsService.getParkNames());
    } catch {
      // cosmetic: park codes are used as labels
    }
  }

  private regionsFullySelected(): string[] {
    const states = this.selectedStates();
    return REGIONS.filter((r) => r.states.every((s) => states.includes(s))).map((r) => r.region);
  }

  private async loadNearest(coords?: Coordinates): Promise<void> {
    const request = ++this.requestId;
    if (this.loadedOnce) this.updating.set(true);
    else this.loading.set(true);
    this.error.set(null);
    this.deviceLocationError.set(null);
    if (!coords) this.locationBlocked.set(false);

    let location: Coordinates;
    if (coords) {
      location = coords;
    } else {
      try {
        location = await this.geolocation.getCurrentPosition();
      } catch (e) {
        const blocked = (await this.geolocation.checkPermissionState()) === 'denied';
        if (request !== this.requestId) return;
        const message = e instanceof Error ? e.message : String(e);
        this.locationBlocked.set(blocked);
        if (this.searchLocation()) this.deviceLocationError.set(message);
        else this.error.set(message);
        this.loading.set(false);
        this.updating.set(false);
        return;
      }
    }

    const agencies = this.selectedAgencies();
    const states = this.selectedStates();
    const allStates = states.length === ALL_STATES.length;
    const parks = this.selectedParks();
    const allParks = this.parkCodes().length === 0 || parks.length === this.parkCodes().length;
    const maxDistance = this.nearMeEnabled() ? this.radiusMiles() * METERS_PER_MILE : SHOW_ALL_METERS;

    try {
      const found = await this.campgroundsService.getNearest(
        location,
        agencies,
        maxDistance,
        allStates ? undefined : states,
        allParks ? undefined : parks,
      );
      if (request !== this.requestId) return;
      this.results.set(found);
      this.searchLocation.set(location);
      this.loadedOnce = true;
      this.finderState.save({
        location,
        agencies,
        states,
        regions: this.regionsFullySelected(),
        parks: allParks ? null : parks,
        nearMeEnabled: this.nearMeEnabled(),
        radiusMiles: this.radiusMiles(),
      });
    } catch (e) {
      if (request !== this.requestId) return;
      this.error.set(e instanceof Error && e.message ? e.message : NEAREST_LIMIT_FALLBACK);
    }
    this.loading.set(false);
    this.updating.set(false);
  }
}
