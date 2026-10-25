import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { UserService } from '../services/user.service';

export const adminGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const userService = inject(UserService);
  const router = inject(Router);
  await supabase.ready;
  if (!supabase.session()) {
    return router.parseUrl('/login');
  }
  if (!userService.profile()) {
    await userService.loadProfile();
  }
  return userService.profile()?.role === 'admin' ? true : router.parseUrl('/');
};
