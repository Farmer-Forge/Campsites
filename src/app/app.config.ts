import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { routes } from './app.routes';
import { BrandTitleStrategy } from './core/services/brand-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: BrandTitleStrategy },
    provideAnimationsAsync(),
    providePrimeNG({
      theme: { preset: Aura },
      license:
        'eyJpZCI6ImVhYWFjMzJhLWZkMDMtNDg3ZC04ZDc2LTk5NjEyMWE0YTZhZCIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODY5MTgxMDIsImV4cCI6MTgxODQ1NDEwMn0.88HB7YEVupCudlmHZqsUboqAM8zFUvmTATmlLJcK3s637mD0fYpaSrgqXaTjzWzyLXz0gptt4nZbqi2l9FF8Bg',
    }),
  ],
};
