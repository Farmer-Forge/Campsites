import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Campground } from '../../../core/models/campground.model';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AddToTripComponent } from '../add-to-trip/add-to-trip.component';
import { CampgroundDetailPanelComponent } from '../campground-detail-panel/campground-detail-panel.component';
import { FavoriteToggleComponent } from '../favorite-toggle/favorite-toggle.component';

@Component({
  selector: 'app-campground-table',
  imports: [AddToTripComponent, CampgroundDetailPanelComponent, FavoriteToggleComponent],
  template: `
    <div class="rt-scroll-list">
      @for (c of campgrounds(); track c.id) {
        <div class="campground-card" [class.is-open]="expandedId() === c.id" [attr.data-id]="c.id">
          <div
            class="card-main"
            role="button"
            tabindex="0"
            (click)="toggleCard(c)"
            (keydown.enter)="toggleCard(c)"
          >
            @if (planMode()) {
              <button
                type="button"
                class="plan-check"
                [class.is-checked]="planSelected().has(c.id)"
                title="Include in trip"
                aria-label="Include in trip"
                [attr.aria-pressed]="planSelected().has(c.id)"
                (click)="onPlanToggle($event, c.id)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            }
            @if (showDistance()) {
              <div class="distance-badge">
                <span class="badge-top">{{ miles(c) }}</span>
                <span class="badge-sub">MI</span>
              </div>
            }
            <div class="card-text">
              <div class="campground-name-link">{{ c.name }}</div>
              <div class="tags">
                <span class="rt-tag rt-tag--teal">{{ c.agency }}</span>
                @if (c.parkCode) {
                  <span class="rt-tag rt-tag--outline">{{ c.parkCode }}</span>
                }
              </div>
            </div>
            <app-favorite-toggle [campgroundId]="c.id" />
            @if (supabase.session()) {
              <button
                type="button"
                class="rt-icon-btn add-to-trip-toggle"
                [class.is-active]="pickerId() === c.id"
                title="Add to trip"
                aria-label="Add to trip"
                [attr.aria-expanded]="pickerId() === c.id"
                (click)="togglePicker($event, c.id)"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </button>
            }
          </div>
          @if (pickerId() === c.id) {
            <app-add-to-trip [campgroundId]="c.id" (done)="pickerId.set(null)" />
          }
          @if (showNotes()) {
            <div class="note-row">
              <input
                class="note-input"
                type="text"
                placeholder="Add a note"
                aria-label="Add a note"
                [value]="noteValue(c.id)"
                (input)="onNoteInput(c.id, $event)"
                (blur)="onNoteBlur(c.id)"
              />
            </div>
          }
          @if (expandedId() === c.id) {
            <div class="detail" [class.indented]="showDistance()">
              <app-campground-detail-panel [campground]="c" />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .campground-card {
      flex: none;
      content-visibility: auto;
      contain-intrinsic-size: auto 80px;
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
  `,
})
export class CampgroundTableComponent {
  protected readonly supabase = inject(SupabaseService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly campgrounds = input.required<Campground[]>();
  readonly selected = input<Campground | null>(null);
  readonly showDistance = input(true);
  readonly showNotes = input(false);
  readonly notes = input<Map<string, string | null>>(new Map());
  readonly planMode = input(false);
  readonly planSelected = input<Set<string>>(new Set());

  readonly selectedChange = output<Campground | null>();
  readonly noteChange = output<{ campgroundId: string; note: string | null }>();
  readonly planToggle = output<string>();

  protected readonly expandedId = signal<string | null>(null);
  protected readonly pickerId = signal<string | null>(null);
  private readonly drafts = signal<Map<string, string>>(new Map());

  constructor() {
    effect(() => {
      const sel = this.selected();
      untracked(() => {
        if (!sel) {
          return;
        }
        this.expandedId.set(sel.id);
        afterNextRender(
          () => {
            this.host.nativeElement
              .querySelector(`[data-id="${CSS.escape(sel.id)}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          },
          { injector: this.injector },
        );
      });
    });
  }

  protected miles(c: Campground): string {
    const m = c.distanceMeters / 1609.344;
    return m < 100 ? m.toFixed(1) : String(Math.round(m));
  }

  protected toggleCard(c: Campground): void {
    if (this.expandedId() === c.id) {
      this.expandedId.set(null);
      this.selectedChange.emit(null);
    } else {
      this.expandedId.set(c.id);
      this.selectedChange.emit(c);
    }
  }

  protected togglePicker(event: Event, id: string): void {
    event.stopPropagation();
    this.pickerId.update((cur) => (cur === id ? null : id));
  }

  protected onPlanToggle(event: Event, id: string): void {
    event.stopPropagation();
    this.planToggle.emit(id);
  }

  protected noteValue(id: string): string {
    return this.drafts().get(id) ?? this.notes().get(id) ?? '';
  }

  protected onNoteInput(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.drafts.update((d) => new Map(d).set(id, value));
  }

  protected onNoteBlur(id: string): void {
    const draft = this.drafts().get(id);
    if (draft === undefined) {
      return;
    }
    this.drafts.update((d) => {
      const next = new Map(d);
      next.delete(id);
      return next;
    });
    this.noteChange.emit({ campgroundId: id, note: draft.trim() || null });
  }
}
