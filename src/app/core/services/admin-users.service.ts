import { inject, Injectable, signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AdminUser } from '../models/admin-user.model';
import { SupabaseService } from './supabase.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    suspended: row.suspended,
    createdAt: row.created_at,
  };
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly supabase = inject(SupabaseService);
  readonly users = signal<AdminUser[]>([]);

  constructor() {
    this.supabase.onSignOut(() => this.users.set([]));
  }

  async loadUsers(): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('get_users_for_admin');
    if (error) {
      throw error;
    }
    const users = (data ?? []).map(toAdminUser) as AdminUser[];
    users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.users.set(users);
  }

  async updateRole(id: string, role: AdminUser['role']): Promise<void> {
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

  async updateDisplayName(id: string, displayName: string): Promise<void> {
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
    this.users.update((users) => users.filter((u) => u.id !== id));
  }

  private patch(id: string, changes: Partial<AdminUser>): void {
    this.users.update((users) => users.map((u) => (u.id === id ? { ...u, ...changes } : u)));
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
