import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink],
  styleUrl: './auth.scss',
  templateUrl: './signup.component.html',
})
export class SignupComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected displayName = '';
  protected email = '';
  protected password = '';
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly checkEmail = signal(false);

  protected get canSubmit(): boolean {
    return !!this.displayName.trim() && !!this.email && !!this.password;
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email: this.email,
        password: this.password,
        options: { data: { display_name: this.displayName.trim() } },
      });
      if (error) {
        this.error.set(error.message);
        return;
      }
      if (data.session) {
        await this.router.navigateByUrl('/');
      } else {
        this.checkEmail.set(true);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
