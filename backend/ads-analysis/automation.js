require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Fetch Meta Ads insights for a specific date range (since/until)
 */
async function fetchMetaInsightsRange(accessToken, adAccountId, since, until) {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'ad_id,ad_name,spend,impressions,reach,actions,cost_per_action_type,adset_name,campaign_name,quality_ranking,engagement_rate_ranking';
  const timeRange = JSON.stringify({ since, until });
  const metaUrl = `https://graph.facebook.com/v19.0/${actId}/insights?level=ad&time_range=${encodeURIComponent(timeRange)}&fields=${fields}&access_token=${accessToken}`;
  
  console.log(`Fetching Meta Ads data for range [${since} → ${until}]...`);
  const res = await fetch(metaUrl);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta API error for range ${since}–${until} (${res.status}): ${errText}`);
  }
  const json = await res.json();
  return json.data || [];
}

/**
 * Normalize Meta API insights structure into the unified schema
 */
function normalizeMetaInsights(apiData) {
  const mapRanking = (val) => {
    if (!val) return '-';
    const clean = val.toUpperCase();
    if (clean.includes('ABOVE')) return 'Di atas rata-rata';
    if (clean === 'AVERAGE') return 'Rata-rata';
    if (clean.includes('BELOW')) return 'Di bawah rata-rata';
    return val;
  };

  return apiData.map(item => {
    const spend = Number.parseFloat(item.spend) || 0;
    const impressions = Number.parseInt(item.impressions) || 0;
    const reach = Number.parseInt(item.reach) || 0;
    
    let results = 0;
    let newContacts = 0;
    
    if (item.actions && Array.isArray(item.actions)) {
      const msgAction = item.actions.find(a => 
        a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
        a.action_type === 'messaging_first_reply'
      );
      
      const purchaseAction = item.actions.find(a => 
        a.action_type === 'purchase' || 
        a.action_type === 'lead' ||
        a.action_type === 'onsite_conversion.lead_group'
      );
      
      const linkClickAction = item.actions.find(a => a.action_type === 'link_click');
      
      if (msgAction) {
        results = Number.parseInt(msgAction.value) || 0;
        newContacts = results;
      } else if (purchaseAction) {
        results = Number.parseInt(purchaseAction.value) || 0;
      } else if (linkClickAction) {
        results = Number.parseInt(linkClickAction.value) || 0;
      } else {
        const totalActions = item.actions.reduce((sum, a) => sum + (Number.parseInt(a.value) || 0), 0);
        results = totalActions;
      }
    }
    
    const cpr = results > 0 ? spend / results : 0;
    
    return {
      id: item.ad_id,
      name: item.ad_name || 'Unnamed Ad',
      status: 'active',
      spend: spend,
      impressions: impressions,
      reach: reach,
      results: results,
      cpr: cpr,
      newContacts: newContacts,
      quality: mapRanking(item.quality_ranking),
      engagement: mapRanking(item.engagement_rate_ranking),
      adset: item.adset_name || '-'
    };
  });
}

/**
 * Robust CSV Line Splitter (handles quotes, commas, and escapes)
 */
function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Flexible CSV Parser
 */
function parseCSV(csvText, dateFromStr = null, dateToStr = null) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  const headers = splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  
  // Dynamic column mapping based on keywords
  const indexMap = {
    startDate: headers.findIndex(h => h.includes('awal') || h.includes('start') || h.includes('mulai')),
    endDate: headers.findIndex(h => h.includes('akhir') || h.includes('end') || h.includes('selesai')),
    adName: headers.findIndex(h => h.includes('nama iklan') || h.includes('ad name') || h.includes('iklan')),
    status: headers.findIndex(h => h.includes('penayangan') || h.includes('status') || h.includes('delivery')),
    results: headers.findIndex(h => h.includes('hasil') || h.includes('result') || h.includes('conversions') || h.includes('conversion')),
    spend: headers.findIndex(h => h.includes('dibelanjakan') || h.includes('spend') || h.includes('belanja') || h.includes('amount spent')),
    impressions: headers.findIndex(h => h === 'impresi' || h === 'impressions' || h.includes('impresi') || h.includes('impression')),
    reach: headers.findIndex(h => h.includes('jangkauan') || h.includes('reach')),
    cpr: headers.findIndex(h => h.includes('biaya per hasil') || h.includes('cost per result') || h.includes('cpr')),
    newContacts: headers.findIndex(h => h.includes('baru') || h.includes('new messaging') || h.includes('kontak baru')),
    quality: headers.findIndex(h => h.includes('kualitas') || h.includes('quality')),
    engagement: headers.findIndex(h => h.includes('interaksi') || h.includes('engagement')),
    adset: headers.findIndex(h => h === 'nama set iklan' || h === 'adset name' || h === 'ad set name' || h.includes('nama set iklan') || h.includes('adset name') || h.includes('ad set name') || h === 'adset' || h === 'ad set')
  };

  const ads = [];
  const targetFrom = dateFromStr ? new Date(dateFromStr) : null;
  const targetTo = dateToStr ? new Date(dateToStr) : null;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, '').trim());
    if (cells.length < headers.length || !cells[0]) continue;
    
    const getValue = (key, defaultVal) => {
      const idx = indexMap[key];
      return idx !== -1 && cells[idx] !== undefined && cells[idx] !== '' ? cells[idx] : defaultVal;
    };
    
    const getNumValue = (key, defaultVal) => {
      const val = getValue(key, null);
      if (val === null) return defaultVal;
      const cleanNum = Number.parseFloat(val.replace(/[^0-9.-]/g, ''));
      return Number.isNaN(cleanNum) ? defaultVal : cleanNum;
    };
    
    let spend = getNumValue('spend', 0);
    let impressions = getNumValue('impressions', 0);
    let reach = getNumValue('reach', 0);
    let results = getNumValue('results', 0);
    let newContacts = getNumValue('newContacts', 0);

    const startDateVal = getValue('startDate', null);
    const endDateVal = getValue('endDate', null);

    if (targetFrom && targetTo && startDateVal && endDateVal) {
      const rowStart = new Date(startDateVal);
      const rowEnd = new Date(endDateVal);

      // Check overlap
      const intersectStart = new Date(Math.max(rowStart.getTime(), targetFrom.getTime()));
      const intersectEnd = new Date(Math.min(rowEnd.getTime(), targetTo.getTime()));

      if (intersectStart <= intersectEnd) {
        const rowDays = Math.round((rowEnd - rowStart) / (1000 * 60 * 60 * 24)) + 1;
        const overlapDays = Math.round((intersectEnd - intersectStart) / (1000 * 60 * 60 * 24)) + 1;
        const ratio = overlapDays / rowDays;

        spend = spend * ratio;
        impressions = Math.round(impressions * ratio);
        reach = Math.round(reach * ratio);
        results = Math.round(results * ratio);
        newContacts = Math.round(newContacts * ratio);
      } else {
        // No overlap, exclude this ad row
        continue;
      }
    }

    const cpr = results > 0 ? spend / results : 0;
    
    ads.push({
      name: getValue('adName', 'Unnamed Ad'),
      status: getValue('status', 'inactive').toLowerCase(),
      spend: spend,
      impressions: impressions,
      reach: reach,
      results: results,
      cpr: cpr,
      newContacts: newContacts,
      quality: getValue('quality', '-'),
      engagement: getValue('engagement', '-'),
      adset: getValue('adset', '-')
    });
  }
  return ads;
}

/**
 * Brand/Category Grouper
 */
function groupBrands(ads) {
  const brands = {};
  const adsetList = [...new Set(ads.map(ad => ad.adset))].filter(x => x && x !== '-');
  
  const colors = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#14B8A6'];
  
  if (adsetList.length > 1 && adsetList.length <= 8) {
    adsetList.forEach((adset, idx) => {
      let name = adset.split(' x ')[0].split(' - ')[0].trim();
      brands[adset] = {
        id: `brand_${idx + 1}`,
        name: name,
        color: colors[idx % colors.length]
      };
    });
  } else {
    // Heuristic: Group by the first word of the ad name
    const prefixes = [...new Set(ads.map(ad => {
      const parts = ad.name.split(/[\s()_.-]+/);
      return parts[0] && parts[0].length > 2 ? parts[0] : 'General';
    }))].filter(p => p !== 'Konten'); // Skip generic Indonesian words if possible
    
    if (prefixes.length > 1 && prefixes.length <= 8) {
      prefixes.forEach((pref, idx) => {
        brands[pref] = {
          id: `brand_${idx + 1}`,
          name: pref,
          color: colors[idx % colors.length]
        };
      });
    } else {
      // Single brand fallback
      brands['General'] = {
        id: 'brand_general',
        name: 'General Brand',
        color: '#6366F1'
      };
    }
  }
  return brands;
}

/**
 * Builds the dashboard layout for a single date range
 */
/**
 * Helper to build the KPI items for dashboard
 */
function buildKPIs(ads, isConversions, overallCpr, overallCpm, frequency) {
  const totalSpend = ads.reduce((sum, a) => sum + a.spend, 0);
  const totalImp = ads.reduce((sum, a) => sum + a.impressions, 0);
  const totalReach = ads.reduce((sum, a) => sum + a.reach, 0);
  const totalResults = ads.reduce((sum, a) => sum + a.results, 0);

  const kpiItems = [
    {
      label: "Total Belanja",
      value: "Rp " + Math.round(totalSpend).toLocaleString('id-ID'),
      subtext: "IDR · Avg Rp " + Math.round(totalSpend / (ads.length || 1)).toLocaleString('id-ID') + "/iklan",
      status: "normal"
    },
    {
      label: "Total Impresi",
      value: totalImp.toLocaleString('id-ID'),
      subtext: "CPM Avg Rp " + Math.round(overallCpm).toLocaleString('id-ID'),
      status: "normal"
    }
  ];
  
  if (isConversions) {
    kpiItems.push({
      label: "Total Konversi",
      value: totalResults.toLocaleString('id-ID'),
      subtext: "CPR Avg Rp " + Math.round(overallCpr).toLocaleString('id-ID'),
      status: "good"
    });
  } else {
    kpiItems.push({
      label: "Rasio Frekuensi",
      value: frequency.toFixed(2) + "×",
      subtext: "Frekuensi rata-rata penayangan",
      status: "normal"
    });
  }
  
  kpiItems.push({
    label: "Total Jangkauan",
    value: totalReach.toLocaleString('id-ID'),
    subtext: "Frekuensi " + frequency.toFixed(2) + "×",
    status: "normal"
  });

  return kpiItems;
}

/**
 * Helper to build the Bubble Chart widget
 */
function buildBubbleChartWidget(ads, isConversions) {
  const bubbleDatasets = ads.map(ad => {
    let yVal = isConversions ? ad.results : ad.reach;
    let rVal = isConversions ? Math.max(4, Math.min(25, Math.sqrt(ad.results) * 3)) : Math.max(4, Math.min(25, Math.sqrt(ad.reach / 100)));
    return {
      label: ad.name.length > 15 ? ad.name.substring(0, 15) + '...' : ad.name,
      data: [{ x: Math.round(ad.spend / 1000), y: yVal, r: rVal }],
      backgroundColor: ad.brandColor + '80',
      borderColor: ad.brandColor,
      borderWidth: 1
    };
  });

  return {
    type: "chart",
    gridSpan: 6,
    chartId: `bubble-custom`,
    chartType: "bubble",
    title: isConversions ? "Pengeluaran vs Konversi per Iklan" : "Pengeluaran vs Jangkauan per Iklan",
    subtitle: isConversions ? "Ukuran bubble = volume konversi" : "Ukuran bubble = volume jangkauan",
    data: { datasets: bubbleDatasets },
    options: {
      scales: {
        x: { title: { display: true, text: 'Belanja (ribu IDR)' }, ticks: { callbackType: 'currency' } },
        y: { title: { display: true, text: isConversions ? 'Konversi (Chat)' : 'Jangkauan' } }
      }
    }
  };
}

/**
 * Helper to build the Efficiency Chart widget (CPR or CPM)
 */
function buildEfficiencyChartWidget(ads, isConversions) {
  if (isConversions) {
    const sortedCpr = [...ads].filter(a => a.results > 0).sort((a,b) => a.cpr - b.cpr);
    return {
      type: "chart",
      gridSpan: 6,
      chartId: `cpr-bar-custom`,
      chartType: "bar",
      title: "Biaya per Konversi (CPR)",
      subtitle: "Semakin rendah nilai CPR, efisiensi semakin tinggi (IDR)",
      data: {
        labels: sortedCpr.map(a => a.name.length > 12 ? a.name.substring(0, 12) + '...' : a.name),
        datasets: [{
          label: 'CPR',
          data: sortedCpr.map(a => Math.round(a.cpr)),
          backgroundColor: sortedCpr.map(a => a.cpr < 4000 ? '#10B981cc' : a.cpr < 8000 ? '#F59E0Bcc' : '#EF4444cc'),
          borderColor: sortedCpr.map(a => a.cpr < 4000 ? '#10B981' : a.cpr < 8000 ? '#F59E0B' : '#EF4444'),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { ticks: { callbackType: 'currency' } }
        }
      }
    };
  } else {
    const sortedCpm = [...ads].sort((a,b) => a.spend / (a.impressions || 1) - b.spend / (b.impressions || 1));
    return {
      type: "chart",
      gridSpan: 6,
      chartId: `cpm-bar-custom`,
      chartType: "bar",
      title: "Biaya per 1000 Impresi (CPM)",
      subtitle: "Biaya penayangan visual iklan (IDR)",
      data: {
        labels: sortedCpm.map(a => a.name.length > 12 ? a.name.substring(0, 12) + '...' : a.name),
        datasets: [{
          label: 'CPM',
          data: sortedCpm.map(a => Math.round(a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0)),
          backgroundColor: '#3B82F6cc',
          borderColor: '#3B82F6',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { ticks: { callbackType: 'currency' } }
        }
      }
    };
  }
}

/**
 * Helper to build the Impresi vs Jangkauan Chart widget
 */
function buildImpReachChartWidget(ads) {
  const sortedImp = [...ads].sort((a,b) => b.impressions - a.impressions);
  return {
    type: "chart",
    gridSpan: 12,
    chartId: `imp-reach-custom`,
    chartType: "bar",
    title: "Impresi vs Jangkauan per Iklan",
    subtitle: "Menunjukkan visual exposure vs jumlah unik penonton",
    data: {
      labels: sortedImp.map(a => a.name.length > 15 ? a.name.substring(0, 15) + '...' : a.name),
      datasets: [
        { label: 'Impresi', data: sortedImp.map(a => a.impressions), backgroundColor: '#3B82F6aa', borderColor: '#3B82F6', borderWidth: 1, borderRadius: 3 },
        { label: 'Jangkauan', data: sortedImp.map(a => a.reach), backgroundColor: '#10B981aa', borderColor: '#10B981', borderWidth: 1, borderRadius: 3 }
      ]
    }
  };
}

/**
 * Helper to build the Brand Distribution Chart widget
 */
function buildBrandPieWidget(ads, brandsMap, isConversions, hasMultipleBrands) {
  if (hasMultipleBrands) {
    const brandResults = {};
    Object.keys(brandsMap).forEach(k => {
      const b = brandsMap[k];
      brandResults[b.id] = { name: b.name, color: b.color, val: 0 };
    });
    ads.forEach(ad => {
      if (brandResults[ad.brandKey]) {
        brandResults[ad.brandKey].val += isConversions ? ad.results : ad.impressions;
      }
    });

    const activeBrands = Object.values(brandResults).filter(b => b.val > 0);

    return {
      type: "chart",
      gridSpan: 6,
      chartId: `brand-pie-custom`,
      chartType: "doughnut",
      title: isConversions ? "Distribusi Konversi per Brand" : "Distribusi Impresi per Brand",
      subtitle: isConversions ? "Persentase kontribusi chat dimulai" : "Persentase paparan tayangan iklan",
      data: {
        labels: activeBrands.map(b => b.name),
        datasets: [{
          data: activeBrands.map(b => b.val),
          backgroundColor: activeBrands.map(b => b.color + 'cc'),
          borderColor: activeBrands.map(b => b.color),
          borderWidth: 1.5
        }]
      }
    };
  } else {
    // Single brand fallback: Campaign/Ad Set Split
    const adsetResults = {};
    ads.forEach(ad => {
      if (!adsetResults[ad.adset]) {
        adsetResults[ad.adset] = { name: ad.adset.split(' x ')[0], val: 0 };
      }
      adsetResults[ad.adset].val += isConversions ? ad.results : ad.impressions;
    });
    const activeAdsets = Object.values(adsetResults);
    return {
      type: "chart",
      gridSpan: 6,
      chartId: `adset-pie-custom`,
      chartType: "doughnut",
      title: isConversions ? "Distribusi Konversi per Set Iklan" : "Distribusi Impresi per Set Iklan",
      data: {
        labels: activeAdsets.map(a => a.name),
        datasets: [{
          data: activeAdsets.map(a => a.val),
          backgroundColor: ['#6366F1cc', '#EC4899cc', '#10B981cc'],
          borderWidth: 1
        }]
      }
    };
  }
}

/**
 * Helper to build the Stacked Chart widget (New vs Returning Contacts OR Reach vs Impressions)
 */
function buildStackedChartWidget(ads, isConversions, totalNewContacts) {
  if (isConversions && totalNewContacts > 0) {
    const sortedCpr = [...ads].filter(a => a.results > 0).sort((a,b) => a.cpr - b.cpr);
    return {
      type: "chart",
      gridSpan: 6,
      chartId: `contact-split-custom`,
      chartType: "bar",
      title: "Kontak Baru vs Returning per Iklan",
      subtitle: "Menilai efektivitas menjaring audiens baru",
      data: {
        labels: sortedCpr.map(a => a.name.length > 12 ? a.name.substring(0, 12) + '...' : a.name),
        datasets: [
          { label: 'Kontak Baru', data: sortedCpr.map(a => a.newContacts), backgroundColor: '#10B981cc', borderRadius: { topLeft: 3, topRight: 3 } },
          { label: 'Returning', data: sortedCpr.map(a => Math.max(0, a.results - a.newContacts)), backgroundColor: '#10B98144' }
        ]
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    };
  } else {
    // Fallback stacked chart: Reach vs Impressions
    const sortedReach = [...ads].sort((a,b) => b.reach - a.reach);
    return {
      type: "chart",
      gridSpan: 6,
      chartId: `reach-ratio-custom`,
      chartType: "bar",
      title: "Rasio Frekuensi: Jangkauan vs Impresi",
      subtitle: "Kekuatan penetrasi audiens",
      data: {
        labels: sortedReach.map(a => a.name.length > 12 ? a.name.substring(0, 12) + '...' : a.name),
        datasets: [
          { label: 'Jangkauan Unik', data: sortedReach.map(a => a.reach), backgroundColor: '#3B82F6cc' },
          { label: 'Pengulangan (Impresi - Jangkauan)', data: sortedReach.map(a => Math.max(0, a.impressions - a.reach)), backgroundColor: '#3B82F644' }
        ]
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    };
  }
}

/**
 * Helper to determine CSS class for quality ranking
 */
function getQualityStyle(quality) {
  if (quality.includes("Atas") || quality.includes("above")) {
    return "r-above";
  }
  if (quality.includes("Rata") || quality.includes("avg")) {
    return "r-avg";
  }
  if (quality === "-") {
    return "r-na";
  }
  return "r-low";
}

/**
 * Helper to determine CSS class for engagement ranking
 */
function getEngagementStyle(engagement) {
  if (engagement.includes("Atas") || engagement.includes("above")) {
    return "r-above";
  }
  if (engagement.includes("Rata") || engagement.includes("avg")) {
    return "r-avg";
  }
  if (engagement === "-") {
    return "r-na";
  }
  return "r-low";
}

/**
 * Helper to map a single ad object into a table row array
 */
function mapAdToRow(ad, isConversions) {
  const row = [
    ad.name,
    { type: "badge", text: ad.brandName || "General", styleClass: "brand-tag", color: ad.brandColor },
    { type: "badge", text: ad.status === 'active' ? 'Aktif' : 'Nonaktif', styleClass: ad.status === 'active' ? 'pill-active' : 'pill-inactive' }
  ];
  
  row.push("Rp " + ad.spend.toLocaleString('id-ID'));
  row.push(ad.impressions.toLocaleString('id-ID'));
  
  if (isConversions) {
    row.push(ad.results);
    
    let cprStyleClass = "badge-danger";
    if (ad.cpr < 4000) {
      cprStyleClass = "badge-good";
    } else if (ad.cpr < 8000) {
      cprStyleClass = "badge-warn";
    }
    
    row.push({ 
      type: "badge", 
      text: ad.results > 0 ? "Rp " + Math.round(ad.cpr).toLocaleString('id-ID') : "-",
      styleClass: cprStyleClass
    });
  } else {
    row.push(ad.reach.toLocaleString('id-ID'));
    const adCpm = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : 0;
    row.push("Rp " + Math.round(adCpm).toLocaleString('id-ID'));
  }
  
  row.push({ 
    type: "badge", 
    text: ad.quality, 
    styleClass: getQualityStyle(ad.quality)
  });
  row.push({ 
    type: "badge", 
    text: ad.engagement, 
    styleClass: getEngagementStyle(ad.engagement)
  });
  
  return row;
}

/**
 * Helper to build the detailed performance Table widget
 */
function buildTableWidget(ads, isConversions) {
  const headers = ["Nama Iklan", "Kategori", "Status", "Belanja", "Impresi"];
  if (isConversions) {
    headers.push("Konversi", "CPR");
  } else {
    headers.push("Jangkauan", "CPM");
  }
  headers.push("Kualitas", "Interaksi");

  const tableRows = ads.map(ad => mapAdToRow(ad, isConversions));

  return {
    type: "table",
    gridSpan: 12,
    title: "Detail Performa Tiap Iklan",
    headers: headers,
    rows: tableRows
  };
}

/**
 * Helper to build the Efficiency Bar List widget
 */
function buildEfficiencyBarListWidget(ads, isConversions) {
  const effItems = [];
  const maxMetric = Math.max(...ads.map(a => isConversions ? a.cpr : (a.spend / (a.impressions || 1)) * 1000), 1);
  
  [...ads].sort((a,b) => {
    if (isConversions) return a.cpr - b.cpr;
    const cpmA = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0;
    const cpmB = b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0;
    return cpmA - cpmB;
  }).forEach(ad => {
    const val = isConversions ? ad.cpr : (ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : 0);
    const pct = Math.round((val / maxMetric) * 100);
    const color = isConversions 
      ? (ad.cpr < 4000 ? "#10B981" : ad.cpr < 8000 ? "#F59E0B" : "#EF4444")
      : "#3B82F6";
      
    effItems.push({
      label: ad.name.length > 20 ? ad.name.substring(0, 20) + '...' : ad.name,
      pct: pct,
      value: "Rp " + Math.round(val).toLocaleString('id-ID'),
      color: color,
      badge: ad.brandName || "General",
      badgeClass: "badge-neutral"
    });
  });

  return {
    type: "bar_list",
    gridSpan: 12,
    title: isConversions ? "Skor Efisiensi Iklan (CPR lebih rendah = lebih efisien)" : "Skor Efisiensi Biaya Penayangan (CPM)",
    items: effItems
  };
}

/**
 * Builds the dashboard layout for a single date range
 */
function buildDashboardLayout(dateRange, ads, brandsMap) {
  const isConversions = ads.some(a => a.results > 0);
  const hasMultipleBrands = Object.keys(brandsMap).length > 1;
  
  // Calculate aggregate metrics
  const totalSpend = ads.reduce((sum, a) => sum + a.spend, 0);
  const totalImp = ads.reduce((sum, a) => sum + a.impressions, 0);
  const totalReach = ads.reduce((sum, a) => sum + a.reach, 0);
  const totalResults = ads.reduce((sum, a) => sum + a.results, 0);
  const totalNewContacts = ads.reduce((sum, a) => sum + a.newContacts, 0);
  
  const overallCpr = totalResults > 0 ? totalSpend / totalResults : 0;
  const overallCpm = totalImp > 0 ? (totalSpend / totalImp) * 1000 : 0;
  const frequency = totalReach > 0 ? totalImp / totalReach : 1;
  
  // 1. Compile KPIs
  const kpiItems = buildKPIs(ads, isConversions, overallCpr, overallCpm, frequency);
  
  const widgets = [];
  
  // Widget 1: KPI Grid
  widgets.push({
    type: "kpi_grid",
    gridSpan: 12,
    items: kpiItems
  });
  
  // Widget 2: Spend vs. Performance (Bubble Chart)
  widgets.push(buildBubbleChartWidget(ads, isConversions));
  
  // Widget 3: Efficiency Chart (CPR or CPM Bar Chart)
  widgets.push(buildEfficiencyChartWidget(ads, isConversions));

  // Widget 4: Impresi vs Jangkauan (Grouped Bar Chart)
  widgets.push(buildImpReachChartWidget(ads));

  // Widget 5: Brand Doughnut & Stacked Conversions Row
  widgets.push(buildBrandPieWidget(ads, brandsMap, isConversions, hasMultipleBrands));

  // Widget 6: Stacked chart (New vs Returning OR Reach vs Frequency)
  widgets.push(buildStackedChartWidget(ads, isConversions, totalNewContacts));

  // Widget 7: Table Widget
  widgets.push(buildTableWidget(ads, isConversions));

  // Widget 8: Efficiency Bar List
  widgets.push(buildEfficiencyBarListWidget(ads, isConversions));

  return {
    label: `Periode: ${dateRange}`,
    dateRange: dateRange,
    widgets: widgets
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('::STATUS::Mempersiapkan & membaca konfigurasi...');
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!geminiApiKey) {
    console.error('Missing required environment variable GEMINI_API_KEY in .env');
    process.exit(1);
  }

  // Determine date range from env or default to last 7 days
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 7);
  
  const dateFrom = process.env.ADS_DATE_FROM || defaultFrom.toISOString().split('T')[0];
  const dateTo = process.env.ADS_DATE_TO || today.toISOString().split('T')[0];
  
  console.log(`Analysis date range: ${dateFrom} → ${dateTo}`);
  console.log(`::STATUS::Mengatur rentang tanggal analisis: ${dateFrom} s/d ${dateTo}`);

  // Format date range for display
  const formatIndo = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const displayDateRange = `${formatIndo(new Date(dateFrom))} – ${formatIndo(new Date(dateTo))}`;

  let ads = [];
  let isApiFetchSuccess = false;

  // Determine if we should use CSV instead of API
  const dataSource = process.env.ADS_DATA_SOURCE || 'api';
  const useCsvSource = dataSource === 'csv';

  // 1. Try to fetch from Meta Ads API (skip if data source is set to csv)
  if (!useCsvSource && accessToken && adAccountId) {
    try {
      console.log('Attempting to fetch real-time insights from Meta Ads API...');
      console.log('::STATUS::Mengambil data real-time dari Meta Ads API...');
      const apiData = await fetchMetaInsightsRange(accessToken, adAccountId, dateFrom, dateTo);
      
      console.log('Successfully fetched real-time insights from Meta Ads API. Normalizing...');
      console.log('::STATUS::Berhasil mengambil data dari Meta Ads API. Melakukan normalisasi...');
      ads = normalizeMetaInsights(apiData);
      isApiFetchSuccess = true;
    } catch (err) {
      console.error(`Error: Meta Ads API fetch failed: ${err.message}`);
      process.exit(1);
    }
  }

  // 2. Fallback to Local CSV if API fetch was skipped/failed, or data source is csv
  if (!isApiFetchSuccess) {
    const csvPath = process.env.ADS_CSV_PATH || path.join(__dirname, 'uploaded-ads.csv');

    if (!fs.existsSync(csvPath)) {
      console.error(`Error: Fallback CSV file not found at ${csvPath}`);
      process.exit(1);
    }

    console.log(`Reading CSV file: ${path.basename(csvPath)}...`);
    console.log('::STATUS::Membaca data dari file CSV...');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    ads = parseCSV(csvText, dateFrom, dateTo);
    console.log(`Parsed ${ads.length} ad rows from CSV after applying date range filter/projections.`);
    console.log(`::STATUS::Berhasil memuat ${ads.length} data iklan dari CSV.`);
  }

  // 3. Zero-Data check
  if (ads.length === 0) {
    console.warn("WARNING: Empty dataset. Writing empty-state dashboard report...");
    const emptyStateJson = {
      title: "Laporan Performa Iklan Digital",
      subtitle: "Tidak Ada Data Ditemukan",
      timeframes: {
        custom: {
          label: "Dashboard",
          dateRange: displayDateRange,
          whatsAppSummary: "⚠️ *Pemberitahuan*: Tidak ditemukan data kampanye aktif.",
          widgets: [
            {
              type: "text_card",
              gridSpan: 12,
              title: "Tidak Ada Data Kampanye Aktif",
              body: "Sistem tidak mendeteksi baris iklan valid. Silakan periksa apakah akun iklan Meta Anda aktif atau sinkronisasikan kembali data."
            }
          ]
        }
      }
    };
    
    const templatePath = path.join(__dirname, 'template.html');
    const outputPath = path.join(__dirname, 'report.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace('{DASHBOARD_DATA_PLACEHOLDER}', JSON.stringify(emptyStateJson, null, 2));
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`Empty-state report.html created successfully.`);
    process.exit(0);
  }

  // 4. Group Brands
  console.log('::STATUS::Mengelompokkan kategori brand dan produk...');
  const brandsMap = groupBrands(ads);
  console.log("Dynamically identified brands/categories:", Object.values(brandsMap).map(b => b.name).join(', '));

  // Map brand details to each ad
  ads.forEach(ad => {
    if (brandsMap[ad.adset]) {
      ad.brandKey = brandsMap[ad.adset].id;
      ad.brandName = brandsMap[ad.adset].name;
      ad.brandColor = brandsMap[ad.adset].color;
    } else {
      const parts = ad.name.split(/[\s()_.-]+/);
      const pref = parts[0] && parts[0].length > 2 ? parts[0] : 'General';
      if (brandsMap[pref]) {
        ad.brandKey = brandsMap[pref].id;
        ad.brandName = brandsMap[pref].name;
        ad.brandColor = brandsMap[pref].color;
      } else {
        ad.brandKey = 'brand_general';
        ad.brandName = 'General';
        ad.brandColor = '#64748b';
      }
    }
  });

  // 5. Construct layout programmatically (single custom date range)
  const customLayout = buildDashboardLayout(displayDateRange, ads, brandsMap);

  // 6. Build condensed statistical summary for Gemini NLP analysis
  const isConversions = ads.some(a => a.results > 0);
  const sorted = [...ads].sort((a,b) => b.spend - a.spend);
  const topPerformers = sorted.slice(0, 3).map(a => ({ name: a.name, spend: Math.round(a.spend), conv: a.results, reach: a.reach, cpr: Math.round(a.cpr) }));
  const underperforming = [...ads].sort((a,b) => isConversions ? (b.cpr - a.cpr) : (b.spend / (b.impressions || 1) - a.spend / (a.impressions || 1))).slice(0, 2).map(a => ({ name: a.name, spend: Math.round(a.spend), conv: a.results, cpr: Math.round(a.cpr) }));
  const anomalies = ads.filter(a => a.spend > 20000 && a.results === 0).map(a => ({ name: a.name, spend: Math.round(a.spend) }));
  
  const geminiPayload = {
    dateRange: displayDateRange,
    campaignType: isConversions ? "Direct Response / Conversions (Chat)" : "Brand Awareness / Traffic",
    brands: Object.values(brandsMap).map(b => b.name),
    summaryMetrics: {
      totalSpend: Math.round(ads.reduce((s, a) => s + a.spend, 0)),
      totalImpressions: ads.reduce((s, a) => s + a.impressions, 0),
      totalConversions: ads.reduce((s, a) => s + a.results, 0),
      overallReach: ads.reduce((s, a) => s + a.reach, 0)
    },
    topPerformers,
    underperforming,
    anomalies
  };

  // 7. Request copywriting and qualitative insights from Gemini
  const prompt = `
  You are an expert advertising data analyst and copywriter. Analyze this statistical summary of ad campaigns for the period ${displayDateRange}:
  
  ${JSON.stringify(geminiPayload, null, 2)}
  
  Generate:
  1. A professional Indonesian WhatsApp summary paragraph highlighting total spend, top brand category, key performance indicators, and concrete optimization advice.
  2. Exactly 6 qualitative insight cards. Each card must have:
     - "headline": Short punchy title (Indonesian)
     - "body": Highly specific copy explaining the observation and action (Indonesian)
     - "icon": Icon name (choose ONLY from: "ti ti-trophy", "ti ti-flame", "ti ti-chart-line", "ti ti-alert-triangle", "ti ti-users", "ti ti-bulb")
     - "color": A hex color code matching the status (e.g. green/emerald for good, orange/amber for warning, red/rose for danger, blue/indigo for info).
     
  Output a single JSON object matching this structure:
  {
    "whatsAppSummary": "Paragraph text...",
    "insights": [
      { "headline": "...", "body": "...", "icon": "...", "color": "#HEX" }
    ]
  }
  
  Make sure your analysis is highly factual, referencing the values in the summary. Avoid general placeholders. Return ONLY the JSON object. Do not wrap in markdown \`\`\`json block.
  `;

  console.log('Sending condensed metrics to Gemini for NLP copywriting...');
  console.log('::STATUS::Mengirim ringkasan performa ke Gemini AI untuk dianalisis...');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  let responseText = '';
  let aiTextData;
  let geminiUsage = null;

  // Retry helper with exponential backoff
  async function generateContentWithRetry(modelName, retries = 4, delay = 3000) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Attempting analysis with model: ${modelName} (Attempt ${i + 1}/${retries})...`);
        console.log(`::STATUS::Menjalankan analisis Gemini AI (${modelName}) - Percobaan ${i + 1}/${retries}...`);
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });
        geminiUsage = result.response.usageMetadata;
        return result.response.text();
      } catch (err) {
        console.warn(`Attempt ${i + 1} failed: ${err.message}`);
        if (i === retries - 1) throw err;
        console.log(`Waiting ${delay}ms before next retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      }
    }
  }

  try {
    responseText = await generateContentWithRetry(process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', 4, 3000);
  } catch (err) {
    console.error('All attempts to call Gemini API failed:', err.message);
    process.exit(1);
  }

  try {
    aiTextData = JSON.parse(responseText);
    console.log('Successfully received and parsed dynamic copywriting from Gemini.');
    console.log('::STATUS::Analisis performa & copywriting dari Gemini AI berhasil diterima.');
  } catch (err) {
    console.error('Failed to parse Gemini response text as JSON:', err.message);
    console.error('Raw Response:', responseText);
    process.exit(1);
  }

  // 8. Merge NLP insights back into our layout
  customLayout.whatsAppSummary = aiTextData.whatsAppSummary;
  
  // Append the insights widget to the widgets list
  customLayout.widgets.splice(5, 0, {
    type: "insights",
    gridSpan: 12,
    title: "Insight Utama",
    items: aiTextData.insights
  });

  // Compile final JSON structure for template.html
  const finalDashboardJson = {
    title: ads.some(a => a.results > 0) ? "Laporan Performa Iklan Multi-Brand" : "Laporan Performa Kampanye Awareness",
    subtitle: `Periode: ${displayDateRange}`,
    theme: {
      primary: Object.values(brandsMap)[0]?.color || "#3B82F6"
    },
    brands: brandsMap,
    timeframes: {
      custom: customLayout
    },
    ads: ads
  };

  // 9. Compile report.html & report.json
  console.log('Compiling final dashboard report...');
  console.log('::STATUS::Menyusun dashboard laporan interaktif HTML...');
  const templatePath = path.join(__dirname, 'template.html');
  const outputPath = path.join(__dirname, 'report.html');
  const jsonOutputPath = path.join(__dirname, 'report.json');

  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace('{DASHBOARD_DATA_PLACEHOLDER}', JSON.stringify(finalDashboardJson, null, 2));
  fs.writeFileSync(outputPath, html, 'utf8');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(finalDashboardJson, null, 2), 'utf8');
  
  console.log(`report.html compiled successfully at: ${outputPath}`);
  console.log(`report.json compiled successfully at: ${jsonOutputPath}`);
  console.log('::STATUS::Laporan HTML & JSON berhasil diperbarui!');

  console.log('\n==================================================================');
  console.log('Gemini-Generated WhatsApp Broadcast Summary (Preview)');
  console.log('==================================================================');
  
  console.log(`\n📊 *LAPORAN PERFORMA IKLAN*: ${displayDateRange}`);
  console.log(finalDashboardJson.timeframes.custom.whatsAppSummary);
  console.log('==================================================================\n');

  console.log('Automation execution completed successfully!');

  const jsonResult = {
    custom: {
      summary: finalDashboardJson.timeframes.custom.whatsAppSummary,
      dateRange: displayDateRange
    },
    usage: geminiUsage ? {
      inputTokens: geminiUsage.promptTokenCount || 0,
      outputTokens: geminiUsage.candidatesTokenCount || 0,
      cachedTokens: geminiUsage.cachedContentTokenCount || 0
    } : null
  };
  console.log('::JSON_RESULT::' + JSON.stringify(jsonResult));
}

const isMain = typeof require !== 'undefined' && require.main && require.main.filename === module.filename;
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = {
    normalizeMetaInsights,
    splitCSVLine,
    parseCSV,
    groupBrands,
    buildDashboardLayout
  };
}
