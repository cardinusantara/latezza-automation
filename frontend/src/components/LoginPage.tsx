import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { IconLock, IconEye, IconEyeOff, IconLoader2 } from '@tabler/icons-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Password wajib diisi.');
      return;
    }
    setIsSubmitting(true);
    const result = await login(password);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Login gagal.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <IconLock size={28} className="text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Dashboard Access</h1>
            <p className="mt-1 text-sm text-muted-foreground">Masukkan password untuk melanjutkan</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? (
                <IconLoader2 size={18} className="animate-spin" />
              ) : (
                <IconLock size={18} />
              )}
              <span>{isSubmitting ? 'Memverifikasi...' : 'Masuk'}</span>
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Latezza WhatsApp AI Agent Dashboard
        </p>
      </div>
    </div>
  );
}
