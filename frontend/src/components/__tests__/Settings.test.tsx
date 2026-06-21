import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import Settings from '../Settings';

describe('Settings component', () => {
  const showToastMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/settings/gemini-models')) {
        return Promise.resolve({
          json: () => Promise.resolve([{ name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' }])
        } as unknown as Response);
      }
      if (url.includes('/api/whatsapp/groups')) {
        return Promise.resolve({
          json: () => Promise.resolve([])
        } as unknown as Response);
      }
      if (url.includes('/api/settings')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            gemini_api_key: 'key-1234...-key',
            gemini_model: 'gemini-1.5-flash',
            whatsapp_group_jid: 'group-123',
            system_instruction: 'Initial instructions',
          })
        } as unknown as Response);
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });
  });

  test('loads and displays current settings', async () => {
    render(<Settings showToast={showToastMock} />);

    // Wait for the loading state to finish
    await waitFor(() => expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument());

    // Should display settings once loaded
    expect(screen.getByDisplayValue('Initial instructions')).toBeInTheDocument();
  });
});
