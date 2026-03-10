import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PasswordGateProps {
  onUnlock: () => void;
}

export default function PasswordGate({ onUnlock }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // On mount, verify existing token
  useEffect(() => {
    const token = sessionStorage.getItem('canvas_session_token');
    if (!token) {
      setChecking(false);
      return;
    }
    supabase.functions.invoke('verify-password', {
      body: { action: 'verify_token', token },
    }).then(({ data }) => {
      if (data?.valid) {
        onUnlock();
      } else {
        sessionStorage.removeItem('canvas_session_token');
      }
      setChecking(false);
    }).catch(() => {
      setChecking(false);
    });
  }, [onUnlock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-password', {
        body: { password },
      });
      if (fnError || !data?.valid) {
        setError(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
      } else {
        // Store cryptographic token instead of plain flag
        sessionStorage.setItem('canvas_session_token', data.token);
        onUnlock();
      }
    } catch {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div
        className={`w-full max-w-sm mx-4 p-8 rounded-2xl border border-border bg-card shadow-2xl transition-transform ${shake ? 'animate-shake' : ''}`}
      >
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Enter Password</h1>
          <p className="text-sm text-muted-foreground text-center">This app is password protected. Please enter the password to continue.</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className={error ? 'border-destructive' : ''}
          />
          {error && <p className="text-sm text-destructive text-center">Incorrect password. Try again.</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verifying...' : 'Unlock'}
          </Button>
        </form>
      </div>
    </div>
  );
}
