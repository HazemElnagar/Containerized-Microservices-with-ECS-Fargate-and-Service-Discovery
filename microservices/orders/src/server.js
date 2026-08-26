const express = require('express');
const AWSXRay = require('aws-xray-sdk');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple CORS middleware to allow cross-origin requests from the frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Enable AWS X-Ray Express Middleware
app.use(AWSXRay.express.openSegment('OrdersService'));

app.use(express.json());

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth.microservices.local:3000';
const NOTIFICATIONS_SERVICE_URL = process.env.NOTIFICATIONS_SERVICE_URL || 'http://notifications.microservices.local:3000';

// In-Memory Database (Migrated from Monolith)
// Pre-seeded demo orders for the default user (id: 'usr-1', john@example.com)
const db = {
  orders: [
    {
      id: 'ORD-1001',
      userId: 'usr-1',
      item: 'Wireless Noise-Cancelling Headphones',
      quantity: 1,
      totalPrice: 149.99,
      status: 'Delivered',
      date: '2025-07-10',
      createdAt: '2025-07-10T09:15:00.000Z',
    },
    {
      id: 'ORD-1002',
      userId: 'usr-1',
      item: 'Mechanical Keyboard',
      quantity: 1,
      totalPrice: 89.99,
      status: 'Delivered',
      date: '2025-07-22',
      createdAt: '2025-07-22T14:30:00.000Z',
    },
    {
      id: 'ORD-1003',
      userId: 'usr-1',
      item: 'USB-C Hub (7-in-1)',
      quantity: 2,
      totalPrice: 59.98,
      status: 'Shipped',
      date: '2025-08-05',
      createdAt: '2025-08-05T11:00:00.000Z',
    },
    {
      id: 'ORD-1004',
      userId: 'usr-1',
      item: 'Ergonomic Mouse Pad',
      quantity: 1,
      totalPrice: 24.99,
      status: 'Processing',
      date: '2025-08-20',
      createdAt: '2025-08-20T16:45:00.000Z',
    },
    {
      id: 'ORD-1005',
      userId: 'usr-1',
      item: '4K Webcam',
      quantity: 1,
      totalPrice: 119.99,
      status: 'Processing',
      date: '2025-08-25',
      createdAt: '2025-08-25T08:00:00.000Z',
    },
  ],
};

// Middleware: Authenticate via Auth Service (Cloud Map)
async function authenticateSession(req, res, next) {
  const token = req.headers['authorization'] || req.query.token || (req.body && req.body.authToken);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  try {
    const authRes = await axios.get(`${AUTH_SERVICE_URL}/auth/session/${token}`, { timeout: 3000 });
    req.user = authRes.data;
    next();
  } catch (err) {
    console.error('[Orders] Auth verification error:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
  }
}

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'orders',
    timestamp: new Date().toISOString(),
  });
});

// Migrate Orders Endpoints
app.post('/orders', authenticateSession, async (req, res) => {
  const { item, quantity, price } = req.body;
  const user = req.user;

  const newOrder = {
    id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
    userId: user.id,
    item: item || 'Premium Widget',
    quantity: quantity || 1,
    totalPrice: (quantity || 1) * (price || 29.99),
    status: 'Processing',
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  };

  db.orders.push(newOrder);
  console.log(`[Orders Service] Order ${newOrder.id} created by user ${user.username}`);

  // Inter-Service Communication via Cloud Map DNS: Trigger Notification Service
  try {
    await axios.post(`${NOTIFICATIONS_SERVICE_URL}/notifications/send`, {
      orderId: newOrder.id,
      recipient: user.email,
      message: `Your order for ${newOrder.quantity}x ${newOrder.item} (Total: $${newOrder.totalPrice}) has been placed successfully!`,
    }, { timeout: 3000 });
  } catch (err) {
    console.warn('[Orders] Notification dispatch warning:', err.message);
  }

  res.status(201).json({
    message: 'Order created',
    order: newOrder
  });
});

app.get('/orders/list', authenticateSession, (req, res) => {
  const userOrders = db.orders.filter(o => o.userId === req.user.id);
  res.json(userOrders);
});

app.get('/orders/:id', authenticateSession, (req, res) => {
  const { id } = req.params;
  const order = db.orders.find(o => o.id === id && o.userId === req.user.id);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  res.status(200).json(order);
});

// Close AWS X-Ray Express Middleware
app.use(AWSXRay.express.closeSegment());

app.listen(PORT, () => {
  console.log(`[Orders Service] Listening on port ${PORT}`);
  console.warn('[Orders Service] WARNING: Using in-memory database storage. All data will be lost on container restart.');
});
