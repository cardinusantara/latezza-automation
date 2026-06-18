require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Fetch Meta Ads insights for a specific date preset
 */
async function fetchMetaInsights(accessToken, adAccountId, datePreset) {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'ad_id,ad_name,spend,impressions,reach,actions,cost_per_action_type,adset_name,campaign_name,quality_ranking,engagement_rate_ranking';
  const metaUrl = `https://graph.facebook.com/v19.0/${actId}/insights?level=ad&date_preset=${datePreset}&fields=${fields}&access_token=${accessToken}`;
  
  console.log(`Fetching Meta Ads data for preset [${datePreset}]...`);
  const res = await fetch(metaUrl);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta API error for ${datePreset} (${res.status}): ${errText}`);
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
    const spend = parseFloat(item.spend) || 0;
    const impressions = parseInt(item.impressions) || 0;
    const reach = parseInt(item.reach) || 0;
    
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
        results = parseInt(msgAction.value) || 0;
        newContacts = results;
      } else if (purchaseAction) {
        results = parseInt(purchaseAction.value) || 0;
      } else if (linkClickAction) {
        results = parseInt(linkClickAction.value) || 0;
      } else {
        const totalActions = item.actions.reduce((sum, a) => sum + (parseInt(a.value) || 0), 0);
        results = totalActions;
      }
    }
    
    const cpr = results > 0 ? spend / results : 0;
    
    return {
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
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
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
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  const headers = splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  
  // Dynamic column mapping based on keywords
  const indexMap = {
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
      const cleanNum = parseFloat(val.replace(/[^0-9.-]/g, ''));
      return isNaN(cleanNum) ? defaultVal : cleanNum;
    };
    
    ads.push({
      name: getValue('adName', 'Unnamed Ad'),
      status: getValue('status', 'inactive').toLowerCase(),
      spend: getNumValue('spend', 0),
      impressions: getNumValue('impressions', 0),
      reach: getNumValue('reach', 0),
      results: getNumValue('results', 0),
      cpr: getNumValue('cpr', 0),
      newContacts: getNumValue('newContacts', 0),
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
 * Builds standard layouts programmatically
 */
function buildDashboardLayout(timeframeKey, label, dateRange, ads, brandsMap) {
  const isConversions = ads.some(a => a.results > 0);
  const hasMultipleBrands = Object.keys(brandsMap).length > 1;
  const isDark = true; // For default color templates
  
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

  const widgets = [];
  
  // Widget 1: KPI Grid
  widgets.push({
    type: "kpi_grid",
    gridSpan: 12,
    items: kpiItems
  });
  
  // Widget 2: Spend vs. Performance (Bubble Chart)
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
  
  widgets.push({
    type: "chart",
    gridSpan: 6,
    chartId: `bubble-${timeframeKey}`,
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
  });

  // Widget 3: Efficiency Chart (CPR or CPM Bar Chart)
  if (isConversions) {
    const sortedCpr = [...ads].filter(a => a.results > 0).sort((a,b) => a.cpr - b.cpr);
    widgets.push({
      type: "chart",
      gridSpan: 6,
      chartId: `cpr-bar-${timeframeKey}`,
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
    });
  } else {
    // Awareness fallback: CPM Bar Chart
    const sortedCpm = [...ads].sort((a,b) => a.spend / (a.impressions || 1) - b.spend / (b.impressions || 1));
    widgets.push({
      type: "chart",
      gridSpan: 6,
      chartId: `cpm-bar-${timeframeKey}`,
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
    });
  }

  // Widget 4: Impresi vs Jangkauan (Grouped Bar Chart)
  const sortedImp = [...ads].sort((a,b) => b.impressions - a.impressions);
  widgets.push({
    type: "chart",
    gridSpan: 12,
    chartId: `imp-reach-${timeframeKey}`,
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
  });

  // Widget 5: Brand Doughnut & Stacked Conversions Row
  if (hasMultipleBrands) {
    // Group conversions by brand
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

    widgets.push({
      type: "chart",
      gridSpan: 6,
      chartId: `brand-pie-${timeframeKey}`,
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
    });
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
    widgets.push({
      type: "chart",
      gridSpan: 6,
      chartId: `adset-pie-${timeframeKey}`,
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
    });
  }

  // Stacked chart (New vs Returning OR Reach vs Frequency)
  if (isConversions && totalNewContacts > 0) {
    const sortedCpr = [...ads].filter(a => a.results > 0).sort((a,b) => a.cpr - b.cpr);
    widgets.push({
      type: "chart",
      gridSpan: 6,
      chartId: `contact-split-${timeframeKey}`,
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
    });
  } else {
    // Fallback stacked chart: Reach vs Impressions
    const sortedReach = [...ads].sort((a,b) => b.reach - a.reach);
    widgets.push({
      type: "chart",
      gridSpan: 6,
      chartId: `reach-ratio-${timeframeKey}`,
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
    });
  }

  // Widget 6: Table Widget
  const headers = ["Nama Iklan", "Kategori", "Status", "Belanja", "Impresi"];
  if (isConversions) {
    headers.push("Konversi", "CPR");
  } else {
    headers.push("Jangkauan", "CPM");
  }
  headers.push("Kualitas", "Interaksi");

  const tableRows = ads.map(ad => {
    const row = [
      ad.name,
      { type: "badge", text: ad.brandName || "General", styleClass: "brand-tag", color: ad.brandColor },
      { type: "badge", text: ad.status === 'active' ? 'Aktif' : 'Nonaktif', styleClass: ad.status === 'active' ? 'pill-active' : 'pill-inactive' }
    ];
    
    row.push("Rp " + ad.spend.toLocaleString('id-ID'));
    row.push(ad.impressions.toLocaleString('id-ID'));
    
    if (isConversions) {
      row.push(ad.results);
      row.push({ 
        type: "badge", 
        text: ad.results > 0 ? "Rp " + Math.round(ad.cpr).toLocaleString('id-ID') : "-",
        styleClass: ad.cpr < 4000 ? "badge-good" : ad.cpr < 8000 ? "badge-warn" : "badge-danger"
      });
    } else {
      row.push(ad.reach.toLocaleString('id-ID'));
      const adCpm = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : 0;
      row.push("Rp " + Math.round(adCpm).toLocaleString('id-ID'));
    }
    
    row.push({ type: "badge", text: ad.quality, styleClass: ad.quality.includes("Atas") || ad.quality.includes("above") ? "r-above" : ad.quality.includes("Rata") || ad.quality.includes("avg") ? "r-avg" : ad.quality === "-" ? "r-na" : "r-low" });
    row.push({ type: "badge", text: ad.engagement, styleClass: ad.engagement.includes("Atas") || ad.engagement.includes("above") ? "r-above" : ad.engagement.includes("Rata") || ad.engagement.includes("avg") ? "r-avg" : ad.engagement === "-" ? "r-na" : "r-low" });
    
    return row;
  });

  widgets.push({
    type: "table",
    gridSpan: 12,
    title: "Detail Performa Tiap Iklan",
    headers: headers,
    rows: tableRows
  });

  // Widget 7: Efficiency Bar List
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

  widgets.push({
    type: "bar_list",
    gridSpan: 12,
    title: isConversions ? "Skor Efisiensi Iklan (CPR lebih rendah = lebih efisien)" : "Skor Efisiensi Biaya Penayangan (CPM)",
    items: effItems
  });

  return {
    label: label,
    dateRange: dateRange,
    widgets: widgets
  };
}

/**
 * Main execution
 */
async function main() {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!geminiApiKey) {
    console.error('Missing required environment variable GEMINI_API_KEY in .env');
    process.exit(1);
  }

  let dailyAds = [];
  let weeklyAds = [];
  let monthlyAds = [];
  let dateRangeDaily = 'Hari Ini (Daily)';
  let dateRangeWeekly = 'Minggu Ini (Weekly)';
  let dateRangeMonthly = 'Bulan Ini (Monthly)';
  let isApiFetchSuccess = false;

  // 1. Try to fetch from Meta Ads API
  if (accessToken && adAccountId) {
    try {
      console.log('Attempting to fetch real-time insights from Meta Ads API...');
      const apiDaily = await fetchMetaInsights(accessToken, adAccountId, 'today');
      const apiWeekly = await fetchMetaInsights(accessToken, adAccountId, 'last_7d');
      const apiMonthly = await fetchMetaInsights(accessToken, adAccountId, 'last_30d');
      
      console.log('Successfully fetched real-time insights from Meta Ads API. Normalizing...');
      dailyAds = normalizeMetaInsights(apiDaily);
      weeklyAds = normalizeMetaInsights(apiWeekly);
      monthlyAds = normalizeMetaInsights(apiMonthly);
      
      // Dynamic Date range based on current local date
      const today = new Date();
      const formatIndo = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const formatIndoNoYear = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
      
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      dateRangeDaily = formatIndo(today);
      dateRangeWeekly = `${formatIndoNoYear(sevenDaysAgo)} – ${formatIndo(today)}`;
      dateRangeMonthly = `${formatIndoNoYear(thirtyDaysAgo)} – ${formatIndo(today)}`;
      
      isApiFetchSuccess = true;
    } catch (err) {
      console.error(`Error: Meta Ads API fetch failed: ${err.message}`);
      process.exit(1);
    }
  }

  // 2. Fallback to Local CSV if API fetch was skipped or failed
  if (!isApiFetchSuccess) {
    const csvFileName = 'Ru-y-Latezza-Iklan-14-Mei-2026-21-Mei-2026.csv';
    const csvPath = path.join(__dirname, csvFileName);

    if (!fs.existsSync(csvPath)) {
      console.error(`Error: Fallback CSV file not found at ${csvPath}`);
      process.exit(1);
    }

    console.log(`Reading CSV file: ${csvFileName}...`);
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rawAds = parseCSV(csvText);
    console.log(`Parsed ${rawAds.length} ad rows from CSV.`);
    
    // Use raw ads as weekly, and project daily/monthly
    weeklyAds = rawAds;
    dailyAds = rawAds.map(a => ({
      ...a,
      spend: a.spend / 7,
      impressions: Math.round(a.impressions / 7),
      reach: Math.round(a.reach / 7),
      results: Math.round(a.results / 7),
      newContacts: Math.round(a.newContacts / 7)
    }));
    monthlyAds = rawAds.map(a => ({
      ...a,
      spend: a.spend * 4.3,
      impressions: Math.round(a.impressions * 4.3),
      reach: Math.round(a.reach * 4.3),
      results: Math.round(a.results * 4.3),
      newContacts: Math.round(a.newContacts * 4.3)
    }));

    dateRangeDaily = '21 Mei 2026';
    dateRangeWeekly = '14 Mei – 21 Mei 2026';
    dateRangeMonthly = '1 Mei – 30 Mei 2026 (Proyeksi)';
  }

  // 3. Zero-Data check across timeframes
  if (dailyAds.length === 0 && weeklyAds.length === 0 && monthlyAds.length === 0) {
    console.warn("WARNING: Empty datasets. Writing empty-state dashboard report...");
    const emptyStateJson = {
      title: "Laporan Performa Iklan Digital",
      subtitle: "Tidak Ada Data Ditemukan",
      timeframes: {
        daily: {
          label: "Dashboard",
          dateRange: "N/A",
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
    html = html.replace('{DAILY_WEEKLY_MONTHLY_DATA_PLACEHOLDER}', JSON.stringify(emptyStateJson, null, 2));
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`Empty-state report.html created successfully.`);
    process.exit(0);
  }

  // 4. Group Brands using merged list of all ads to ensure brand mapping consistency
  const allAdsMerged = [...dailyAds, ...weeklyAds, ...monthlyAds];
  const brandsMap = groupBrands(allAdsMerged);
  console.log("Dynamically identified brands/categories:", Object.values(brandsMap).map(b => b.name).join(', '));

  // Map brand details to each timeframe's ads
  const mapAdBrands = (adsList) => {
    adsList.forEach(ad => {
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
  };

  mapAdBrands(dailyAds);
  mapAdBrands(weeklyAds);
  mapAdBrands(monthlyAds);

  // 5. Construct layouts programmatically
  const dailyLayout = buildDashboardLayout('daily', 'Hari Ini (Daily)', dateRangeDaily, dailyAds, brandsMap);
  const weeklyLayout = buildDashboardLayout('weekly', 'Minggu Ini (Weekly)', dateRangeWeekly, weeklyAds, brandsMap);
  const monthlyLayout = buildDashboardLayout('monthly', 'Bulan Ini (Monthly)', dateRangeMonthly, monthlyAds, brandsMap);

  // 5. Build condensed statistical summaries for Gemini NLP analysis
  const getSummaryPayload = (layout, adsList) => {
    const isConversions = adsList.some(a => a.results > 0);
    const sorted = [...adsList].sort((a,b) => b.spend - a.spend);
    const topPerformers = sorted.slice(0, 3).map(a => ({ name: a.name, spend: Math.round(a.spend), conv: a.results, reach: a.reach, cpr: Math.round(a.cpr) }));
    const underperforming = [...adsList].sort((a,b) => isConversions ? (b.cpr - a.cpr) : (b.spend / (b.impressions || 1) - a.spend / (a.impressions || 1))).slice(0, 2).map(a => ({ name: a.name, spend: Math.round(a.spend), conv: a.results, cpr: Math.round(a.cpr) }));
    
    // Find high spend with zero conversions anomalies
    const anomalies = adsList.filter(a => a.spend > 20000 && a.results === 0).map(a => ({ name: a.name, spend: Math.round(a.spend) }));
    
    return {
      timeframe: layout.label,
      dateRange: layout.dateRange,
      campaignType: isConversions ? "Direct Response / Conversions (Chat)" : "Brand Awareness / Traffic",
      brands: Object.values(brandsMap).map(b => b.name),
      summaryMetrics: {
        totalSpend: Math.round(adsList.reduce((s, a) => s + a.spend, 0)),
        totalImpressions: adsList.reduce((s, a) => s + a.impressions, 0),
        totalConversions: adsList.reduce((s, a) => s + a.results, 0),
        overallReach: adsList.reduce((s, a) => s + a.reach, 0)
      },
      topPerformers,
      underperforming,
      anomalies
    };
  };

  const geminiPayload = {
    daily: getSummaryPayload(dailyLayout, dailyAds),
    weekly: getSummaryPayload(weeklyLayout, weeklyAds),
    monthly: getSummaryPayload(monthlyLayout, monthlyAds)
  };

  // 6. Request copywriting and qualitative insights from Gemini
  const prompt = `
  You are an expert advertising data analyst and copywriter. Analyze this statistical summary of ad campaigns:
  
  Daily: ${JSON.stringify(geminiPayload.daily, null, 2)}
  Weekly: ${JSON.stringify(geminiPayload.weekly, null, 2)}
  Monthly: ${JSON.stringify(geminiPayload.monthly, null, 2)}
  
  For each timeframe (daily, weekly, monthly), generate:
  1. A professional Indonesian WhatsApp summary paragraph highlighting total spend, top brand category, key performance indicators, and concrete optimization advice.
  2. Exactly 6 qualitative insight cards. Each card must have:
     - "headline": Short punchy title (Indonesian)
     - "body": Highly specific copy explaining the observation and action (Indonesian)
     - "icon": Icon name (choose ONLY from: "ti ti-trophy", "ti ti-flame", "ti ti-chart-line", "ti ti-alert-triangle", "ti ti-users", "ti ti-bulb")
     - "color": A hex color code matching the status (e.g. green/emerald for good, orange/amber for warning, red/rose for danger, blue/indigo for info).
     
  Output a single JSON object matching this structure:
  {
    "daily": {
      "whatsAppSummary": "Paragraph text...",
      "insights": [
        { "headline": "...", "body": "...", "icon": "...", "color": "#HEX" }
      ]
    },
    "weekly": {
      "whatsAppSummary": "Paragraph text...",
      "insights": [ ... ]
    },
    "monthly": {
      "whatsAppSummary": "Paragraph text...",
      "insights": [ ... ]
    }
  }
  
  Make sure your analysis is highly factual, referencing the values in the summary. Avoid general placeholders. Return ONLY the JSON object. Do not wrap in markdown \`\`\`json block.
  `;

  console.log('Sending condensed metrics to Gemini for NLP copywriting...');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  let responseText = '';
  let aiTextData;

  // Retry helper with exponential backoff
  async function generateContentWithRetry(modelName, retries = 4, delay = 3000) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Attempting analysis with model: ${modelName} (Attempt ${i + 1}/${retries})...`);
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });
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
    responseText = await generateContentWithRetry('gemini-2.5-flash', 4, 3000);
  } catch (err) {
    console.error('All attempts to call Gemini API failed:', err.message);
    process.exit(1);
  }

  try {
    aiTextData = JSON.parse(responseText);
    console.log('Successfully received and parsed dynamic copywriting from Gemini.');
  } catch (err) {
    console.error('Failed to parse Gemini response text as JSON:', err.message);
    console.error('Raw Response:', responseText);
    process.exit(1);
  }

  // 7. Merge NLP insights back into our programmatically built layouts
  const mergeInsights = (layout, textData) => {
    layout.whatsAppSummary = textData.whatsAppSummary;
    
    // Append the insights widget to the widgets list
    layout.widgets.splice(5, 0, {
      type: "insights",
      gridSpan: 12,
      title: "Insight Utama",
      items: textData.insights
    });
  };

  mergeInsights(dailyLayout, aiTextData.daily);
  mergeInsights(weeklyLayout, aiTextData.weekly);
  mergeInsights(monthlyLayout, aiTextData.monthly);

  // Compile final JSON structure for template.html
  const finalDashboardJson = {
    title: weeklyAds.some(a => a.results > 0) ? "Laporan Performa Iklan Multi-Brand" : "Laporan Performa Kampanye Awareness",
    subtitle: `Periode: ${weeklyLayout.dateRange}`,
    theme: {
      primary: Object.values(brandsMap)[0]?.color || "#3B82F6"
    },
    brands: brandsMap,
    timeframes: {
      daily: dailyLayout,
      weekly: weeklyLayout,
      monthly: monthlyLayout
    }
  };

  // 8. Compile report.html
  console.log('Compiling final dashboard report...');
  const templatePath = path.join(__dirname, 'template.html');
  const outputPath = path.join(__dirname, 'report.html');

  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace('{DAILY_WEEKLY_MONTHLY_DATA_PLACEHOLDER}', JSON.stringify(finalDashboardJson, null, 2));
  fs.writeFileSync(outputPath, html, 'utf8');
  
  console.log(`report.html compiled successfully at: ${outputPath}`);

  console.log('\n==================================================================');
  console.log('Gemini-Generated WhatsApp Broadcast Summaries (Preview)');
  console.log('==================================================================');
  
  console.log('\n[DAILY BROADCAST]');
  console.log(`📊 *LAPORAN HARIAN*: ${finalDashboardJson.timeframes.daily.dateRange}`);
  console.log(finalDashboardJson.timeframes.daily.whatsAppSummary);
  
  console.log('\n[WEEKLY BROADCAST]');
  console.log(`📈 *LAPORAN MINGGUAN*: ${finalDashboardJson.timeframes.weekly.dateRange}`);
  console.log(finalDashboardJson.timeframes.weekly.whatsAppSummary);
  
  console.log('\n[MONTHLY BROADCAST]');
  console.log(`🏆 *LAPORAN BULANAN*: ${finalDashboardJson.timeframes.monthly.dateRange}`);
  console.log(finalDashboardJson.timeframes.monthly.whatsAppSummary);
  console.log('==================================================================\n');

  console.log('Automation execution completed successfully!');

  const jsonResult = {
    daily: {
      summary: finalDashboardJson.timeframes.daily.whatsAppSummary,
      dateRange: finalDashboardJson.timeframes.daily.dateRange
    },
    weekly: {
      summary: finalDashboardJson.timeframes.weekly.whatsAppSummary,
      dateRange: finalDashboardJson.timeframes.weekly.dateRange
    },
    monthly: {
      summary: finalDashboardJson.timeframes.monthly.whatsAppSummary,
      dateRange: finalDashboardJson.timeframes.monthly.dateRange
    }
  };
  console.log('::JSON_RESULT::' + JSON.stringify(jsonResult));
}

main();
