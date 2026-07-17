const { splitCSVLine, normalizeMetaInsights, getCsvDateRange, parseCSV } = require('../../ads-analysis/automation');

describe('Meta Ads Analysis Utilities (automation.js)', () => {
  describe('getCsvDateRange', () => {
    test('detects min/max reporting dates from Indonesian Meta export headers', () => {
      const csv = [
        'Awal pelaporan,Akhir pelaporan,Nama iklan,Jumlah yang dibelanjakan (IDR),Impresi,Jangkauan,Hasil',
        '2026-05-14,2026-05-21,Ad A,10000,100,90,2',
        '2026-05-10,2026-05-18,Ad B,20000,200,180,4',
        '2026-05-16,2026-05-25,Ad C,5000,50,40,1',
      ].join('\n');

      const range = getCsvDateRange(csv);
      expect(range.rowCount).toBe(3);
      expect(range.dateFrom).toBe('2026-05-10');
      expect(range.dateTo).toBe('2026-05-25');
    });

    test('parseCSV returns 0 rows when filter has no overlap with CSV dates', () => {
      const csv = [
        'Awal pelaporan,Akhir pelaporan,Nama iklan,Jumlah yang dibelanjakan (IDR),Impresi,Jangkauan,Hasil',
        '2026-05-14,2026-05-21,Ad A,10000,100,90,2',
      ].join('\n');
      expect(parseCSV(csv, '2026-07-01', '2026-07-17')).toHaveLength(0);
      expect(parseCSV(csv, '2026-05-14', '2026-05-21').length).toBeGreaterThan(0);
    });
  });

  describe('splitCSVLine', () => {
    test('splits basic comma-separated values', () => {
      const line = 'value1,value2,value3';
      const result = splitCSVLine(line);
      expect(result).toEqual(['value1', 'value2', 'value3']);
    });

    test('respects double quotes containing commas', () => {
      const line = '"value1, with comma",value2,"value3, another"';
      const result = splitCSVLine(line);
      expect(result).toEqual(['value1, with comma', 'value2', 'value3, another']);
    });

    test('handles empty fields', () => {
      const line = 'value1,,value3';
      const result = splitCSVLine(line);
      expect(result).toEqual(['value1', '', 'value3']);
    });
  });

  describe('normalizeMetaInsights', () => {
    test('correctly maps raw Meta API items to unified ad schema', () => {
      const rawData = [
        {
          ad_name: 'Promo Kue Cokelat',
          spend: '150000.50',
          impressions: '10000',
          reach: '8500',
          quality_ranking: 'ABOVE_AVERAGE',
          engagement_rate_ranking: 'AVERAGE',
          adset_name: 'Adset Cokelat',
          actions: [
            { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' }
          ]
        }
      ];

      const normalized = normalizeMetaInsights(rawData);
      expect(normalized).toHaveLength(1);
      
      const item = normalized[0];
      expect(item.name).toBe('Promo Kue Cokelat');
      expect(item.spend).toBe(150000.50);
      expect(item.impressions).toBe(10000);
      expect(item.reach).toBe(8500);
      expect(item.results).toBe(10);
      expect(item.cpr).toBe(15000.05); // spend / results
      expect(item.newContacts).toBe(10);
      expect(item.quality).toBe('Di atas rata-rata');
      expect(item.engagement).toBe('Rata-rata');
      expect(item.adset).toBe('Adset Cokelat');
    });

    test('defaults values for missing fields', () => {
      const rawData = [{}];
      const normalized = normalizeMetaInsights(rawData);
      
      expect(normalized).toHaveLength(1);
      const item = normalized[0];
      expect(item.name).toBe('Unnamed Ad');
      expect(item.spend).toBe(0);
      expect(item.impressions).toBe(0);
      expect(item.reach).toBe(0);
      expect(item.results).toBe(0);
      expect(item.cpr).toBe(0);
      expect(item.quality).toBe('-');
    });
  });
});
