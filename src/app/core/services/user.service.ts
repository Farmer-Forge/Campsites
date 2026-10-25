import { inject, Injectable, signal } from '@angular/core';
import { UserProfile } from '../models/user.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly supabase = inject(SupabaseService);
  readonly profile = signal<UserProfile | null>(null);

  constructor() {
    this.supabase.onSignOut(() => this.profile.set(null));
  }

  async loadProfile(): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) {
      this.profile.set(null);
      return;
    }
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id, display_name, role')
      .eq('id', userId)
      .single();
    if (error || !data) {
      this.profile.set(null);
      return;
    }
    this.profile.set({ id: data.id, displayName: data.display_name, role: data.role });
  }
}
