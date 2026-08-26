import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css'
})
export class AuthComponent {
  @Output() loginSuccess = new EventEmitter<string>();

  private api = inject(ApiService);

  email = '';
  password = '';
  isLoading = false;
  error = '';

  async onSubmit() {
    this.isLoading = true;
    this.error = '';

    try {
      const data = await this.api.post('/auth/login', {
        email: this.email,
        password: this.password
      });

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
