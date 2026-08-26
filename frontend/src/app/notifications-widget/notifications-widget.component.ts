import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Notification {
  id: string;
  recipient: string;
  message: string;
  orderId: string;
  timestamp: string;
}

@Component({
  selector: 'app-notifications-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-widget.component.html',
  styleUrl: './notifications-widget.component.css'
})
export class NotificationsWidgetComponent implements OnInit, OnDestroy, OnChanges {
  @Input() token = '';

  notifications: Notification[] = [];
  isOpen = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.fetchNotifications();
    // Poll the real backend every 10 seconds so new order notifications appear automatically
    this.pollInterval = setInterval(() => this.fetchNotifications(), 10000);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['token'] && this.token && !changes['token'].isFirstChange()) {
      this.fetchNotifications();
    }
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  toggle() {
    this.isOpen = !this.isOpen;
    // Mark as seen when opened
    if (this.isOpen) this.seenCount = this.notifications.length;
  }

  seenCount = 0;

  get unreadCount(): number {
    return Math.max(0, this.notifications.length - this.seenCount);
  }

  async fetchNotifications() {
    try {
      const response = await fetch('/notifications/list');
      if (response.ok) {
        this.notifications = await response.json();
      }
    } catch (err: any) {
      console.error('[Notifications] Fetch error:', err.message);
    } finally {
      this.cdr.detectChanges();
    }
  }

  formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
