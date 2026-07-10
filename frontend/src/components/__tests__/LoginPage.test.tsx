import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/components/LoginPage';

const mockLogin = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  test('renders login form with password input and submit button', () => {
    render(<LoginPage />);

    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByText('Masuk')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Access')).toBeInTheDocument();
  });

  test('shows error when submitting empty password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText('Masuk'));

    expect(screen.getByText('Password wajib diisi.')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('calls login with password on submit', async () => {
    mockLogin.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Password'), 'admin123');
    await user.click(screen.getByText('Masuk'));

    expect(mockLogin).toHaveBeenCalledWith('admin123');
  });

  test('shows error message when login fails', async () => {
    mockLogin.mockResolvedValue({ success: false, error: 'Password salah.' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Password'), 'wrong');
    await user.click(screen.getByText('Masuk'));

    await waitFor(() => {
      expect(screen.getByText('Password salah.')).toBeInTheDocument();
    });
  });

  test('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const input = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');

    const toggleButton = screen.getByRole('button', { name: '' });
    await user.click(toggleButton);

    expect(input.type).toBe('text');

    await user.click(toggleButton);
    expect(input.type).toBe('password');
  });

  test('disables form while submitting', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Password'), 'admin123');
    await user.click(screen.getByText('Masuk'));

    expect(screen.getByText('Memverifikasi...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeDisabled();
  });
});
