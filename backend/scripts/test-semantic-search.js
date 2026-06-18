require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function test() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: node scripts/test-semantic-search.js "<search query>"');
    process.exit(1);
  }

  console.log(`🔍 Testing semantic product search for query: "${query}"...\n`);
  
  try {
    const results = await db.searchProducts(query);
    console.log(`=== SEARCH RESULTS (${results.length}) ===`);
    if (results.length === 0) {
      console.log('No products found.');
    } else {
      results.forEach((r, i) => {
        const score = r.similarity !== undefined ? `Score: ${r.similarity.toFixed(4)}` : 'Fallback ILIKE match';
        console.log(`[${i+1}] ${r.product_name} - ${score}`);
        console.log(`    Price: Rp ${parseFloat(r.price).toLocaleString('id-ID')}`);
        console.log(`    Description: ${r.description || '[No description]'}`);
        console.log(`    Link: ${r.shopee_link || '-'}\n`);
      });
    }
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

test();
