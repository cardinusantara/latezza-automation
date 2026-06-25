const TOKEN = 'admin:@Admin123456';
const PROJECT_KEY = 'latezza-ai-agent';
const SONAR_URL = 'http://localhost:9000';

async function checkCoverage() {
  const auth = Buffer.from(TOKEN).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  try {
    const res = await fetch(
      `${SONAR_URL}/api/measures/component_tree?component=${PROJECT_KEY}&metricKeys=coverage,uncovered_lines&ps=500`,
      { headers }
    );
    const data = await res.json();
    if (data.errors) {
      console.error('Error from SonarQube:', data.errors);
      return;
    }

    console.log(JSON.stringify(data, null, 2));
    console.log('File Coverage Report:');
    console.log('=====================');
    const files = data.baseComponent.components || [];
    const fileMeasures = files
      .filter(c => c.qualifier === 'FIL')
      .map(c => {
        const coverageMeasure = (c.measures || []).find(m => m.metric === 'coverage');
        const uncoveredMeasure = (c.measures || []).find(m => m.metric === 'uncovered_lines');
        return {
          key: c.key.replace(`${PROJECT_KEY}:`, ''),
          name: c.name,
          coverage: coverageMeasure ? parseFloat(coverageMeasure.value) : null,
          uncovered: uncoveredMeasure ? parseInt(uncoveredMeasure.value) : 0
        };
      })
      .sort((a, b) => (a.coverage === null ? 1 : 0) - (b.coverage === null ? 1 : 0) || a.coverage - b.coverage);

    fileMeasures.forEach(f => {
      console.log(`${f.key}: ${f.coverage !== null ? f.coverage + '%' : 'N/A'} (${f.uncovered} uncovered lines)`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCoverage();
