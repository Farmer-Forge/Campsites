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

  async updateDisplayName(name: string): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) throw new Error('Not signed in');
    const { error } = await this.supabase.client
      .from('users')
      .update({ display_name: name })
      .eq('id', userId);
    if (error) throw error;
    const { error: metaError } = await this.supabase.client.auth.updateUser({
      data: { display_name: name },
    });
    if (metaError) throw metaError;
    this.profile.update((p) => (p ? { ...p, displayName: name } : p));
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.updateUser({ password });
    if (error) throw error;
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.supabase.client.functions.invoke('delete-account');
    if (error) throw error;
    await this.supabase.signOut();
  }
}
