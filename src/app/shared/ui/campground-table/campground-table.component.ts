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
  /** Most scroll passes scrollCardToTop makes for one selection (spec 3, change #12). */
  private static readonly MAX_SCROLL_PASSES = 10;

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
  readonly openPickerFor = input<string | null>(null);

  readonly selectedChange = output<Campground | null>();
  readonly noteChange = output<{ campgroundId: string; note: string | null }>();
  readonly planToggle = output<string>();

  protected readonly expandedId = signal<string | null>(null);
  protected readonly pickerId = signal<string | null>(null);
  private readonly drafts = signal<Map<string, string>>(new Map());
  /** Bumped on every selection, so a newer selection stops an older one's scroll passes. */
  private scrollRun = 0;
  /** The card just clicked in this list: its echoed selection keeps today's scroll (revealCard). */
  private clickedId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.openPickerFor();
      if (id) {
        untracked(() => this.pickerId.set(id));
      }
    });

    effect(() => {
      const sel = this.selected();
      untracked(() => {
        const fromList = sel !== null && sel.id === this.clickedId;
        this.clickedId = null;
        if (!sel) {
          return;
        }
        this.expandedId.set(sel.id);
        afterNextRender(() => (fromList ? this.revealCard(sel.id) : this.scrollCardToTop(sel.id)), {
          injector: this.injector,
        });
      });
    });
  }

  /** A card clicked in the list itself: unchanged, scroll only as far as needed to show it. */
  private revealCard(id: string): void {
    this.scrollRun += 1; // stops an earlier selection's scroll passes
    this.host.nativeElement
      .querySelector(`[data-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Scrolls a card selected from outside the list (the map popup) so its top sits at the top
   * of the list (spec 3, change #12).
   * Off-screen cards use content-visibility: auto, so until they are drawn they count as
   * their 80px placeholder, and one scroll lands short. So scroll instantly, let the browser
   * draw the cards it now shows (two animation frames), measure again and scroll by what is
   * left. Stop after two passes in a row that moved nothing (the card is in place, or the
   * scroller can't go further even with the newly drawn cards), or after MAX_SCROLL_PASSES.
   * Only the element that scrolls the list moves (scrollAreaOf).
   */
  private scrollCardToTop(id: string): void {
    const run = ++this.scrollRun;
    let passes = 0;
    let calm = 0;
    const pass = (): void => {
      if (run !== this.scrollRun) {
        return;
      }
      const card = this.host.nativeElement.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
      const list = card?.parentElement;
      if (!card || !list) {
        return;
      }
      const area = this.scrollAreaOf(list);
      if (!area) {
        return;
      }
      const { scroller, targetTop } = area;
      const offBy = card.getBoundingClientRect().top - targetTop;
      const before = scroller.scrollTop;
      if (Math.abs(offBy) >= 1) {
        scroller.scrollTop = before + offBy;
      }
      calm = scroller.scrollTop === before ? calm + 1 : 0;
      passes += 1;
      if (calm >= 2 || passes >= CampgroundTableComponent.MAX_SCROLL_PASSES) {
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(pass));
    };
    pass();
  }

  /**
   * The element that scrolls the list: the list itself on a wide screen, the nearest scrolling
   * ancestor when the list doesn't scroll on its own (under 900px it is overflow: visible), or
   * the page. targetTop is where a card's top should land: just inside that element's top
   * padding (0 for the page).
   */
  private scrollAreaOf(list: HTMLElement): { scroller: Element; targetTop: number } | null {
    for (let el: HTMLElement | null = list; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
        return { scroller: el, targetTop: el.getBoundingClientRect().top + parseFloat(style.paddingTop) };
      }
    }
    const page = document.scrollingElement;
    return page ? { scroller: page, targetTop: 0 } : null;
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
      this.clickedId = c.id;
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
