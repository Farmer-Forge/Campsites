import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { Campground, hasLocation } from '../../../core/models/campground.model';
import { Coordinates } from '../../../core/services/campgrounds.service';
import { SupabaseService } from '../../../core/services/supabase.service';

L.Icon.Default.imagePath = '';
L.Icon.Default.mergeOptions({
  iconUrl: 'marker-icon.png',
  iconRetinaUrl: 'marker-icon-2x.png',
  shadowUrl: 'marker-shadow.png',
});

const US_CENTER: L.LatLngTuple = [39.8283, -98.5795];

@Component({
  selector: 'app-campground-map',
  template: `<div #mapEl class="campground-map"></div>`,
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
  readonly addToTrip = output<string>();
  readonly locationPick = output<Coordinates>();

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  private map: L.Map | null = null;
  private cluster: L.MarkerClusterGroup | null = null;
  private route: L.Polyline | null = null;
  private locationMarker: L.Marker | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private markers = new Map<string, L.Marker>();
  private lookup = new Map<string, Campground>();
  private ready = false;

  constructor() {
    effect(() => {
      const list = this.campgrounds();
      const ordered = this.ordered();
      if (!this.ready) {
        return;
      }
      untracked(() => this.renderMarkers(list, ordered));
    });

    effect(() => {
      const id = this.selectedId();
      if (!this.ready || !id) {
        return;
      }
      untracked(() => this.centreOn(id));
    });

    effect(() => {
      const loc = this.searchLocation();
      if (!this.ready) {
        return;
      }
      untracked(() => this.renderSearchLocation(loc));
    });
  }

  ngAfterViewInit(): void {
    const map = L.map(this.mapEl().nativeElement).setView(US_CENTER, 6);
    this.map = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    this.cluster = L.markerClusterGroup({ chunkedLoading: true });
    map.addLayer(this.cluster);

    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      if (this.allowLocationPick()) {
        this.openPickPopup(e.latlng);
      }
    });

    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(this.mapEl().nativeElement);

    this.ready = true;
    this.renderMarkers(this.campgrounds(), this.ordered());
    this.renderSearchLocation(this.searchLocation());
    const id = this.selectedId();
    if (id) {
      this.centreOn(id);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = null;
  }

  private renderMarkers(list: Campground[], ordered: boolean): void {
    const map = this.map;
    const cluster = this.cluster;
    if (!map || !cluster) {
      return;
    }
    cluster.clearLayers();
    this.route?.remove();
    this.route = null;
    this.markers = new Map();
    this.lookup = new Map(list.map((c) => [c.id, c]));

    const batch: L.Marker[] = [];
    const points: L.LatLngTuple[] = [];
    list.forEach((c, index) => {
      if (!hasLocation(c)) {
        return;
      }
      const marker = ordered
        ? L.marker([c.lat, c.lng], {
            icon: L.divIcon({
              className: 'trip-stop-marker',
              html: String(index + 1),
              iconSize: [28, 28],
            }),
          })
        : L.marker([c.lat, c.lng]);
      marker.bindPopup(() => this.buildPopup(c, marker));
      marker.on('click', () => {
        map.setView([c.lat, c.lng], Math.max(12, map.getZoom()));
      });
      this.markers.set(c.id, marker);
      batch.push(marker);
      points.push([c.lat, c.lng]);
    });
    cluster.addLayers(batch);

    if (ordered) {
      if (points.length >= 2) {
        this.route = L.polyline(points).addTo(map);
      }
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
      }
    }
  }

  private buildPopup(c: Campground, marker: L.Marker): HTMLElement {
    const root = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = c.name;
    root.appendChild(title);

    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'view-details-button';
    details.textContent = 'View details ▸';
    details.addEventListener('click', () => {
      marker.closePopup();
      this.viewDetails.emit(c.id);
    });
    root.appendChild(document.createElement('br'));
    root.appendChild(details);

    if (this.supabase.session()) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'view-details-button';
      add.textContent = 'Add to trip…';
      add.addEventListener('click', () => {
        marker.closePopup();
        this.addToTrip.emit(c.id);
      });
      root.appendChild(document.createElement('br'));
      root.appendChild(add);
    }
    return root;
  }

  private centreOn(id: string): void {
    const map = this.map;
    const c = this.lookup.get(id);
    const marker = this.markers.get(id);
    if (!map || !c || !marker || !hasLocation(c)) {
      return;
    }
    map.setView([c.lat, c.lng], Math.max(12, map.getZoom()));
    this.cluster?.zoomToShowLayer(marker, () => undefined);
  }

  private renderSearchLocation(loc: Coordinates | null): void {
    const map = this.map;
    if (!map) {
      return;
    }
    this.locationMarker?.remove();
    this.locationMarker = null;
    if (!loc) {
      return;
    }
    this.locationMarker = L.marker([loc.lat, loc.lng], {
      icon: L.divIcon({ className: 'current-location-marker', iconSize: [16, 16] }),
      zIndexOffset: -1000,
    })
      .bindTooltip('Your search location')
      .addTo(map);
    map.setView([loc.lat, loc.lng], 9);
  }

  private openPickPopup(latlng: L.LatLng): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const root = document.createElement('div');
    const coords = document.createElement('div');
    coords.textContent = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    root.appendChild(coords);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'view-details-button';
    button.textContent = 'Search from here';
    button.addEventListener('click', () => {
      map.closePopup();
      this.locationPick.emit({ lat: latlng.lat, lng: latlng.lng });
    });
    root.appendChild(button);
    L.popup().setLatLng(latlng).setContent(root).openOn(map);
  }
}
