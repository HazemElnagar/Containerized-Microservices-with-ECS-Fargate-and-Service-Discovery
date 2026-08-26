const express = require('express');
const AWSXRay = require('aws-xray-sdk');

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


// CodePipeline Test Comment

// Enable AWS X-Ray Express Middleware

app.use(AWSXRay.express.openSegment('NotificationsService'));

app.use(express.json());

// In-Memory Database (Migrated from Monolith)
const db = {
  notifications: []
};

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'notifications',
    timestamp: new Date().toISOString(),
  });
});

// Migrate Notifications Endpoints
app.post('/notifications/send', (req, res) => {
  const { recipient, message, orderId } = req.body;

  const notificationRecord = {
    id: `notif_${Date.now()}`,
    recipient: recipient || 'customer@example.com',
    message: message,
    orderId: orderId,
    timestamp: new Date().toISOString()
  };

  db.notifications.push(notificationRecord);
  console.log(`[Notifications Service] Dispatched alert to ${notificationRecord.recipient}: "${message}" for order ${orderId}`);

  res.status(201).json({
    message: 'Notification sent',
    notification: notificationRecord
  });
});

app.get('/notifications/list', (req, res) => {
  // Normally authenticated. For this demo, just return the list.
  res.status(200).json(db.notifications);
});

// Close AWS X-Ray Express Middleware
app.use(AWSXRay.express.closeSegment());

app.listen(PORT, () => {
  console.log(`[Notifications Service] Listening on port ${PORT}`);
  console.warn('[Notifications Service] WARNING: Using in-memory database storage. All data will be lost on container restart.');
});
