import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

type ResetState = 'checking' | 'invalid' | 'suspended' | 'ready';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  styleUrl: './auth.scss',
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected password = '';
  protected confirm = '';
  protected readonly state = signal<ResetState>('checking');
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    await this.supabase.ready;
    const { data } = await this.supabase.client.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      this.state.set('invalid');
      return;
    }

    const { data: row, error } = await this.supabase.client
      .from('users')
      .select('suspended')
      .eq('id', user.id)
      .single();
    if (error || !row || row.suspended) {
      await this.supabase.signOut();
      this.state.set('suspended');
      return;
    }
    this.state.set('ready');
  }

  protected async submit(): Promise<void> {
    if (!this.password || !this.confirm) {
      return;
    }
    this.error.set('');
    if (this.password !== this.confirm) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.submitting.set(true);
    try {
      const { error } = await this.supabase.client.auth.updateUser({ password: this.password });
      if (error) {
        this.error.set(error.message || 'Could not update password. Please try again.');
        return;
      }
      await this.supabase.signOut();
      await this.router.navigate(['/login'], { queryParams: { reset: 'done' } });
    } finally {
      this.submitting.set(false);
    }
  }
}
