const http = require('http');

const query = 'SELECT * FROM trades LIMIT 10;';
const encodedQuery = encodeURIComponent(query);
const url = `http://localhost:9003/exec?query=${encodedQuery}`;

console.log('[VERIFY] Querying QuestDB...');

http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.dataset && json.dataset.length > 0) {
        console.log('[SUCCESS] Found rows in QuestDB:');
        console.table(json.dataset.map(row => {
            const entry = {};
            json.columns.forEach((col, i) => entry[col.name] = row[i]);
            return entry;
        }));
      } else {
        console.log('[EMPTY] QuestDB "trades" table exists but is empty or does not exist yet.');
      }
    } catch (e) {
      console.error('[ERROR] Failed to parse QuestDB response:', e.message);
      console.log('Raw response:', data);
    }
  });
}).on('error', (err) => {
  console.error('[ERROR] QuestDB connection failed:', err.message);
});
