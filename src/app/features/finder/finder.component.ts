import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelect } from 'primeng/multiselect';
import { Campground } from '../../core/models/campground.model';
import { CampgroundsService, Coordinates } from '../../core/services/campgrounds.service';
import { FinderStateService } from '../../core/services/finder-state.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { CampgroundMapComponent } from '../../shared/ui/campground-map/campground-map.component';
import { CampgroundTableComponent } from '../../shared/ui/campground-table/campground-table.component';

const METERS_PER_MILE = 1609.34;
const SHOW_ALL_METERS = 20038000;
const AGENCIES = ['NPS', 'USFS', 'BLM', 'USACE', 'FWS'];
const RADIUS_CHOICES: (number | null)[] = [null, 25, 50, 100, 250];
const DEFAULT_RADIUS = 50;
const REGIONS: Record<string, string[]> = {
  Northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  Midwest: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'],
  South: ['AL', 'AR', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS', 'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV', 'DC'],
  West: ['AK', 'AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'NM', 'OR', 'UT', 'WA', 'WY'],
};
const ALL_STATES = Object.values(REGIONS).flat();
const WHERE_OPTIONS = Object.entries(REGIONS).map(([region, states]) => ({
  label: region,
  value: region,
  items: states.map((s) => ({ label: s, value: s })),
}));
const PARK_LABEL_MAX = 30;

@Component({
  selector: 'app-finder',
  imports: [FormsModule, NgTemplateOutlet, MultiSelect, CampgroundMapComponent, CampgroundTableComponent],
  templateUrl: './finder.component.html',
})
export class FinderComponent implements OnInit {
  private readonly campgroundsService = inject(CampgroundsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly finderState = inject(FinderStateService);

  protected readonly agencies = AGENCIES;
  protected readonly radiusChoices = RADIUS_CHOICES;
  protected readonly whereOptions = WHERE_OPTIONS;

  protected readonly selectedAgencies = signal<string[]>([...AGENCIES]);
  protected readonly selectedStates = signal<string[]>([...ALL_STATES]);
  protected readonly selectedParks = signal<string[]>([]);
  protected readonly parkCodes = signal<string[]>([]);
  protected readonly parkNames = signal<Record<string, string>>({});
  protected readonly nearMeEnabled = signal(false);
  protected readonly radiusMiles = signal(DEFAULT_RADIUS);

  protected readonly results = signal<Campground[]>([]);
  protected readonly searchLocation = signal<Coordinates | null>(null);
  protected readonly selected = signal<Campground | null>(null);
  protected readonly openPickerFor = signal<string | null>(null);

  protected readonly loading = signal(true);
  protected readonly updating = signal(false);
  protected readonly pageError = signal<string | null>(null);
  protected readonly deviceError = signal<string | null>(null);
  protected readonly locationBlocked = signal(false);
  protected readonly manualOpen = signal(false);
  protected readonly manualLat = signal<number | null>(null);
  protected readonly manualLng = signal<number | null>(null);

  private loaded = false;
  private requestId = 0;

  protected readonly allParksSelected = computed(
    () => this.selectedParks().length === this.parkCodes().length,
  );
  protected readonly parkOptions = computed(() => {
    const names = this.parkNames();
    return this.parkCodes()
      .map((code) => {
        const name = names[code] ?? code;
        const label = name.length > PARK_LABEL_MAX ? `${name.slice(0, PARK_LABEL_MAX)}…` : name;
        return { label, value: code, sortKey: name };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  });
  protected readonly whereLabel = computed(() =>
    this.selectedStates().length === ALL_STATES.length ? 'All states' : '{0} states',
  );
  protected readonly parkLabel = computed(() => (this.allParksSelected() ? 'All parks' : '{0} parks'));
  protected readonly atStartingFilters = computed(
    () =>
      this.selectedAgencies().length === AGENCIES.length &&
      this.selectedStates().length === ALL_STATES.length &&
      this.allParksSelected() &&
      !this.nearMeEnabled() &&
      this.radiusMiles() === DEFAULT_RADIUS,
  );

  ngOnInit(): void {
    const saved = this.finderState.snapshot();
    if (!saved) {
      void this.loadParks(null);
      void this.loadNearest();
      return;
    }
    this.selectedAgencies.set(AGENCIES.filter((a) => saved.agencies.includes(a)));
    this.selectedStates.set(ALL_STATES.filter((s) => saved.states.includes(s)));
    this.nearMeEnabled.set(saved.nearMeEnabled);
    if (RADIUS_CHOICES.includes(saved.radiusMiles)) {
      this.radiusMiles.set(saved.radiusMiles);
    }
    void this.loadParks(saved.parks).then(() => this.loadNearest(saved.location));
  }

  private async loadParks(saved: string[] | null): Promise<void> {
    try {
      const [codes, names] = await Promise.all([
        this.campgroundsService.getParkCodes(),
        this.campgroundsService.getParkNames().catch((): Record<string, string> => ({})),
      ]);
      this.parkNames.set(names);
      this.parkCodes.set(codes);
      this.selectedParks.set(saved ? codes.filter((c) => saved.includes(c)) : [...codes]);
    } catch {
      // No park codes: the Park filter stays hidden.
    }
  }

  protected async loadNearest(coords?: Coordinates): Promise<void> {
    const id = ++this.requestId;
    if (this.loaded) {
      this.updating.set(true);
    } else {
      this.loading.set(true);
    }
    this.pageError.set(null);
    this.deviceError.set(null);
    if (!coords) {
      this.locationBlocked.set(false);
    }

    let location: Coordinates;
    try {
      location = coords ?? (await this.geolocation.getCurrentPosition());
    } catch (err) {
      if (id !== this.requestId) return;
      const blocked = (await this.geolocation.checkPermissionState()) === 'denied';
      if (id !== this.requestId) return;
      this.locationBlocked.set(blocked);
      const message = err instanceof Error ? err.message : 'Unable to determine your location.';
      if (this.searchLocation()) {
        this.deviceError.set(message);
      } else {
        this.pageError.set(message);
      }
      this.loading.set(false);
      this.updating.set(false);
      return;
    }

    try {
      const campgrounds = await this.campgroundsService.getNearest(
        location,
        this.selectedAgencies(),
        this.nearMeEnabled() ? this.radiusMiles() * METERS_PER_MILE : SHOW_ALL_METERS,
        this.selectedStates().length === ALL_STATES.length ? undefined : this.selectedStates(),
        this.parkFilter(),
      );
      if (id !== this.requestId) return;
      this.results.set(campgrounds);
      const current = this.searchLocation();
      if (!current || current.lat !== location.lat || current.lng !== location.lng) {
        this.searchLocation.set(location);
      }
      this.loaded = true;
      this.finderState.save({
        location,
        agencies: this.selectedAgencies(),
        states: this.selectedStates(),
        regions: Object.keys(REGIONS).filter((r) =>
          REGIONS[r].every((s) => this.selectedStates().includes(s)),
        ),
        parks: this.parkFilter() ?? null,
        nearMeEnabled: this.nearMeEnabled(),
        radiusMiles: this.radiusMiles(),
      });
    } catch (err) {
      if (id !== this.requestId) return;
      const message = (err as { message?: string } | null)?.message;
      this.pageError.set(message || 'Unable to load nearby campgrounds.');
    }
    this.loading.set(false);
    this.updating.set(false);
  }

  private parkFilter(): string[] | undefined {
    return this.parkCodes().length === 0 || this.allParksSelected() ? undefined : this.selectedParks();
  }

  private refresh(): void {
    const location = this.searchLocation();
    if (location) {
      void this.loadNearest(location);
    }
  }

  protected toggleAgency(agency: string): void {
    const on = this.selectedAgencies();
    this.selectedAgencies.set(AGENCIES.filter((a) => (a === agency ? !on.includes(a) : on.includes(a))));
    this.refresh();
  }

  protected onStatesChange(states: string[]): void {
    this.selectedStates.set(ALL_STATES.filter((s) => states.includes(s)));
    this.refresh();
  }

  protected regionOn(region: string): boolean {
    return REGIONS[region].every((s) => this.selectedStates().includes(s));
  }

  protected toggleRegion(region: string): void {
    const states = REGIONS[region];
    const on = this.regionOn(region);
    this.onStatesChange(
      on
        ? this.selectedStates().filter((s) => !states.includes(s))
        : [...this.selectedStates(), ...states],
    );
  }

  protected onParksChange(parks: string[]): void {
    this.selectedParks.set(this.parkCodes().filter((c) => parks.includes(c)));
    this.refresh();
  }

  protected setRadius(miles: number | null): void {
    if (miles === null) {
      this.nearMeEnabled.set(false);
    } else {
      this.nearMeEnabled.set(true);
      this.radiusMiles.set(miles);
    }
    this.refresh();
  }

  protected resetFilters(): void {
    this.selectedAgencies.set([...AGENCIES]);
    this.selectedStates.set([...ALL_STATES]);
    this.selectedParks.set([...this.parkCodes()]);
    this.nearMeEnabled.set(false);
    this.radiusMiles.set(DEFAULT_RADIUS);
    this.refresh();
  }

  protected submitManual(): void {
    const lat = this.manualLat();
    const lng = this.manualLng();
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.manualOpen.set(false);
    void this.loadNearest({ lat, lng });
  }

  protected pickLocation(coords: Coordinates): void {
    this.manualOpen.set(false);
    void this.loadNearest(coords);
  }

  protected viewDetails(id: string): void {
    this.selected.set(this.results().find((c) => c.id === id) ?? null);
  }

  protected addToTrip(id: string): void {
    this.viewDetails(id);
    this.openPickerFor.set(id);
  }
}
