# Reference Monolithic Node.js Application

This folder contains a complete, modular **Node.js Express Monolithic Application** combining three core business domains: **Auth**, **Orders**, and **Notifications**.

Use this monolithic application as your reference starting point to see how a real-world single-process Node.js app is structured, and how to decompose it into three **Amazon ECS Fargate** microservices.

---

## 📁 Monolith Code Structure

```
monolith/
├── package.json                      # Express, bcryptjs, jsonwebtoken
├── README.md                         # Architecture & migration map
└── src/
    ├── app.js                        # Express app setup & route mounting
    ├── server.js                     # Server entrypoint (listening on port 8080)
    ├── middleware/
    │   └── auth.middleware.js        # JWT verification middleware
    ├── routes/
    │   ├── auth.routes.js            # POST /register, POST /login, GET /me
    │   ├── orders.routes.js          # POST /, GET /, GET /:id
    │   └── notifications.routes.js   # GET /, POST /send
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── orders.controller.js
    │   └── notifications.controller.js
    └── services/
        ├── auth.service.js           # Password hashing & in-memory session cache
        ├── orders.service.js         # Order creation & direct call to NotificationsService
        └── notifications.service.js  # Dispatching order alerts
```

---

## 🧐 Monolith Bottlenecks & Microservices Migration Map

| Monolith Feature | Monolith Location | Microservice Target | AWS Migration Plan |
|---|---|---|---|
| **User Authentication & Sessions** | `src/routes/auth.routes.js`<br>`src/services/auth.service.js` | 🔐 **Auth Microservice**<br>([`source/services/auth/`](file:///c:/Users/hazem/source/repos/Containerized-Microservices-with-ECS-Fargate-and-Service-Discovery/source/services/auth/)) | Store sessions in **ElastiCache Redis** (`RedisConstruct`) & inject JWT secrets via **Secrets Manager**. |
| **Order Processing** | `src/routes/orders.routes.js`<br>`src/services/orders.service.js` | 📦 **Orders Microservice**<br>([`source/services/orders/`](file:///c:/Users/hazem/source/repos/Containerized-Microservices-with-ECS-Fargate-and-Service-Discovery/source/services/orders/)) | Deploy on **ECS Fargate**. Make inter-service HTTP calls to Auth/Notifications via **AWS Cloud Map DNS** (`microservices.local`). |
| **Alert Dispatches** | `src/routes/notifications.routes.js`<br>`src/services/notifications.service.js` | 🔔 **Notifications Microservice**<br>([`source/services/notifications/`](file:///c:/Users/hazem/source/repos/Containerized-Microservices-with-ECS-Fargate-and-Service-Discovery/source/services/notifications/)) | Deploy on **ECS Fargate**. Decouple from Order creation pipeline. |

---

## 🏃 Running the Monolith Locally

```bash
cd monolith
npm install
npm start
```

### Test API Commands (cURL)

1. **User Login (Get JWT Token)**:
   ```bash
   curl -X POST http://localhost:8080/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "john_doe", "password": "password123"}'
   ```

2. **Create Order (Uses JWT Token)**:
   ```bash
   curl -X POST http://localhost:8080/api/orders \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -d '{"items": [{"name": "Laptop", "price": 999.99, "quantity": 1}]}'
   ```

3. **Check Dispatched Notifications**:
   ```bash
   curl -X GET http://localhost:8080/api/notifications \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```
