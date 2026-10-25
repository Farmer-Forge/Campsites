import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  styleUrl: './auth.scss',
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected email = '';
  protected password = '';
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly resetDone = this.route.snapshot.queryParamMap.get('reset') === 'done';

  protected async submit(): Promise<void> {
    this.error.set('');
    this.submitting.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email: this.email,
        password: this.password,
      });
      if (error) {
        this.error.set(error.message);
        return;
      }

      const { data: row, error: readError } = await this.supabase.client
        .from('users')
        .select('suspended')
        .eq('id', data.user.id)
        .single();
      if (readError || !row) {
        await this.supabase.signOut();
        this.error.set('Something went wrong signing in. Please try again.');
        return;
      }
      if (row.suspended) {
        await this.supabase.signOut();
        this.error.set('This account has been suspended.');
        return;
      }

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const target = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
      await this.router.navigateByUrl(target);
    } finally {
      this.submitting.set(false);
    }
  }
}
