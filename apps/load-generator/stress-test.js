const net = require('net');

const client = new net.Socket();
const PORT = 9000;
const HOST = '127.0.0.1';
const TARGET_ORDERS = 100000;

client.connect(PORT, HOST, () => {
  console.log(`[CLIENT] Connected to Engine at ${HOST}:${PORT}`);
  
  let sentCount = 0;
  let receivedCount = 0;
  const startTime = Date.now();

  function sendNext() {
    while (sentCount < TARGET_ORDERS) {
      const order = {
        orderId: `ord-${sentCount}`,
        userId: 'tester-1',
        side: sentCount % 2 === 0 ? 'BUY' : 'SELL',
        type: 'LIMIT',
        price: 100 + (sentCount % 10),
        quantity: 10,
        timestamp: Date.now() * 1000000
      };

      const payload = JSON.stringify(order) + '\n';
      
      // Check if the buffer is full
      if (!client.write(payload)) {
        // Wait for 'drain' event to continue
        return;
      }
      
      sentCount++;
    }
  }

  client.on('drain', () => {
    sendNext();
  });

  client.on('data', (data) => {
    // Simple way to count responses (newlines)
    const lines = data.toString().split('\n').length - 1;
    receivedCount += lines;
    
    if (receivedCount >= TARGET_ORDERS) {
      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n[RESULT] Completed stress test:`);
      console.log(`- Total Orders: ${TARGET_ORDERS}`);
      console.log(`- Duration: ${duration.toFixed(2)}s`);
      console.log(`- Throughput: ${(TARGET_ORDERS / duration).toFixed(0)} orders/sec`);
      client.destroy();
    }
  });

  sendNext();
});

client.on('error', (err) => {
  console.error('[CLIENT] Error:', err.message);
});

client.on('close', () => {
  console.log('[CLIENT] Connection closed');
});
