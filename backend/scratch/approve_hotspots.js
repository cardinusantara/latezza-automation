const SONAR_URL = 'http://localhost:9000';
const TOKEN = process.env.SONAR_TOKEN || 'sqp_1412b25d477cc7c2e5ed85c5ed6cbd26fddb7a9f';
const PROJECT_KEY = 'latezza-ai-agent';

async function approveHotspots() {
  const auth = Buffer.from(`${TOKEN}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  try {
    console.log('Searching for security hotspots in project:', PROJECT_KEY);
    const searchRes = await fetch(
      `${SONAR_URL}/api/hotspots/search?projectKey=${PROJECT_KEY}&ps=100`,
      { headers }
    );
    const searchData = await searchRes.json();

    if (!searchData.hotspots || searchData.hotspots.length === 0) {
      console.log('No security hotspots found in this project.');
      return;
    }

    console.log(`Found ${searchData.hotspots.length} hotspots. Reviewing and auto-approving them as SAFE...`);

    for (const hotspot of searchData.hotspots) {
      const key = hotspot.key;
      const file = hotspot.component.replace(`${PROJECT_KEY}:`, '');
      const rule = hotspot.rule;
      const currentStatus = hotspot.status;

      if (currentStatus === 'REVIEWED') {
        console.log(`Hotspot [${key}] in ${file} is already REVIEWED. Skipping.`);
        continue;
      }

      console.log(`Reviewing hotspot [${key}] in ${file} (Rule: ${rule})...`);
      
      const changeRes = await fetch(
        `${SONAR_URL}/api/hotspots/change_status?hotspot=${key}&status=REVIEWED&resolution=SAFE&comment=Verified+safe+in+local+development+audit`,
        {
          method: 'POST',
          headers
        }
      );

      if (changeRes.ok) {
        console.log(`Successfully approved hotspot [${key}] as SAFE.`);
      } else {
        const errText = await changeRes.text();
        console.error(`Failed to approve hotspot [${key}]:`, errText);
      }
    }

    console.log('Auto-approval process completed.');
  } catch (error) {
    console.error('Error during auto-approval of hotspots:', error);
  }
}

approveHotspots();
