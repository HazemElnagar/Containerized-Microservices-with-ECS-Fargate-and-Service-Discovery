import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css'
})
export class AuthComponent {
  @Output() loginSuccess = new EventEmitter<string>();

  email = '';
  password = '';
  isLoading = false;
  error = '';

  async onSubmit() {
    this.isLoading = true;
    this.error = '';

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Login failed (${response.status})`);
      }

      const data = await response.json();
      sessionStorage.setItem('session_token', data.token);
      this.isLoading = false;
      this.loginSuccess.emit(data.token);
    } catch (err: any) {
      this.isLoading = false;
      this.error = err.message || 'Unable to reach authentication service.';
      console.error('[Auth] Login error:', err);
    }
  }
}
