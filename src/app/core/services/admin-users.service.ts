import { inject, Injectable, signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AdminUser } from '../models/admin-user.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly supabase = inject(SupabaseService);
  private readonly _users = signal<AdminUser[]>([]);
  readonly users = this._users.asReadonly();

  constructor() {
    this.supabase.onSignOut(() => this._users.set([]));
  }

  async loadUsers(): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('get_users_for_admin');
    if (error) {
      throw error;
    }
    this._users.set(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        email: r['email'] as string,
        displayName: (r['display_name'] as string | null) ?? null,
        role: r['role'] as string,
        suspended: r['suspended'] as boolean,
        createdAt: r['created_at'] as string,
      })),
    );
  }

  async updateRole(id: string, role: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('admin_update_user_role', {
      target_user_id: id,
      new_role: role,
    });
    if (error) {
      throw error;
    }
    this.patch(id, { role });
  }

  async setSuspended(id: string, suspended: boolean): Promise<void> {
    const { error } = await this.supabase.client.rpc('admin_set_user_suspended', {
      target_user_id: id,
      is_suspended: suspended,
    });
    if (error) {
      throw error;
    }
    this.patch(id, { suspended });
  }

  async updateDisplayName(id: string, displayName: string | null): Promise<void> {
    const { error } = await this.supabase.client.rpc('admin_update_user_display_name', {
      target_user_id: id,
      new_display_name: displayName,
    });
    if (error) {
      throw error;
    }
    this.patch(id, { displayName });
  }

  async updateEmail(id: string, email: string): Promise<void> {
    await this.invoke('admin-update-user-email', { target_user_id: id, new_email: email });
    this.patch(id, { email });
  }

  async inviteUser(email: string, displayName?: string): Promise<void> {
    await this.invoke('admin-invite-user', { email, display_name: displayName || undefined });
  }

  async deleteUser(id: string): Promise<void> {
    await this.invoke('admin-delete-account', { target_user_id: id });
    this._users.update((users) => users.filter((u) => u.id !== id));
  }

  private patch(id: string, changes: Partial<AdminUser>): void {
    this._users.update((users) => users.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  }

  private async invoke(name: string, body: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client.functions.invoke(name, { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        throw new Error((await error.context.text()) || error.message);
      }
      throw error;
    }
  }
}
