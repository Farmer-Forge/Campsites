import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Select } from 'primeng/select';
import { AdminUser } from '../../core/models/admin-user.model';
import { Campground } from '../../core/models/campground.model';
import { AdminStatsService } from '../../core/services/admin-stats.service';
import { AdminUsersService } from '../../core/services/admin-users.service';
import { CampgroundAttributesService } from '../../core/services/campground-attributes.service';
import { CampgroundsService } from '../../core/services/campgrounds.service';
import { UserService } from '../../core/services/user.service';

type Tab = 'users' | 'attributes';
type CampgroundOption = Pick<Campground, 'id' | 'name'>;

@Component({
  selector: 'app-admin',
  imports: [AutoComplete, DatePipe, FormsModule, Select],
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
  private readonly userService = inject(UserService);

  readonly users = this.usersService.users;
  readonly stats = this.statsService.stats;
  readonly attributes = this.attributesService.attributes;
  readonly myId = computed(() => this.userService.profile()?.id);

  readonly roles = [
    { label: 'User', value: 'user' },
    { label: 'Moderator', value: 'moderator' },
    { label: 'Admin', value: 'admin' },
  ];

  readonly tab = signal<Tab>('users');
  readonly error = signal('');

  inviteEmail = '';
  inviteName = '';

  readonly editingId = signal<string | null>(null);
  editEmail = '';
  editName = '';
  readonly confirmingId = signal<string | null>(null);

  campground: CampgroundOption | null = null;
  suggestions: CampgroundOption[] = [];
  readonly attrCampgroundId = signal<string | null>(null);
  readonly editingAttrId = signal<string | null>(null);
  editAttr = { type: '', name: '', value: '' };
  newAttr = { type: '', name: '', value: '' };

  ngOnInit(): void {
    void this.loadStats();
    void this.loadUsers();
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
    if (!text) return fallback;
    if (text.includes('cannot remove the last admin')) {
      return 'There must always be at least one active admin.';
    }
    if (text.includes('not authorized')) return 'You no longer have admin access.';
    return text;
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.error.set('');
  }

  async invite(): Promise<void> {
    const email = this.inviteEmail.trim();
    if (!email) return;
    this.error.set('');
    try {
      await this.usersService.inviteUser(email, this.inviteName.trim());
      this.inviteEmail = '';
      this.inviteName = '';
      await this.usersService.loadUsers();
    } catch (e) {
      this.error.set(this.message(e, 'Could not invite user.'));
    }
  }

  async changeRole(user: AdminUser, role: AdminUser['role']): Promise<void> {
    if (role === user.role) return;
    this.error.set('');
    try {
      await this.usersService.updateRole(user.id, role);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update role.'));
      await this.loadUsers();
    }
  }

  async toggleSuspended(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.setSuspended(user.id, !user.suspended);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update suspension.'));
    }
  }

  startEdit(user: AdminUser): void {
    this.editingId.set(user.id);
    this.editEmail = user.email;
    this.editName = user.displayName;
    this.confirmingId.set(null);
  }

  async saveEdit(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      const name = this.editName.trim();
      const email = this.editEmail.trim();
      if (name !== user.displayName) await this.usersService.updateDisplayName(user.id, name);
      if (email && email !== user.email) await this.usersService.updateEmail(user.id, email);
      this.editingId.set(null);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update user.'));
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    this.error.set('');
    try {
      await this.usersService.deleteUser(user.id);
      this.confirmingId.set(null);
      await this.loadStats();
    } catch (e) {
      this.error.set(this.message(e, 'Could not delete user.'));
    }
  }

  async search(event: AutoCompleteCompleteEvent): Promise<void> {
    try {
      this.suggestions = await this.campgrounds.searchByName(event.query);
    } catch (e) {
      this.suggestions = [];
      this.error.set(this.message(e, 'Could not search campgrounds.'));
    }
  }

  async pickCampground(option: CampgroundOption): Promise<void> {
    this.error.set('');
    this.editingAttrId.set(null);
    this.attrCampgroundId.set(option.id);
    try {
      await this.attributesService.loadForCampground(option.id);
    } catch (e) {
      this.error.set(this.message(e, 'Could not load attributes.'));
    }
  }

  startEditAttr(a: { id: string; type: string; name: string; value: string | null }): void {
    this.editingAttrId.set(a.id);
    this.editAttr = { type: a.type, name: a.name, value: a.value ?? '' };
  }

  async saveAttr(id: string): Promise<void> {
    const { type, name, value } = this.editAttr;
    if (!type.trim() || !name.trim()) return;
    this.error.set('');
    try {
      await this.attributesService.updateAttribute(id, type.trim(), name.trim(), value.trim() || null);
      this.editingAttrId.set(null);
    } catch (e) {
      this.error.set(this.message(e, 'Could not update attribute.'));
    }
  }

  async addAttr(): Promise<void> {
    const campgroundId = this.attrCampgroundId();
    const { type, name, value } = this.newAttr;
    if (!campgroundId || !type.trim() || !name.trim()) return;
    this.error.set('');
    try {
      await this.attributesService.addAttribute(campgroundId, type.trim(), name.trim(), value.trim() || null);
      this.newAttr = { type: '', name: '', value: '' };
    } catch (e) {
      this.error.set(this.message(e, 'Could not add attribute.'));
    }
  }

  async deleteAttr(id: string): Promise<void> {
    this.error.set('');
    try {
      await this.attributesService.deleteAttribute(id);
    } catch (e) {
      this.error.set(this.message(e, 'Could not delete attribute.'));
    }
  }
}
