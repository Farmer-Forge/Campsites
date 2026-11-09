import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
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

interface CampgroundOption {
  id: string;
  name: string;
}

@Component({
  selector: 'app-admin',
  imports: [DatePipe, FormsModule, AutoComplete, Select],
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
  private readonly campgroundsService = inject(CampgroundsService);
  private readonly supabase = inject(SupabaseService);

  protected readonly users = this.usersService.users;
  protected readonly stats = this.statsService.stats;
  protected readonly attributes = this.attributesService.attributes;

  protected readonly roles = [
    { label: 'User', value: 'user' },
    { label: 'Moderator', value: 'moderator' },
    { label: 'Admin', value: 'admin' },
  ];

  protected readonly tab = signal<'users' | 'attributes'>('users');
  protected readonly error = signal('');

  protected inviteEmail = '';
  protected inviteName = '';
  protected readonly inviting = signal(false);

  protected readonly editingUserId = signal<string | null>(null);
  protected editEmail = '';
  protected editName = '';
  protected readonly deletingUserId = signal<string | null>(null);

  protected selectedCampground: CampgroundOption | null = null;
  protected suggestions: CampgroundOption[] = [];
  protected readonly editingAttrId = signal<string | null>(null);
  protected editType = '';
  protected editAttrName = '';
  protected editValue = '';
  protected newType = '';
  protected newName = '';
  protected newValue = '';

  protected get myId(): string | undefined {
    return this.supabase.session()?.user.id;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadStats(), this.loadUsers()]);
  }

  protected showTab(tab: 'users' | 'attributes'): void {
    this.tab.set(tab);
    this.error.set('');
  }

  private async loadStats(): Promise<void> {
    try {
      await this.statsService.loadStats();
    } catch (e) {
      this.error.set(this.message(e, 'Could not load site stats.'));
    }
  }

  private async loadUsers(): Promise<void> {
    try {
      await this.usersService.loadUsers();
    } catch (e) {
      this.error.set(this.message(e, 'Could not load users.'));
    }
  }

  private message(e: unknown, fallback: string): string {
    const text = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
    if (!text) {
      return fallback;
    }
    const lower = text.toLowerCase();
    if (lower.includes('cannot remove the last admin')) {
      return 'There must always be at least one active admin.';
    }
    if (lower.includes('not authorized')) {
      return 'You no longer have admin access.';
    }
    return text;
  }

  protected async invite(): Promise<void> {
    const email = this.inviteEmail.trim();
    if (!email) {
      return;
    }
    this.error.set('');
    this.inviting.set(true);
    try {
      await this.usersService.inviteUser(email, this.inviteName.trim());
      this.inviteEmail = '';
      this.inviteName = '';
      await this.loadUsers();
    } catch (e) {
      this.error.set(this.message(e, 'Could not invite user.'));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async changeRole(user: AdminUser, role: string): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.updateRole(user.id, role);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update role.'));
      await this.loadUsers();
    }
  }

  protected async toggleSuspended(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.setSuspended(user.id, !user.suspended);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update suspension.'));
    }
  }

  protected startEdit(user: AdminUser): void {
    this.editingUserId.set(user.id);
    this.editEmail = user.email;
    this.editName = user.displayName ?? '';
    this.deletingUserId.set(null);
  }

  protected async saveEdit(user: AdminUser): Promise<void> {
    this.error.set('');
    const name = this.editName.trim();
    const email = this.editEmail.trim();
    try {
      if (name !== (user.displayName ?? '')) {
        await this.usersService.updateDisplayName(user.id, name || null);
      }
      if (email && email !== user.email) {
        await this.usersService.updateEmail(user.id, email);
      }
      this.editingUserId.set(null);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update user.'));
    }
  }

  protected async deleteUser(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.deleteUser(user.id);
      this.deletingUserId.set(null);
      await this.loadStats();
    } catch (e) {
      this.error.set(this.message(e, 'Could not delete user.'));
    }
  }

  protected async search(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (!query) {
      this.suggestions = [];
      return;
    }
    try {
      this.suggestions = await this.campgroundsService.searchByName(query);
    } catch (e) {
      this.suggestions = [];
      this.error.set(this.message(e, 'Could not search campgrounds.'));
    }
  }

  protected async pickCampground(campground: CampgroundOption): Promise<void> {
    this.error.set('');
    this.editingAttrId.set(null);
    try {
      await this.attributesService.loadForCampground(campground.id);
    } catch (e) {
      this.error.set(this.message(e, 'Could not load attributes.'));
    }
  }

  protected startEditAttr(attr: CampgroundAttribute): void {
    this.editingAttrId.set(attr.id);
    this.editType = attr.type;
    this.editAttrName = attr.name;
    this.editValue = attr.value ?? '';
  }

  protected async saveAttr(attr: CampgroundAttribute): Promise<void> {
    const type = this.editType.trim();
    const name = this.editAttrName.trim();
    if (!type || !name) {
      return;
    }
    this.error.set('');
    try {
      await this.attributesService.updateAttribute(attr.id, {
        type,
        name,
        value: this.editValue.trim() || null,
      });
      this.editingAttrId.set(null);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update attribute.'));
    }
  }

  protected async deleteAttr(attr: CampgroundAttribute): Promise<void> {
    this.error.set('');
    try {
      await this.attributesService.deleteAttribute(attr.id);
    } catch (e) {
      this.error.set(this.message(e, 'Could not delete attribute.'));
    }
  }

  protected async addAttr(): Promise<void> {
    const type = this.newType.trim();
    const name = this.newName.trim();
    if (!this.selectedCampground || !type || !name) {
      return;
    }
    this.error.set('');
    try {
      await this.attributesService.addAttribute(this.selectedCampground.id, {
        type,
        name,
        value: this.newValue.trim() || null,
      });
      this.newType = '';
      this.newName = '';
      this.newValue = '';
    } catch (e) {
      this.error.set(this.message(e, 'Could not add attribute.'));
    }
  }
}
