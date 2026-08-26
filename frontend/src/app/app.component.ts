import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthComponent } from './auth/auth.component';
import { OrdersDashboardComponent } from './orders-dashboard/orders-dashboard.component';
import { NotificationsWidgetComponent } from './notifications-widget/notifications-widget.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, AuthComponent, OrdersDashboardComponent, NotificationsWidgetComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  isAuthenticated = false;
  sessionToken = '';

  onLoginSuccess(token: string) {
    this.isAuthenticated = true;
    this.sessionToken = token;
  }

  logout() {
    this.isAuthenticated = false;
    this.sessionToken = '';
    sessionStorage.removeItem('session_token');
  }
}
