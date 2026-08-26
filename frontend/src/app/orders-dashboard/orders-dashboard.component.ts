import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Order {
  id: string;
  item: string;
  quantity: number;
  totalPrice: number;
  status: string;
  date: string;
}

@Component({
  selector: 'app-orders-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders-dashboard.component.html',
  styleUrl: './orders-dashboard.component.css',
})
export class OrdersDashboardComponent implements OnInit, OnChanges {
  @Input() token = '';
  @Output() orderCreated = new EventEmitter<void>();
  orders: Order[] = [];
  isLoading = true;
  fetchError = '';

  // --- Create Order Modal ---
  showModal = false;
  isCreating = false;
  createError = '';
  createSuccess = '';
  newOrder = { item: '', quantity: 1, price: 0 };

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    if (this.token) {
      this.fetchOrders();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['token'] && this.token && !changes['token'].isFirstChange()) {
      this.fetchOrders();
    }
  }

  async fetchOrders() {
    this.isLoading = true;
    this.fetchError = '';
    this.cdr.detectChanges();
    try {
      const response = await fetch('/orders/list', {
        headers: { 'Authorization': this.token }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load orders (${response.status})`);
      }
      this.orders = await response.json();
    } catch (err: any) {
      this.fetchError = err.message || 'Failed to load orders.';
      console.error('[Orders] Fetch error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  openModal() {
    this.showModal = true;
    this.createError = '';
    this.createSuccess = '';
    this.newOrder = { item: '', quantity: 1, price: 0 };
  }

  closeModal() {
    this.showModal = false;
  }

  async createOrder() {
    if (!this.newOrder.item || this.newOrder.price <= 0) {
      this.createError = 'Please fill in all fields with valid values.';
      return;
    }
    this.isCreating = true;
    this.createError = '';
    this.createSuccess = '';
    this.cdr.detectChanges();
    try {
      const response = await fetch('/orders/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token,
        },
        body: JSON.stringify({
          authToken: this.token,
          item: this.newOrder.item,
          quantity: this.newOrder.quantity,
          price: this.newOrder.price,
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Could not place order (${response.status})`);
      }
      const result = await response.json();
      this.createSuccess = `✅ Order ${result.order.id} placed! A notification has been sent.`;
      this.orders.unshift(result.order);
      this.orderCreated.emit();
    } catch (err: any) {
      this.createError = err.message || '❌ Could not place order. Please try again.';
      console.error('[Orders] Create error:', err);
    } finally {
      this.isCreating = false;
      this.cdr.detectChanges();
    }
  }
}
