import { Component, OnInit } from '@angular/core';
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
export class AppComponent implements OnInit {
  isAuthenticated = false;
  sessionToken = '';

  ngOnInit() {
    // Restore session from sessionStorage on page load/refresh
    const savedToken = sessionStorage.getItem('session_token');
    if (savedToken) {
      this.sessionToken = savedToken;
      this.isAuthenticated = true;
    }
  }

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
