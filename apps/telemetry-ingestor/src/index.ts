import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { Kafka } from 'kafkajs';
import { Sender } from '@questdb/nodejs-client';
import cors from '@fastify/cors';
import Fastify from 'fastify';

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const QUESTDB_HOST = process.env.QUESTDB_HOST || 'localhost';
const QUESTDB_PORT = parseInt(process.env.QUESTDB_PORT || '9009', 10);

const kafka = new Kafka({
  clientId: 'telemetry-ingestor',
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: 'telemetry-ingestor-group' });
const sender = new Sender({ host: QUESTDB_HOST, port: QUESTDB_PORT, protocol: 'tcp', protocol_version: '1' });

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: true });

fastify.get('/health', async () => ({ status: 'ok' }));

async function startIngestion() {
  await sender.connect();
  console.log(`[INGESTOR] Connected to QuestDB at ${QUESTDB_HOST}:${QUESTDB_PORT}`);

  await consumer.connect();
  await consumer.subscribe({ topic: 'telemetry.raw', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      
      try {
        const data = JSON.parse(message.value.toString());
        
        sender.table('trades')
          .symbol('run_id', data.benchmarkRunId)
          .symbol('status', data.status)
          .stringColumn('order_id', data.orderId)
          .intColumn('latency_ns', data.latencyNs)
          .at(data.ts); // Timestamp in nanoseconds
          
        await sender.flush();
      } catch (err) {
        console.error('[INGESTOR] Error processing message:', err);
      }
    },
  });
}

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    await fastify.listen({ port, host: '0.0.0.0' });
    
    // Start background ingestion
    startIngestion().catch(err => {
      console.error('[INGESTOR] Fatal Ingestion Error:', err);
      process.exit(1);
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
