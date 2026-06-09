const http = require('http');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("=== Senshi Scraper API Local Validation ===");
  try {
    // 1. Root Endpoint
    console.log("\nTesting GET /");
    const root = await getJSON("http://localhost:8787/");
    console.log(`Status: ${root.status}`);
    console.log(`Payload:`, JSON.stringify(root.data, null, 2));

    // 2. Trending
    console.log("\nTesting GET /api/trending");
    const trending = await getJSON("http://localhost:8787/api/trending");
    console.log(`Status: ${trending.status}`);
    console.log(`Data count:`, trending.data?.data?.length);

    // 3. Schedule
    console.log("\nTesting GET /api/schedule");
    const schedule = await getJSON("http://localhost:8787/api/schedule");
    console.log(`Status: ${schedule.status}`);
    console.log(`Data sample keys:`, Object.keys(schedule.data?.data || {}));

    // 4. Anime Details (Jujutsu Kaisen)
    console.log("\nTesting GET /api/anime/d096i");
    const details = await getJSON("http://localhost:8787/api/anime/d096i");
    console.log(`Status: ${details.status}`);
    console.log(`Title:`, details.data?.data?.title);

    // 5. Episode list
    console.log("\nTesting GET /api/anime/57658/episodes");
    const episodes = await getJSON("http://localhost:8787/api/anime/57658/episodes");
    console.log(`Status: ${episodes.status}`);
    console.log(`Episode count:`, episodes.data?.data?.length);

    // 6. Streams resolver
    console.log("\nTesting GET /api/anime/57658/episodes/1/streams");
    const streams = await getJSON("http://localhost:8787/api/anime/57658/episodes/1/streams");
    console.log(`Status: ${streams.status}`);
    console.log(`Streams resolved:`, JSON.stringify(streams.data?.data, null, 2));

  } catch (err) {
    console.error("Local Validation Error:", err.message);
  }
}

// Give a short delay to let dev server spin up if running concurrently
setTimeout(run, 3000);
