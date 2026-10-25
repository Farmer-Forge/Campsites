import { CdkAutoSizeVirtualScroll } from '@angular/cdk-experimental/scrolling';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { Component, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { Campground } from '../../../core/models/campground.model';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AddToTripComponent } from '../add-to-trip/add-to-trip.component';
import { CampgroundDetailPanelComponent } from '../campground-detail-panel/campground-detail-panel.component';
import { FavoriteToggleComponent } from '../favorite-toggle/favorite-toggle.component';

const METERS_PER_MILE = 1609.344;

@Component({
  selector: 'app-campground-table',
  imports: [
    ScrollingModule,
    CdkAutoSizeVirtualScroll,
    FavoriteToggleComponent,
    AddToTripComponent,
    CampgroundDetailPanelComponent,
  ],
  templateUrl: './campground-table.component.html',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .campground-card {
      flex: none;
      border: 2px solid var(--rt-ink);
      border-radius: 14px;
      background: var(--rt-card);
      box-shadow: 3px 3px 0 var(--rt-ink);
    }
    .campground-card.is-open {
      background: var(--rt-cream);
    }
    .card-main {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 12px 14px;
      cursor: pointer;
    }
    .distance-badge {
      width: 58px;
      height: 58px;
      flex: none;
      box-sizing: border-box;
      border-radius: 50%;
      background: var(--rt-mustard);
      border: 2px solid var(--rt-ink);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
      gap: 2px;
    }
    .badge-top {
      font-family: var(--rt-display);
      font-size: 16px;
    }
    .badge-sub {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
    }
    .card-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .campground-name-link {
      font-weight: 700;
      font-size: 17px;
      line-height: 1.3;
    }
    .tags {
      display: flex;
      gap: 6px;
    }
    .plan-check {
      width: 28px;
      height: 28px;
      flex: none;
      padding: 0;
      border: 2px solid var(--rt-ink);
      border-radius: 8px;
      background: var(--rt-cream);
      color: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .plan-check.is-checked {
      background: var(--rt-teal);
      color: var(--rt-cream);
    }
    .note-row {
      padding: 0 14px 12px;
    }
    .note-input {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      font-size: 14px;
      padding: 7px 12px;
      border: none;
      border-bottom: 2px dotted var(--rt-ink);
      background: transparent;
      color: var(--rt-ink);
    }
    .detail {
      padding: 2px 14px 16px;
    }
    .detail.indented {
      padding-left: 86px;
    }
    @media (max-width: 900px) {
      .detail.indented {
        padding-left: 14px;
      }
    }
    .card-slot {
      padding-bottom: 10px;
    }
    .rt-scroll-list {
      display: block;
    }
    @media (max-width: 900px) {
      .rt-scroll-list {
        flex: none;
        height: 60vh;
        overflow-y: auto;
      }
    }
  `,
})
export class CampgroundTableComponent {
  readonly campgrounds = input.required<Campground[]>();
  readonly selected = input<Campground | null>(null);
  readonly openPickerFor = input<string | null>(null);
  readonly showDistance = input(true);
  readonly showNotes = input(false);
  readonly notes = input<Map<string, string | null>>(new Map());
  readonly planMode = input(false);
  readonly planSelected = input<Set<string>>(new Set());

  readonly selectedChange = output<Campground | null>();
  readonly noteChange = output<{ campgroundId: string; note: string }>();
  readonly planToggle = output<string>();

  private readonly supabase = inject(SupabaseService);
  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  protected readonly openId = signal<string | null>(null);
  protected readonly pickerId = signal<string | null>(null);
  private readonly drafts = signal<Map<string, string>>(new Map());
  protected readonly hasSession = computed(() => !!this.supabase.session());

  constructor() {
    effect(() => {
      const selected = this.selected();
      if (!selected) {
        return;
      }
      this.openId.set(selected.id);
      const index = untracked(() => this.campgrounds()).findIndex((c) => c.id === selected.id);
      if (index >= 0) {
        untracked(() => this.viewport())?.scrollToIndex(index, 'smooth');
      }
    });
    effect(() => {
      const id = this.openPickerFor();
      if (id) {
        this.pickerId.set(id);
      }
    });
  }

  protected trackById(_: number, campground: Campground): string {
    return campground.id;
  }

  protected badge(campground: Campground): string {
    const miles = campground.distanceMeters / METERS_PER_MILE;
    return miles < 100 ? miles.toFixed(1) : String(Math.round(miles));
  }

  protected toggleCard(campground: Campground): void {
    if (this.openId() === campground.id) {
      this.openId.set(null);
      this.selectedChange.emit(null);
    } else {
      this.openId.set(campground.id);
      this.selectedChange.emit(campground);
    }
  }

  protected togglePicker(event: Event, id: string): void {
    event.stopPropagation();
    this.pickerId.update((current) => (current === id ? null : id));
  }

  protected togglePlan(event: Event, id: string): void {
    event.stopPropagation();
    this.planToggle.emit(id);
  }

  protected noteValue(id: string): string {
    return this.drafts().get(id) ?? this.notes().get(id) ?? '';
  }

  protected setDraft(id: string, value: string): void {
    this.drafts.update((m) => new Map(m).set(id, value));
  }

  protected commitNote(id: string): void {
    this.noteChange.emit({ campgroundId: id, note: this.noteValue(id) });
  }
}
