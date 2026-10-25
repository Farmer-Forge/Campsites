import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  await supabase.ready;
  return supabase.session()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
