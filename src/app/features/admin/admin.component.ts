import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Select } from 'primeng/select';
import { AdminUser } from '../../core/models/admin-user.model';
import { CampgroundAttribute } from '../../core/models/campground-attribute.model';
import { AdminStatsService } from '../../core/services/admin-stats.service';
import { AdminUsersService } from '../../core/services/admin-users.service';
import { CampgroundAttributesService } from '../../core/services/campground-attributes.service';
import { CampgroundsService } from '../../core/services/campgrounds.service';
import { SupabaseService } from '../../core/services/supabase.service';

type Tab = 'users' | 'attributes';
interface CampgroundOption {
  id: string;
  name: string;
}

function friendlyError(e: unknown, fallback: string): string {
  const message = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
  if (!message) return fallback;
  const lower = message.toLowerCase();
  if (lower.includes('cannot remove the last admin')) return 'There must always be at least one active admin.';
  if (lower.includes('not authorized')) return 'You no longer have admin access.';
  return message;
}

@Component({
  selector: 'app-admin',
  imports: [FormsModule, DatePipe, Select, AutoComplete],
  templateUrl: './admin.component.html',
  styles: `
    .admin {
      max-width: 1200px;
    }
    .admin-stats {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .admin-stat {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 22px 14px 14px;
      border: 3px solid var(--rt-ink);
      border-radius: 999px;
      background: var(--rt-card);
      box-shadow: 4px 4px 0 var(--rt-ink);
    }
    .admin-stat-value {
      width: 64px;
      height: 64px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px solid var(--rt-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--rt-display);
      font-size: 22px;
    }
    .admin-stat-value.favorites {
      background: var(--rt-mustard);
    }
    .admin-stat-value.trips {
      background: var(--rt-teal);
      color: var(--rt-cream);
    }
    .admin-stat-label {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .tabs {
      display: flex;
      gap: 6px;
      border-bottom: 3px solid var(--rt-ink);
      margin-bottom: -8px;
    }
    .tab {
      font: inherit;
      font-weight: 700;
      font-size: 15px;
      padding: 10px 20px;
      border: 3px solid var(--rt-ink);
      border-bottom: none;
      border-radius: 12px 12px 0 0;
      margin-bottom: -3px;
      cursor: pointer;
      background: var(--rt-sand);
      color: var(--rt-ink);
    }
    .tab.active {
      background: var(--rt-card);
      padding-bottom: 13px;
    }
    .tab-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .add-user-form {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .add-user-form .rt-input {
      flex: 1;
      min-width: 200px;
    }
    .users-table {
      min-width: 860px;
    }
    .email,
    .attr-name {
      font-weight: 600;
    }
    :host ::ng-deep .role-pill {
      border-radius: 999px !important;
      border-width: 1.5px !important;
    }
    :host ::ng-deep .role-pill .p-select-label {
      font-size: 12px;
      font-weight: 700;
      padding: 3px 0 3px 10px !important;
    }
    :host ::ng-deep .role-pill.role-admin {
      background: var(--rt-mustard) !important;
    }
    :host ::ng-deep .campground-search {
      max-width: 480px;
      width: 100%;
    }
    :host ::ng-deep .campground-search .p-autocomplete-input {
      width: 100%;
    }
  `,
})
export class AdminComponent implements OnInit {
  private readonly usersService = inject(AdminUsersService);
  private readonly statsService = inject(AdminStatsService);
  private readonly attributesService = inject(CampgroundAttributesService);
  private readonly campgrounds = inject(CampgroundsService);
  private readonly supabase = inject(SupabaseService);

  protected readonly users = this.usersService.users;
  protected readonly stats = this.statsService.stats;
  protected readonly attributes = this.attributesService.attributes;
  protected readonly roles = [
    { label: 'User', value: 'user' },
    { label: 'Moderator', value: 'moderator' },
    { label: 'Admin', value: 'admin' },
  ];

  protected readonly tab = signal<Tab>('users');
  protected readonly statsError = signal('');
  protected readonly error = signal('');

  protected inviteEmail = '';
  protected inviteName = '';
  protected readonly inviting = signal(false);

  protected readonly editingId = signal<string | null>(null);
  protected editEmail = '';
  protected editName = '';
  protected readonly deletingId = signal<string | null>(null);

  protected selectedCampground: CampgroundOption | null = null;
  protected suggestions: CampgroundOption[] = [];
  private campgroundId: string | null = null;
  protected readonly attrError = signal('');
  protected readonly editingAttrId = signal<string | null>(null);
  protected editAttr = { type: '', name: '', value: '' };
  protected newAttr = { type: '', name: '', value: '' };

