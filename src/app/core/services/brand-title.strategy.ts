import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** The end of every tab title (spec 2, change #6). */
export const SITE_TITLE = 'Campsites · Forge Outdoors';

/** Tab titles: "<route title> · Campsites · Forge Outdoors", or just the suffix for a route without one. */
@Injectable({ providedIn: 'root' })
export class BrandTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · ${SITE_TITLE}` : SITE_TITLE);
  }
}
