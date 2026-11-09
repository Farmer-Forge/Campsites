import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { Campground, hasLocation } from '../../../core/models/campground.model';
import { Coordinates } from '../../../core/services/campgrounds.service';
import { SupabaseService } from '../../../core/services/supabase.service';

const DEFAULT_CENTER: L.LatLngExpression = [39.8283, -98.5795];
const DEFAULT_ZOOM = 6;
const SELECT_ZOOM = 12;
const SEARCH_ZOOM = 9;

@Component({
  selector: 'app-campground-map',
  template: `<div #frame class="campground-map"></div>`,
  styleUrl: './campground-map.component.scss',
})
export class CampgroundMapComponent implements AfterViewInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);

  readonly campgrounds = input.required<Campground[]>();
  readonly selectedId = input<string | null>(null);
  readonly ordered = input(false);
  readonly searchLocation = input<Coordinates | null>(null);
  readonly allowLocationPick = input(false);

  readonly viewDetails = output<string>();
  readonly locationPick = output<Coordinates>();
  readonly addToTrip = output<string>();

  private readonly frame = viewChild.required<ElementRef<HTMLDivElement>>('frame');
  private readonly ready = signal(false);
  private map?: L.Map;
  private cluster?: L.MarkerClusterGroup;
  private route?: L.Polyline;
  private searchMarker?: L.Marker;
  private resizeObserver?: ResizeObserver;
  private readonly markers = new Map<string, L.Marker>();

  constructor() {
    L.Icon.Default.imagePath = '';
    L.Icon.Default.mergeOptions({
      iconUrl: 'marker-icon.png',
      iconRetinaUrl: 'marker-icon-2x.png',
      shadowUrl: 'marker-shadow.png',
    });

    effect(() => {
      if (!this.ready()) {
        return;
      }
      this.drawMarkers(this.campgrounds(), this.ordered());
    });

    effect(() => {
      const id = this.selectedId();
      if (!this.ready() || !id) {
        return;
      }
      untracked(() => this.centreOn(id));
    });

    effect(() => {
      const location = this.searchLocation();
      if (!this.ready()) {
        return;
      }
      this.drawSearchLocation(location);
    });
  }

  ngAfterViewInit(): void {
    const map = L.map(this.frame().nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.allowLocationPick()) {
        this.locationPick.emit({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    });
    this.map = map;
    this.cluster = L.markerClusterGroup({ chunkedLoading: true });
    map.addLayer(this.cluster);
    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(this.frame().nativeElement);
    this.ready.set(true);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private drawMarkers(campgrounds: Campground[], ordered: boolean): void {
    const map = this.map;
    const cluster = this.cluster;
    if (!map || !cluster) {
      return;
    }
    cluster.clearLayers();
    this.markers.clear();
    this.route?.remove();
    this.route = undefined;

    const markers: L.Marker[] = [];
    const points: L.LatLngExpression[] = [];
    campgrounds.forEach((c, index) => {
      if (!hasLocation(c)) {
        return;
      }
      const marker = L.marker([c.lat, c.lng], ordered ? { icon: this.stopIcon(index + 1) } : {});
      marker.bindPopup(() => this.popupContent(c));
      marker.on('click', () => this.centreOn(c.id));
      this.markers.set(c.id, marker);
      markers.push(marker);
      points.push([c.lat, c.lng]);
    });
    cluster.addLayers(markers);

    if (ordered) {
      if (points.length >= 2) {
        this.route = L.polyline(points, { color: this.cssColor('--rt-cherry') }).addTo(map);
      }
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
      }
    }
  }

  private stopIcon(n: number): L.DivIcon {
    return L.divIcon({
      className: 'trip-stop-marker',
      html: String(n),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  private cssColor(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  private popupContent(c: Campground): HTMLElement {
    const root = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = c.name;
    root.appendChild(title);

    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'view-details-button';
    view.textContent = 'View details ▸';
    view.addEventListener('click', () => {
      this.map?.closePopup();
      this.viewDetails.emit(c.id);
    });
    root.appendChild(view);

    if (this.supabase.session()) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'view-details-button';
      add.textContent = 'Add to trip…';
      add.addEventListener('click', () => {
        this.map?.closePopup();
        this.addToTrip.emit(c.id);
      });
      root.appendChild(add);
    }
    return root;
  }

  /** Centres on a campground at zoom 12 or the current zoom, whichever is closer in. */
  private centreOn(id: string): void {
    const map = this.map;
    const marker = this.markers.get(id);
    if (!map || !marker) {
      return;
    }
    const zoom = Math.max(SELECT_ZOOM, map.getZoom());
    map.setView(marker.getLatLng(), zoom);
    this.cluster?.zoomToShowLayer(marker);
  }

  private drawSearchLocation(location: Coordinates | null): void {
    const map = this.map;
    if (!map) {
      return;
    }
    this.searchMarker?.remove();
    this.searchMarker = undefined;
    if (!location) {
      return;
    }
    this.searchMarker = L.marker([location.lat, location.lng], {
      icon: L.divIcon({
        className: 'current-location-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      zIndexOffset: -1000,
    })
      .bindTooltip('Your search location')
      .addTo(map);
    map.setView([location.lat, location.lng], SEARCH_ZOOM);
  }
}
