const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'fardhan123',
  database: process.env.DB_NAME || 'latezzacake',
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT * FROM chat_histories ORDER BY timestamp DESC LIMIT 20');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
