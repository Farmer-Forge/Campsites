import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-account',
  imports: [FormsModule],
  templateUrl: './account.component.html',
  styles: `
    .rt-content {
      max-width: 720px;
      gap: 20px;
    }
    .card-action {
      align-self: flex-start;
    }
    .password-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
    }
    .danger-zone {
      border-color: var(--rt-cherry);
      box-shadow: none;
    }
    .danger-zone .rt-heading {
      color: var(--rt-cherry);
    }
    .confirm-text {
      margin: 0;
    }
    .confirm-actions {
      display: flex;
      gap: 8px;
    }
  `,
})
export class AccountComponent implements OnInit {
  protected readonly userService = inject(UserService);
  private readonly router = inject(Router);

  protected displayName = '';
  protected newPassword = '';
  protected confirmPassword = '';

  protected readonly savingName = signal(false);
  protected readonly nameMessage = signal('');
  protected readonly nameError = signal('');
  protected readonly savingPassword = signal(false);
  protected readonly passwordMessage = signal('');
  protected readonly passwordError = signal('');
  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');

  async ngOnInit(): Promise<void> {
    await this.userService.loadProfile();
    this.displayName = this.userService.profile()?.displayName ?? '';
  }

  protected async saveName(): Promise<void> {
    const name = this.displayName.trim();
    if (!name) {
      return;
    }
    this.nameMessage.set('');
    this.nameError.set('');
    this.savingName.set(true);
    try {
      await this.userService.updateDisplayName(name);
      this.displayName = name;
      this.nameMessage.set('Display name updated.');
    } catch {
      this.nameError.set('Could not update display name. Please try again.');
    } finally {
      this.savingName.set(false);
    }
  }

  protected async savePassword(): Promise<void> {
    if (!this.newPassword) {
      return;
    }
    this.passwordMessage.set('');
    this.passwordError.set('');
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('Passwords do not match.');
      return;
    }
    this.savingPassword.set(true);
    try {
      await this.userService.updatePassword(this.newPassword);
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordMessage.set('Password updated.');
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      this.passwordError.set(message || 'Could not update password. Please try again.');
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected async deleteAccount(): Promise<void> {
    this.deleteError.set('');
    this.deleting.set(true);
    try {
      await this.userService.deleteAccount();
      await this.router.navigate(['/']);
    } catch {
      let message = 'Could not delete account. Please try again.';
      if (this.userService.profile()?.role === 'admin') {
        message += " If you're the only admin, make another user an admin first.";
      }
      this.deleteError.set(message);
      this.deleting.set(false);
    }
  }
}
