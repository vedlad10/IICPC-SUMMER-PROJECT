import net from 'net';
import { Kafka, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const kafka = new Kafka({
  clientId: 'load-generator',
  brokers: [KAFKA_BROKER],
});

let producer: Producer;

export async function initTelemetry() {
  producer = kafka.producer();
  await producer.connect();
  console.log('[BOT] Telemetry Producer connected to Redpanda');
}

export interface BotConfig {
  engineHost: string;
  enginePort: number;
  benchmarkRunId: string;
  orderCount: number;
}

export async function runBenchmark(config: BotConfig) {
  const { engineHost, enginePort, benchmarkRunId, orderCount } = config;
  
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const pendingOrders = new Map<string, number>(); // orderId -> sendTimeNs
    
    client.connect(enginePort, engineHost, async () => {
      console.log(`[BOT] Connected to Engine at ${engineHost}:${enginePort}`);
      
      for (let i = 0; i < orderCount; i++) {
        const orderId = `ord-${uuidv4().slice(0, 8)}`;
        const sendTimeNs = Date.now() * 1000000;
        
        const order = {
          orderId,
          userId: 'bot-1',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          type: 'LIMIT',
          price: 100 + (i % 10),
          quantity: 10,
          timestamp: sendTimeNs
        };

        pendingOrders.set(orderId, sendTimeNs);
        client.write(JSON.stringify(order) + '\n');
        
        // Small delay to avoid saturating Node.js event loop in one tick
        if (i % 100 === 0) await new Promise(r => setImmediate(r));
      }
    });

    client.on('data', async (data) => {
      const lines = data.toString().split('\n');
      const recvTimeNs = Date.now() * 1000000;
      
      const events = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const resp = JSON.parse(line);
          const sendTimeNs = pendingOrders.get(resp.orderId);
          
          if (sendTimeNs) {
            const latencyNs = recvTimeNs - sendTimeNs;
            events.push({
              key: resp.orderId,
              value: JSON.stringify({
                benchmarkRunId,
                orderId: resp.orderId,
                status: resp.status,
                latencyNs,
                ts: recvTimeNs
              })
            });
            pendingOrders.delete(resp.orderId);
          }
        } catch (e) {}
      }

      if (events.length > 0) {
        await producer.send({
          topic: 'telemetry.raw',
          messages: events,
        });
      }

      if (pendingOrders.size === 0 && receivedAll(orderCount)) {
        client.destroy();
        resolve(true);
      }
    });

    let totalReceived = 0;
    function receivedAll(target: number) {
        // Simple counter logic could be added here
        return false; // For now, we rely on the loop or a timeout
    }

    client.on('error', (err) => {
      console.error('[BOT] Socket Error:', err.message);
      reject(err);
    });

    // Cleanup timeout
    setTimeout(() => {
        client.destroy();
        resolve(true);
    }, 30000);
  });
}
