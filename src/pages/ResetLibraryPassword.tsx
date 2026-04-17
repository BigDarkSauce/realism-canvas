import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { hashSHA256 } from '@/lib/crypto';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, CheckCircle, XCircle } from 'lucide-react';

export default function ResetLibraryPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [verifying, setVerifying] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }
    supabase.rpc('rpc_verify_reset_token' as any, { p_token: token }).then(({ data, error }) => {
      if (!error && data) {
        setEmail(data as string);
      }
      setVerifying(false);
    });
  }, [token]);

  const handleReset = async () => {
    if (!password.trim() || password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    const hash = await hashSHA256(password);

    const { data: updated, error } = await supabase.rpc('rpc_update_account_password' as any, {
      p_email: email,
      p_new_account_hash: hash,
    });
    if (error || !updated) {
      toast.error('Failed to update password. Please try requesting a new reset link.');
      setLoading(false);
      return;
    }
    setDone(true);
    toast.success('Sign-in password updated! You can now log in with your new password.');
    setLoading(false);
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verifying reset link...</p>
      </div>
    );
  }

  if (!token || !email) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-lg text-center space-y-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Invalid or Expired Link</h1>
          <p className="text-sm text-muted-foreground">This reset link is invalid or has expired. Please request a new one.</p>
          <Button onClick={() => navigate('/')} className="w-full">Go to App</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-lg text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Password Updated!</h1>
          <p className="text-sm text-muted-foreground">You can now sign in with your new account password. Your library password is unchanged.</p>
          <Button onClick={() => navigate('/')} className="w-full">Open App</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Set New Sign-In Password</h1>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-lg">
          <p className="text-sm text-muted-foreground">Choose a new <strong>account password</strong> — this is the one you use to sign in with your email. (Your separate library password is not affected.)</p>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="New password (min 4 chars)"
            autoFocus
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            onKeyDown={e => e.key === 'Enter' && handleReset()}
          />
          <Button onClick={handleReset} disabled={loading} className="w-full">
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </div>
    </div>
  );
}
