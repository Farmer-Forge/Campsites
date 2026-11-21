import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/finder/finder.component').then((m) => m.FinderComponent),
  },
  {
    path: 'favorites',
    title: 'Favorites',
    loadComponent: () => import('./features/favorites/favorites.component').then((m) => m.FavoritesComponent),
    canActivate: [authGuard],
  },
  {
    path: 'trips',
    title: 'Trips',
    loadComponent: () => import('./features/trips/trips-list.component').then((m) => m.TripsListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'trips/:id',
    title: 'Trip',
    loadComponent: () => import('./features/trips/trip-detail.component').then((m) => m.TripDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'account',
    title: 'Account',
    loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    title: 'Admin',
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'login',
    title: 'Sign in',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'signup',
    title: 'Sign up',
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'forgot-password',
    title: 'Forgot password',
    loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    title: 'Reset password',
    loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'about',
    title: 'About Us',
    loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
