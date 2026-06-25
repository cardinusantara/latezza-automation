const fs = require('fs');
const path = require('path');

const SONAR_URL = 'http://localhost:9000';
const TOKEN = process.env.SONAR_TOKEN || 'sqp_1412b25d477cc7c2e5ed85c5ed6cbd26fddb7a9f';
const PROJECT_KEY = 'latezza-ai-agent';

async function fetchSonarData() {
  const auth = Buffer.from(`${TOKEN}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  try {
    console.log('Fetching project measures...');
    const measuresRes = await fetch(
      `${SONAR_URL}/api/measures/component?component=${PROJECT_KEY}&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,security_hotspots,sqale_index,reliability_rating,security_rating,sqale_rating`,
      { headers }
    );
    const measuresData = await measuresRes.json();

    console.log('Fetching project issues...');
    const issuesRes = await fetch(
      `${SONAR_URL}/api/issues/search?componentKeys=${PROJECT_KEY}&ps=500&resolved=false`,
      { headers }
    );
    const issuesData = await issuesRes.json();

    return { measuresData, issuesData };
  } catch (error) {
    console.error('Error fetching from SonarQube:', error);
    throw error;
  }
}

function generateReport(data) {
  const { measuresData, issuesData } = data;

  if (measuresData.errors || issuesData.errors) {
    console.error('SonarQube returned errors:', measuresData.errors || issuesData.errors);
    return;
  }

  const component = measuresData.component || {};
  const measures = component.measures || [];
  
  const metricMap = {};
  measures.forEach(m => {
    metricMap[m.metric] = m.value;
  });

  const issues = issuesData.issues || [];
  
  // Categorize issues
  const severityCount = { INFO: 0, MINOR: 0, MAJOR: 0, CRITICAL: 0, BLOCKER: 0 };
  const typeCount = { CODE_SMELL: 0, BUG: 0, VULNERABILITY: 0 };
  const fileIssues = {};

  issues.forEach(issue => {
    severityCount[issue.severity] = (severityCount[issue.severity] || 0) + 1;
    typeCount[issue.type] = (typeCount[issue.type] || 0) + 1;
    
    const file = issue.component.replace(`${PROJECT_KEY}:`, '');
    if (!fileIssues[file]) {
      fileIssues[file] = [];
    }
    fileIssues[file].push(issue);
  });

  // Sort files by issue count (descending)
  const sortedFiles = Object.keys(fileIssues).sort((a, b) => fileIssues[b].length - fileIssues[a].length);

  let md = `# SonarQube Analysis Report for **${component.name || PROJECT_KEY}**\n\n`;
  md += `Generated on: ${new Date().toLocaleString()}\n\n`;

  md += `## 📊 Key Metrics Summary\n\n`;
  md += `| Metric | Value | Rating / Description |\n`;
  md += `|---|---|---|\n`;
  md += `| **Bugs** | ${metricMap['bugs'] || 0} | Rating: ${getRatingLabel(metricMap['reliability_rating'])} |\n`;
  md += `| **Vulnerabilities** | ${metricMap['vulnerabilities'] || 0} | Rating: ${getRatingLabel(metricMap['security_rating'])} |\n`;
  md += `| **Security Hotspots** | ${metricMap['security_hotspots'] || 0} | Potential security risks |\n`;
  md += `| **Code Smells** | ${metricMap['code_smells'] || 0} | Rating: ${getRatingLabel(metricMap['sqale_rating'])} |\n`;
  md += `| **Technical Debt** | ${metricMap['sqale_index'] ? Math.round(metricMap['sqale_index'] / 60) + ' hours' : '0 hours'} | Time to fix all code smells |\n`;
  md += `| **Coverage** | ${metricMap['coverage'] ? metricMap['coverage'] + '%' : 'N/A'} | Unit test coverage |\n`;
  md += `| **Duplicated Lines** | ${metricMap['duplicated_lines_density'] ? metricMap['duplicated_lines_density'] + '%' : '0%'} | Code duplication density |\n\n`;

  md += `## ⚠️ Issues Overview\n\n`;
  md += `### By Severity\n`;
  md += `- **Blocker**: ${severityCount.BLOCKER}\n`;
  md += `- **Critical**: ${severityCount.CRITICAL}\n`;
  md += `- **Major**: ${severityCount.MAJOR}\n`;
  md += `- **Minor**: ${severityCount.MINOR}\n`;
  md += `- **Info**: ${severityCount.INFO}\n\n`;

  md += `### By Type\n`;
  md += `- **Bugs**: ${typeCount.BUG || 0}\n`;
  md += `- **Vulnerabilities**: ${typeCount.VULNERABILITY || 0}\n`;
  md += `- **Code Smells**: ${typeCount.CODE_SMELL || 0}\n\n`;

  md += `## 📂 Top Affected Files\n\n`;
  sortedFiles.slice(0, 10).forEach(file => {
    md += `### 📄 \`${file}\` (${fileIssues[file].length} issues)\n`;
    fileIssues[file].forEach(issue => {
      const lineStr = issue.line ? `L${issue.line}` : 'Global';
      md += `- [${issue.severity}] **${issue.type}** at ${lineStr}: ${issue.message} (\`${issue.rule}\`)\n`;
    });
    md += `\n`;
  });

  if (sortedFiles.length > 10) {
    md += `*And ${sortedFiles.length - 10} more files with issues.*\n\n`;
  }

  // Also write the raw JSON for the user if they need it
  fs.writeFileSync(path.join(__dirname, '..', 'laporan_sonar.json'), JSON.stringify({
    metrics: metricMap,
    issues_summary: {
      severity: severityCount,
      type: typeCount
    },
    issues: issues.map(i => ({
      key: i.key,
      rule: i.rule,
      severity: i.severity,
      type: i.type,
      component: i.component.replace(`${PROJECT_KEY}:`, ''),
      line: i.line,
      message: i.message,
      debt: i.debt
    }))
  }, null, 2));

  fs.writeFileSync(path.join(__dirname, '..', 'laporan_sonar.md'), md);
  console.log('Report successfully generated at backend/laporan_sonar.md and backend/laporan_sonar.json');
}

function getRatingLabel(rating) {
  if (!rating) return 'N/A';
  const val = parseFloat(rating);
  if (val <= 1) return 'A (Excellent)';
  if (val <= 2) return 'B (Good)';
  if (val <= 3) return 'C (Fair)';
  if (val <= 4) return 'D (Poor)';
  return 'E (Very Poor)';
}

fetchSonarData().then(generateReport).catch(err => {
  console.error('Failed to run:', err);
  process.exit(1);
});
