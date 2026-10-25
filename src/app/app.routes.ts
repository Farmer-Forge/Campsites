import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

const placeholder = () => import('./features/placeholder/placeholder.component').then((m) => m.PlaceholderComponent);

export const routes: Routes = [
  { path: '', loadComponent: placeholder },
  { path: 'favorites', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'trips', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'trips/:id', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'account', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'admin', loadComponent: placeholder, canActivate: [adminGuard] },
  { path: 'login', loadComponent: placeholder },
  { path: 'signup', loadComponent: placeholder },
  { path: 'forgot-password', loadComponent: placeholder },
  { path: 'reset-password', loadComponent: placeholder },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
