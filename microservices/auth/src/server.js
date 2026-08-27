const express = require('express');
const AWSXRay = require('aws-xray-sdk');
const Redis = require('ioredis');
const bcrypt = require('bcryptjs');

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
app.use(AWSXRay.express.openSegment('AuthService'));

app.use(express.json());

// In-Memory Database (Migrated from Monolith)
const db = {
  users: [
    {
      id: 'usr-1',
      username: 'john_doe',
      // Seed pre-hashed password for 'password123'
      password: bcrypt.hashSync('password123', 10),
      email: 'john@example.com'
    }
  ]
};

// Initialize ElastiCache Redis Client (with TLS for transit encryption)
let redis;
if (process.env.REDIS_HOST) {
  redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    tls: {},            // Enable TLS for ElastiCache transit encryption
    lazyConnect: true,
  });
  redis.on('error', (err) => console.error('[Redis Error]', err));
}

// Health Check Endpoint (used by ALB Target Group & ECS)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'auth',
    timestamp: new Date().toISOString(),
  });
});

// Migrate Auth Endpoints
app.post('/auth/login', async (req, res) => {
  // Support both username (old monolith) and email (new frontend)
  const { username, email, password } = req.body;
  
  const user = db.users.find(u => 
    (u.username === username || u.email === email)
  );

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  // Cache session in Redis if available
  if (redis) {
    try {
      await redis.set(`session:${token}`, JSON.stringify(user), 'EX', 3600);
      console.log(`[Auth Service] Session ${token} saved to Redis for ${user.username}`);
    } catch (e) {
      console.warn('[Redis] Unable to store session:', e.message);
    }
  } else {
    console.warn('[Auth Service] Redis not connected. Operating without session persistence.');
  }

  res.status(200).json({
    message: 'Login successful',
    token: token,
    user: { id: user.id, username: user.username, email: user.email }
  });
});

app.get('/auth/session/:token', async (req, res) => {
  const { token } = req.params;

  if (redis) {
    try {
      const data = await redis.get(`session:${token}`);
      if (data) {
        return res.status(200).json(JSON.parse(data));
      }
    } catch (e) {
      console.warn('[Redis] Read error:', e.message);
    }
  }

  res.status(404).json({ error: 'Session not found or Redis unavailable' });
});

app.get('/auth/me', async (req, res) => {
  const token = req.headers['authorization'] || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  if (redis) {
    try {
      const data = await redis.get(`session:${token}`);
      if (data) {
        const user = JSON.parse(data);
        return res.status(200).json({ user });
      }
    } catch (e) {
      console.warn('[Redis] Read error:', e.message);
    }
  }

  res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
});


// CodePipeline Test Comment







// Close AWS X-Ray Express Middleware

app.use(AWSXRay.express.closeSegment());

app.listen(PORT, () => {
  console.log(`[Auth Service] Listening on port ${PORT}`);
  console.warn('[Auth Service] WARNING: Using in-memory user database. All data will be lost on container restart.');
});
