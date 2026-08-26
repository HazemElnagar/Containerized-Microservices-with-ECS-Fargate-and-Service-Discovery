import { Component, Input, OnInit } from '@angular/core';
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
export class OrdersDashboardComponent implements OnInit {
  @Input() token = '';
  orders: Order[] = [];
  isLoading = true;

  // --- Create Order Modal ---
  showModal = false;
  isCreating = false;
  createError = '';
  createSuccess = '';
  newOrder = { item: '', quantity: 1, price: 0 };

  ngOnInit() {
    this.fetchOrders();
  }

  async fetchOrders() {
    try {
      const response = await fetch('/orders/list', {
        headers: { 'Authorization': this.token }
      });
      if (!response.ok) throw new Error('Failed');
      this.orders = await response.json();
      this.isLoading = false;
    } catch (err) {
      // Mock data if backend is not available yet
      console.warn('Backend unavailable, loading mock orders.');
      setTimeout(() => {
        this.orders = [
          { id: 'ORD-1001', item: 'Wireless Noise-Cancelling Headphones', quantity: 1, totalPrice: 149.99, status: 'Delivered', date: '2025-07-10' },
          { id: 'ORD-1002', item: 'Mechanical Keyboard', quantity: 1, totalPrice: 89.99, status: 'Delivered', date: '2025-07-22' },
          { id: 'ORD-1003', item: 'USB-C Hub (7-in-1)', quantity: 2, totalPrice: 59.98, status: 'Shipped', date: '2025-08-05' },
        ];
        this.isLoading = false;
      }, 800);
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
    try {
      const response = await fetch('/orders', {
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
        }),
      });
      if (!response.ok) throw new Error('Order failed');
      const result = await response.json();
      this.createSuccess = `✅ Order ${result.order.id} placed! A notification has been sent.`;
      this.orders.unshift(result.order); // prepend to top of list immediately
    } catch (err) {
      this.createError = '❌ Could not place order. Please try again.';
    } finally {
      this.isCreating = false;
    }
  }
}
