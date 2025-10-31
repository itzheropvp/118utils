import { Routes } from '@angular/router';

import { canActivate, redirectUnauthorizedTo } from '@angular/fire/auth-guard';
const redirectToLogin = () => redirectUnauthorizedTo(['login']);

export const routes: Routes = [
    {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.Login),
  },
  {
    path: 'dashboard',
    ...canActivate(redirectToLogin),
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
