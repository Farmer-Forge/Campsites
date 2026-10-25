import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  styleUrl: './auth.scss',
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly supabase = inject(SupabaseService);

  protected email = '';
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly sent = signal(false);

  protected async submit(): Promise<void> {
    if (!this.email) {
      return;
    }
    this.error.set('');
    this.sent.set(false);
    this.submitting.set(true);
    try {
      const { error } = await this.supabase.client.auth.resetPasswordForEmail(this.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        this.error.set(error.message);
        return;
      }
      this.sent.set(true);
    } finally {
      this.submitting.set(false);
    }
  }
}
