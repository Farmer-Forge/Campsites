import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();
  readonly ready: Promise<void>;
  private readonly resets: (() => void)[] = [];

  constructor() {
    this.ready = this.client.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
    });

    this.client.auth.onAuthStateChange((event, session) => {
      this._session.set(session);
      if (event === 'SIGNED_OUT') {
        this.runResets();
      }
    });
  }

  get isAuthenticated(): boolean {
    return this._session() !== null;
  }

  onSignOut(reset: () => void): void {
    this.resets.push(reset);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    this.runResets();
  }

  private runResets(): void {
    this.resets.forEach((reset) => reset());
  }
}
