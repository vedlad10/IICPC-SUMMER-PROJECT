const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory order store: keyed by the canonical orderId
const orders = new Map();

const applyDelay = () => new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 6));

// 1) GET /health
app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        service: 'sample-engine',
        timestamp: new Date().toISOString()
    });
});

// 2) POST /orders
app.post('/orders', async (req, res) => {
    await applyDelay();
    const body = req.body || {};

    // Accept both 'id' and 'clientOrderId' as the order identifier
    const id = body.id || body.clientOrderId;
    // Accept both uppercase and lowercase side
    const rawSide = body.side;
    const side = typeof rawSide === 'string' ? rawSide.toUpperCase() : undefined;
    const price = body.price;
    const quantity = body.quantity;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ ok: false, error: 'id or clientOrderId required' });
    }
    if (side !== 'BUY' && side !== 'SELL') {
        return res.status(400).json({ ok: false, error: 'side must be BUY or SELL (or buy/sell)' });
    }
    if (typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ ok: false, error: 'price must be a positive number' });
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ ok: false, error: 'quantity must be a positive number' });
    }

    if (orders.has(id)) {
        return res.status(409).json({ ok: false, error: 'Order already exists' });
    }

    const order = {
        id,
        side,
        price,
        quantity,
        symbol: body.symbol || 'BTC-USD',
        type: body.type || 'limit',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
    };

    orders.set(id, order);
    res.status(201).json({ ok: true, order });
});

// 3) POST /cancel
app.post('/cancel', async (req, res) => {
    await applyDelay();
    const body = req.body || {};

    // Accept 'id' or 'orderId'
    const id = body.id || body.orderId;

    if (!id) {
        return res.status(400).json({ ok: false, error: 'id or orderId required' });
    }

    const order = orders.get(id);
    if (!order) {
        return res.status(404).json({ ok: false, error: 'Not found' });
    }
    if (order.status === 'CANCELLED') {
        return res.status(409).json({ ok: false, error: 'Already cancelled' });
    }

    order.status = 'CANCELLED';
    res.status(200).json({ ok: true, id, status: 'CANCELLED' });
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
            map.set(order.price, (map.get(order.price) || 0) + order.quantity);
        }
    }

    const bids = Array.from(bidsMap.entries())
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => b.price - a.price);

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
