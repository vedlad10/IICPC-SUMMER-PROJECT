const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory order store
const orders = new Map();

// Helper to simulate a tiny processing delay (2-8ms)
const applyDelay = () => new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 6));

// 1) GET /health
app.get('/health', (req, res) => {
    // Health check responds quickly without delay
    res.status(200).json({
        ok: true,
        service: "sample-engine",
        timestamp: new Date().toISOString()
    });
});

// 2) POST /orders
app.post('/orders', async (req, res) => {
    await applyDelay();
    const { id, side, price, quantity } = req.body;
    
    // Validation
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "id required and must be string" });
    }
    if (side !== 'BUY' && side !== 'SELL') {
        return res.status(400).json({ error: "side must be BUY or SELL" });
    }
    if (typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ error: "price must be positive number" });
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: "quantity must be positive number" });
    }

    if (orders.has(id)) {
        return res.status(409).json({ error: "Order already exists" });
    }

    const order = {
        id,
        side,
        price,
        quantity,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
    };

    orders.set(id, order);
    
    res.status(201).json({
        ok: true,
        order
    });
});

// 3) POST /cancel
app.post('/cancel', async (req, res) => {
    await applyDelay();
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: "id required" });
    }
    
    const order = orders.get(id);
    if (!order) {
        return res.status(404).json({ error: "Not found" });
    }
    
    if (order.status === 'CANCELLED') {
        return res.status(409).json({ error: "Already cancelled" });
    }
    
    order.status = 'CANCELLED';
    
    res.status(200).json({
        ok: true,
        id,
        status: 'CANCELLED'
    });
});

// 4) GET /orderbook
app.get('/orderbook', async (req, res) => {
    await applyDelay();
    
    const bidsMap = new Map();
    const asksMap = new Map();
    let activeOrders = 0;
    
    for (const order of orders.values()) {
        if (order.status === 'ACTIVE') {
            activeOrders++;
            const map = order.side === 'BUY' ? bidsMap : asksMap;
            const currentQty = map.get(order.price) || 0;
            map.set(order.price, currentQty + order.quantity);
        }
    }
    
    // Bids sorted descending
    const bids = Array.from(bidsMap.entries())
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => b.price - a.price);
        
    // Asks sorted ascending
    const asks = Array.from(asksMap.entries())
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => a.price - b.price);
        
    res.status(200).json({
        ok: true,
        bids,
        asks,
        activeOrders,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Sample engine listening on port ${PORT}`);
});