  protected get myId(): string | undefined {
    return this.supabase.session()?.user.id;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.refreshStats(), this.reloadUsers()]);
  }

  private async refreshStats(): Promise<void> {
    try {
      await this.statsService.loadStats();
      this.statsError.set('');
    } catch (e) {
      this.statsError.set(friendlyError(e, 'Could not load site stats.'));
    }
  }

  private async reloadUsers(): Promise<void> {
    try {
      await this.usersService.loadUsers();
    } catch (e) {
      this.error.set(friendlyError(e, 'Could not load users.'));
    }
  }

  protected async invite(): Promise<void> {
    const email = this.inviteEmail.trim();
    if (!email) return;
    this.inviting.set(true);
    this.error.set('');
    try {
      await this.usersService.inviteUser(email, this.inviteName.trim());
      this.inviteEmail = '';
      this.inviteName = '';
      await this.reloadUsers();
    } catch (e) {
      this.error.set(friendlyError(e, 'Could not invite user.'));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async changeRole(user: AdminUser, role: AdminUser['role']): Promise<void> {
    if (role === user.role) return;
    this.error.set('');
    try {
      await this.usersService.updateRole(user.id, role);
    } catch (e) {
      this.error.set(friendlyError(e, 'Could not update role.'));
      await this.reloadUsers();
    }
  }

  protected async toggleSuspended(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.setSuspended(user.id, !user.suspended);
    } catch (e) {
      this.error.set(friendlyError(e, 'Could not update suspension.'));
    }
  }

  protected startEdit(user: AdminUser): void {
    this.editingId.set(user.id);
    this.editEmail = user.email;
    this.editName = user.displayName;
    this.deletingId.set(null);
  }

  protected async saveEdit(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      const name = this.editName.trim();
      const email = this.editEmail.trim();
      if (name !== user.displayName) {
        await this.usersService.updateDisplayName(user.id, name);
      }
      if (email && email !== user.email) {
        await this.usersService.updateEmail(user.id, email);
      }
      this.editingId.set(null);
    } catch (e) {
      this.error.set(friendlyError(e, 'Could not update user.'));
    }
  }

  protected async confirmDelete(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.deleteUser(user.id);
      this.deletingId.set(null);
      await this.refreshStats();
    } catch (e) {
      this.error.set(friendlyError(e, 'Could not delete user.'));
    }
  }

  protected async search(event: AutoCompleteCompleteEvent): Promise<void> {
    try {
      this.suggestions = await this.campgrounds.searchByName(event.query);
    } catch (e) {
      this.suggestions = [];
      this.attrError.set(friendlyError(e, 'Could not search campgrounds.'));
    }
  }

  protected async pickCampground(option: CampgroundOption | null): Promise<void> {
    this.editingAttrId.set(null);
    this.attrError.set('');
    if (!option?.id) {
      this.campgroundId = null;
      return;
    }
    this.campgroundId = option.id;
    try {
      await this.attributesService.loadForCampground(option.id);
    } catch (e) {
      this.attrError.set(friendlyError(e, 'Could not load attributes.'));
    }
  }

  protected startEditAttr(attr: CampgroundAttribute): void {
    this.editingAttrId.set(attr.id);
    this.editAttr = { type: attr.type, name: attr.name, value: attr.value ?? '' };
  }

  protected async saveAttr(attr: CampgroundAttribute): Promise<void> {
    const { type, name, value } = this.editAttr;
    if (!type.trim() || !name.trim()) return;
    this.attrError.set('');
    try {
      await this.attributesService.updateAttribute(attr.id, type.trim(), name.trim(), value.trim() || null);
      this.editingAttrId.set(null);
    } catch (e) {
      this.attrError.set(friendlyError(e, 'Could not update attribute.'));
    }
  }

  protected async deleteAttr(attr: CampgroundAttribute): Promise<void> {
    this.attrError.set('');
    try {
      await this.attributesService.deleteAttribute(attr.id);
    } catch (e) {
      this.attrError.set(friendlyError(e, 'Could not delete attribute.'));
    }
  }

  protected async addAttr(): Promise<void> {
    const { type, name, value } = this.newAttr;
    if (!this.campgroundId || !type.trim() || !name.trim()) return;
    this.attrError.set('');
    try {
      await this.attributesService.addAttribute(this.campgroundId, type.trim(), name.trim(), value.trim() || null);
      this.newAttr = { type: '', name: '', value: '' };
    } catch (e) {
      this.attrError.set(friendlyError(e, 'Could not add attribute.'));
    }
  }
}
