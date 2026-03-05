import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Check, Monitor } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => setInstalled(true));

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <img src="/pwa-icon-192.png" alt="Canvas Board" className="w-24 h-24 mx-auto rounded-2xl shadow-lg" />
        <h1 className="text-3xl font-bold text-foreground">Canvas Board</h1>
        <p className="text-muted-foreground">
          Install Canvas Board as a desktop app for quick access, offline support, and a native feel.
        </p>

        {installed ? (
          <div className="flex items-center justify-center gap-2 text-primary">
            <Check className="w-5 h-5" />
            <span className="font-medium">App installed! You can open it from your desktop.</span>
          </div>
        ) : deferredPrompt ? (
          <Button size="lg" onClick={handleInstall} className="gap-2">
            <Download className="w-5 h-5" />
            Install App
          </Button>
        ) : (
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <Monitor className="w-5 h-5" />
              <span className="font-medium">Manual install:</span>
            </div>
            <p>
              <strong>Chrome:</strong> Click the install icon (⊕) in the address bar, or go to Menu → "Install Canvas Board"
            </p>
            <p>
              <strong>Edge:</strong> Click Menu → Apps → "Install this site as an app"
            </p>
          </div>
        )}

        <a href="/" className="inline-block text-sm text-primary hover:underline mt-4">
          ← Back to Canvas
        </a>
      </div>
    </div>
  );
}
