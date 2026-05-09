# Sample Contestant Engine

This is a minimal sample trading engine / order-book service designed for testing and demonstrating the distributed benchmark platform.

## Features
- In-memory order book (no database)
- Top-of-book aggregation
- Simulated processing delay (2-8ms) for realistic benchmarking

## API Endpoints

### 1. GET `/health`
Returns service status.

**Response (200):**
```json
{
  "ok": true,
  "service": "sample-engine",
  "timestamp": "2026-05-09T..."
}
```

### 2. POST `/orders`
Creates a new order.

**Request Body:**
```json
{
  "id": "ord_123",
  "side": "BUY",
  "price": 101,
  "quantity": 5
}
```

**Response (201):**
```json
{
  "ok": true,
  "order": {
    "id": "ord_123",
    "side": "BUY",
    "price": 101,
    "quantity": 5,
    "status": "ACTIVE",
    "createdAt": "2026-05-09T..."
  }
}
```

### 3. POST `/cancel`
Cancels an active order.

**Request Body:**
```json
{
  "id": "ord_123"
}
```

**Response (200):**
```json
{
  "ok": true,
  "id": "ord_123",
  "status": "CANCELLED"
}
```

### 4. GET `/orderbook`
Returns the current aggregated order book.

**Response (200):**
```json
{
  "ok": true,
  "bids": [{ "price": 101, "quantity": 5 }],
  "asks": [],
  "activeOrders": 1,
  "timestamp": "2026-05-09T..."
}
```

## How to Run Locally

```bash
cd sample-engine
npm install
npm start
```

The service will listen on port `3000` (or `process.env.PORT`).

## How to Zip for Submission

To upload this engine to the platform, zip the folder:

```bash
zip -r engine.zip sample-engine
```
