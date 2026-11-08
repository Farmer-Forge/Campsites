import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { Campground, hasLocation } from '../../../core/models/campground.model';
import { Coordinates } from '../../../core/services/campgrounds.service';
import { SupabaseService } from '../../../core/services/supabase.service';

L.Icon.Default.imagePath = '';
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'marker-icon-2x.png',
  iconUrl: 'marker-icon.png',
  shadowUrl: 'marker-shadow.png',
});

@Component({
  selector: 'app-campground-map',
  templateUrl: './campground-map.component.html',
  styleUrl: './campground-map.component.scss',
})
export class CampgroundMapComponent implements AfterViewInit, OnDestroy {
  readonly campgrounds = input.required<Campground[]>();
  readonly selectedId = input<string | null>(null);
  readonly ordered = input(false);
  readonly fitToCampgrounds = input(false);
  readonly searchLocation = input<Coordinates | null>(null);
  readonly allowLocationPick = input(false);

  readonly viewDetails = output<string>();
  readonly addToTrip = output<string>();
  readonly locationPick = output<Coordinates>();

  private readonly supabase = inject(SupabaseService);
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  private map?: L.Map;
  private cluster?: L.MarkerClusterGroup;
  private line?: L.Polyline;
  private locationMarker?: L.Marker;
  private resizeObserver?: ResizeObserver;
  private markers = new Map<string, L.Marker>();
  private lastSelectedId: string | null = null;
  private ready = false;

  constructor() {
    effect(() => {
      const campgrounds = this.campgrounds();
      const ordered = this.ordered();
      const fit = this.fitToCampgrounds();
      if (this.ready) this.renderMarkers(campgrounds, ordered, fit);
    });
    effect(() => {
      const id = this.selectedId();
      if (!this.ready) return;
      if (id && id !== this.lastSelectedId) {
        const campground = this.campgrounds().find((c) => c.id === id);
        if (campground && hasLocation(campground)) this.map!.setView([campground.lat, campground.lng], 12);
      }
      this.lastSelectedId = id;
    });
    effect(() => {
      const location = this.searchLocation();
      if (this.ready) this.renderSearchLocation(location);
    });
  }

  ngAfterViewInit(): void {
    const el = this.mapEl().nativeElement;
    this.map = L.map(el).setView([39.8283, -98.5795], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.cluster = L.markerClusterGroup({ chunkedLoading: true });
    this.map.addLayer(this.cluster);

    this.map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      if (this.allowLocationPick()) this.openLocationPopup(e.latlng);
    });

    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(el);

    this.ready = true;
    this.lastSelectedId = this.selectedId();
    this.renderMarkers(this.campgrounds(), this.ordered(), this.fitToCampgrounds());
    this.renderSearchLocation(this.searchLocation());
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private renderMarkers(all: Campground[], ordered: boolean, fit: boolean): void {
    const map = this.map!;
    // Campgrounds with no location (0,0) get no marker and no route point. Trip
    // markers keep their stop number from the full list, so they match the stop cards.
    const numbered = all.map((campground, index) => ({ campground, index })).filter((n) => hasLocation(n.campground));
    const campgrounds = numbered.map((n) => n.campground);
    this.cluster!.clearLayers();
    this.markers.clear();
    if (this.line) {
      this.line.remove();
      this.line = undefined;
    }

    const markers = numbered.map(({ campground, index }) => {
      const marker = ordered
        ? L.marker([campground.lat, campground.lng], {
            icon: L.divIcon({
              className: 'trip-stop-marker',
              html: String(index + 1),
              iconSize: [28, 28],
            }),
          })
        : L.marker([campground.lat, campground.lng]);
      marker.bindPopup(() => this.buildPopup(campground, marker));
      marker.on('click', () => map.setView(marker.getLatLng(), 12));
      this.markers.set(campground.id, marker);
      return marker;
    });
    this.cluster!.addLayers(markers);

    const points = campgrounds.map((c) => [c.lat, c.lng] as L.LatLngTuple);
    if (ordered && points.length >= 2) this.line = L.polyline(points).addTo(map);
    if ((ordered || fit) && points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
    }
  }

  private renderSearchLocation(location: Coordinates | null): void {
    this.locationMarker?.remove();
    this.locationMarker = undefined;
    if (!location) return;
    this.locationMarker = L.marker([location.lat, location.lng], {
      icon: L.divIcon({
        className: 'current-location-marker',
        iconSize: [16, 16],
      }),
      zIndexOffset: -1000,
      interactive: true,
    })
      .bindTooltip('Your search location')
      .addTo(this.map!);
    this.map!.setView([location.lat, location.lng], 9);
  }

  private buildPopup(campground: Campground, marker: L.Marker): HTMLElement {
    const container = L.DomUtil.create('div');
    const title = L.DomUtil.create('strong', '', container);
    title.textContent = campground.name;

    const details = L.DomUtil.create('button', 'view-details-button', container);
    details.type = 'button';
    details.textContent = 'View details ▸';
    L.DomEvent.on(details, 'click', () => {
      marker.closePopup();
      this.viewDetails.emit(campground.id);
    });

    if (this.supabase.session()) {
      const add = L.DomUtil.create('button', 'view-details-button', container);
      add.type = 'button';
      add.textContent = 'Add to trip…';
      L.DomEvent.on(add, 'click', () => {
        marker.closePopup();
        this.addToTrip.emit(campground.id);
      });
    }
    return container;
  }

  private openLocationPopup(latlng: L.LatLng): void {
    const container = L.DomUtil.create('div');
    const text = L.DomUtil.create('div', '', container);
    text.textContent = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    const button = L.DomUtil.create('button', 'view-details-button', container);
    button.type = 'button';
    button.textContent = 'Search from here';
    L.DomEvent.on(button, 'click', () => {
      this.map!.closePopup();
      this.locationPick.emit({ lat: latlng.lat, lng: latlng.lng });
    });
    L.popup().setLatLng(latlng).setContent(container).openOn(this.map!);
  }
}
