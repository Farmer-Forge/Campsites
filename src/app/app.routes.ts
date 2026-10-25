import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

const placeholder = () => import('./features/placeholder/placeholder.component').then((m) => m.PlaceholderComponent);

export const routes: Routes = [
  { path: '', loadComponent: placeholder },
  { path: 'favorites', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'trips', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'trips/:id', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'account', loadComponent: placeholder, canActivate: [authGuard] },
  { path: 'admin', loadComponent: placeholder, canActivate: [adminGuard] },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
