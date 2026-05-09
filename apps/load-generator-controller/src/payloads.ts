/**
 * Deterministic request payload generators.
 *
 * Produces realistic order-book payloads using the seeded RNG.
 * Same seed + sequence = same payloads.
 */

export interface OrderPayload {
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  symbol: string;
  type: 'limit' | 'market';
  clientOrderId: string;
}

export interface CancelPayload {
  orderId: string;
}

const SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];
const SIDES: Array<'buy' | 'sell'> = ['buy', 'sell'];
const TYPES: Array<'limit' | 'market'> = ['limit', 'market'];

/**
 * Generate a create_order payload deterministically.
 */
export function generateOrderPayload(rng: () => number, seq: number): OrderPayload {
  const symbolIdx = Math.floor(rng() * SYMBOLS.length);
  const sideIdx = Math.floor(rng() * SIDES.length);
  const typeIdx = Math.floor(rng() * TYPES.length);
  const basePrice = 100 + Math.floor(rng() * 9900);          // 100–9999
  const price = basePrice + Math.floor(rng() * 100) / 100;   // add cents
  const quantity = 1 + Math.floor(rng() * 100);               // 1–100

  return {
    side: SIDES[sideIdx],
    price: Math.round(price * 100) / 100,
    quantity,
    symbol: SYMBOLS[symbolIdx],
    type: TYPES[typeIdx],
    clientOrderId: `order-${seq}-${Math.floor(rng() * 1e8)}`
  };
}

/**
 * Generate a cancel payload using a synthetic orderId.
 */
export function generateCancelPayload(rng: () => number, seq: number): CancelPayload {
  return {
    orderId: `order-${Math.floor(rng() * seq + 1)}-${Math.floor(rng() * 1e8)}`
  };
}

// ── Flash-crash specific payload generators ─────────────────────────────

/**
 * Generate a large aggressive sell order for flash-crash burst phases.
 *
 * Characteristics vs normal orders:
 *   - side is always 'sell'
 *   - quantity is 5–10x larger (500–1000 vs 1–100)
 *   - price is aggressively discounted (10–30% below normal range)
 *   - always 'limit' type to stress orderbook depth
 *
 * Deterministic: same rng state + seq = same payload.
 */
export function generateFlashCrashSellPayload(rng: () => number, seq: number): OrderPayload {
  const symbolIdx = Math.floor(rng() * SYMBOLS.length);
  const basePrice = 100 + Math.floor(rng() * 9900);
  // Aggressive discount: 10–30% below base price
  const discount = 0.7 + rng() * 0.2;                        // 0.70–0.90
  const price = Math.round(basePrice * discount * 100) / 100;
  // Large quantity: 500–1000 units (5–10x normal)
  const quantity = 500 + Math.floor(rng() * 501);

  return {
    side: 'sell',
    price,
    quantity,
    symbol: SYMBOLS[symbolIdx],
    type: 'limit',
    clientOrderId: `crash-sell-${seq}-${Math.floor(rng() * 1e8)}`
  };
}
