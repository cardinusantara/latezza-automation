const { splitCSVLine, normalizeMetaInsights } = require('../../ads-analysis/automation');

describe('Meta Ads Analysis Utilities (automation.js)', () => {
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
