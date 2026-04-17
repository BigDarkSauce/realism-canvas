import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { hashSHA256 } from '@/lib/crypto';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeSelector';
import {
  FolderPlus,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Pencil,
  Check,
  X,
  FilePlus,
  Lock,
  ArrowLeft,
  Mail,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────
interface LibraryItem {
  documentId: string;
  displayName: string;
}

interface LibraryFolder {
  id: string;
  name: string;
  items: LibraryItem[];
}

interface LibraryData {
  folders: LibraryFolder[];
  unsorted: LibraryItem[];
}

function getLibraryKey(): string {
  const token = sessionStorage.getItem('library_session_token') || 'default';
  return `canvas_library_${token}`;
}

function loadLibrary(): LibraryData {
  try {
    const raw = localStorage.getItem(getLibraryKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  return { folders: [], unsorted: [] };
}

function saveLibrary(data: LibraryData) {
  localStorage.setItem(getLibraryKey(), JSON.stringify(data));
}

function generateId() {
  return crypto.randomUUID();
}

// ─── Library Gate (Account Login → Library Password) ──────────
type GateView = 'loading' | 'login' | 'create' | 'forgot' | 'library_password' | 'forgot_library';

function LibraryGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [view, setView] = useState<GateView>('loading');
  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [confirmAccountPassword, setConfirmAccountPassword] = useState('');
  const [libraryPassword, setLibraryPassword] = useState('');
  const [confirmLibraryPassword, setConfirmLibraryPassword] = useState('');
  const [enteredLibraryPassword, setEnteredLibraryPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('rpc_has_library_password').then(({ data }) => {
      setView(data ? 'login' : 'create');
    });
  }, []);

  // Always require manual login
  useEffect(() => {
    sessionStorage.removeItem('library_session_token');
  }, []);

  // Step 1a: Login with email + account password → then ask for library password
  const handleLogin = async () => {
    if (!email.trim() || !accountPassword.trim()) {
      toast.error('Enter your email and password');
      return;
    }
    setLoading(true);
    const accountHash = await hashSHA256(accountPassword);
    const { data: valid, error } = await supabase.rpc('rpc_login_account' as any, {
      p_email: email.trim().toLowerCase(),
      p_account_hash: accountHash,
    });
    if (error || !valid) {
      toast.error('Incorrect email or password');
      setLoading(false);
      return;
    }
    setLoading(false);
    setView('library_password');
  };

  // Step 1b: Create account with email + account password + library password
  const handleCreate = async () => {
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!accountPassword.trim() || accountPassword.length < 4) {
      toast.error('Account password must be at least 4 characters');
      return;
    }
    if (accountPassword !== confirmAccountPassword) {
      toast.error('Account passwords do not match');
      return;
    }
    if (!libraryPassword.trim() || libraryPassword.length < 4) {
      toast.error('Library password must be at least 4 characters');
      return;
    }
    if (libraryPassword !== confirmLibraryPassword) {
      toast.error('Library passwords do not match');
      return;
    }
    setLoading(true);
    const accountHash = await hashSHA256(accountPassword);
    const libHash = await hashSHA256(libraryPassword);
    const { error } = await supabase.rpc('rpc_create_library_account_v2' as any, {
      p_email: email.trim().toLowerCase(),
      p_account_hash: accountHash,
      p_library_hash: libHash,
    });
    if (error) {
      if (error.message.includes('Email already')) {
        toast.error('This email is already registered');
      } else if (error.message.includes('Library password already')) {
        toast.error('This library password is already in use. Choose a unique one.');
      } else {
        toast.error('Failed to create account');
      }
      setLoading(false);
      return;
    }
    sessionStorage.setItem('library_session_token', libHash);
    toast.success('Account created! Welcome to your library.');
    setLoading(false);
    onUnlocked();
  };

  // Step 2: Enter library password (after successful account login)
  const handleLibraryPassword = async () => {
    if (!enteredLibraryPassword.trim()) {
      toast.error('Enter your library password');
      return;
    }
    setLoading(true);
    const hash = await hashSHA256(enteredLibraryPassword);
    const { data: valid, error } = await supabase.rpc('rpc_verify_library_password', { p_hash: hash });
    if (error || !valid) {
      toast.error('Incorrect library password');
      setLoading(false);
      return;
    }
    sessionStorage.setItem('library_session_token', hash);
    setLoading(false);
    onUnlocked();
  };

  const handleForgotPassword = async (resetMode: 'account' | 'library' = 'account') => {
    if (!email.trim()) {
      toast.error('Enter the email you registered with');
      return;
    }
    setLoading(true);
    const resetUrl = `${window.location.origin}/reset-library-password`;
    const { error } = await supabase.functions.invoke('send-reset-email', {
      body: { email: email.trim().toLowerCase(), resetUrl, mode: resetMode },
    });
    if (error) {
      toast.error('Failed to send reset email. Try again.');
    } else {
      toast.success('If an account exists with this email, a reset link has been sent.');
    }
    setLoading(false);
  };

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">
            {view === 'login' && 'Sign In'}
            {view === 'create' && 'Create Account'}
            {view === 'forgot' && 'Reset Password'}
            {view === 'library_password' && 'Enter Library Password'}
            {view === 'forgot_library' && 'Reset Sign-In Password'}
          </h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-lg">
          {view === 'login' && (
            <>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
              />
              <Input
                type="password"
                value={accountPassword}
                onChange={e => setAccountPassword(e.target.value)}
                placeholder="Account password"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <Button onClick={handleLogin} disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
              <div className="flex justify-between">
                <button
                  className="text-sm text-primary hover:underline"
                  onClick={() => { setView('create'); setAccountPassword(''); setEmail(''); }}
                >
                  Create account
                </button>
                <button
                  className="text-sm text-muted-foreground hover:underline"
                  onClick={() => { setView('forgot'); setAccountPassword(''); setEmail(''); }}
                >
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {view === 'create' && (
            <>
              <p className="text-sm text-muted-foreground">
                Create an account. You'll also set a <strong>library password</strong> — a separate,
                globally unique password used to unlock your library each time you sign in.
              </p>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
              />
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Password</p>
                <Input
                  type="password"
                  value={accountPassword}
                  onChange={e => setAccountPassword(e.target.value)}
                  placeholder="Create account password (min 4 chars)"
                />
                <Input
                  type="password"
                  value={confirmAccountPassword}
                  onChange={e => setConfirmAccountPassword(e.target.value)}
                  placeholder="Confirm account password"
                />
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Library Password</p>
                <p className="text-xs text-muted-foreground">This must be unique across all libraries and is used to access your files.</p>
                <Input
                  type="password"
                  value={libraryPassword}
                  onChange={e => setLibraryPassword(e.target.value)}
                  placeholder="Create library password (min 4 chars)"
                />
                <Input
                  type="password"
                  value={confirmLibraryPassword}
                  onChange={e => setConfirmLibraryPassword(e.target.value)}
                  placeholder="Confirm library password"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <Button onClick={handleCreate} disabled={loading} className="w-full">
                {loading ? 'Creating...' : 'Create Account'}
              </Button>
              <button
                className="text-sm text-primary hover:underline w-full text-center"
                onClick={() => { setView('login'); setAccountPassword(''); setEmail(''); setLibraryPassword(''); setConfirmLibraryPassword(''); setConfirmAccountPassword(''); }}
              >
                Already have an account? Sign in
              </button>
            </>
          )}

          {view === 'library_password' && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the library password you set when creating your account.
              </p>
              <Input
                type="password"
                value={enteredLibraryPassword}
                onChange={e => setEnteredLibraryPassword(e.target.value)}
                placeholder="Library password"
                onKeyDown={e => e.key === 'Enter' && handleLibraryPassword()}
                autoFocus
              />
              <Button onClick={handleLibraryPassword} disabled={loading} className="w-full">
                {loading ? 'Checking...' : 'Unlock Library'}
              </Button>
              <div className="flex justify-between">
                <button
                  className="text-sm text-muted-foreground hover:underline"
                  onClick={() => { setView('login'); setEnteredLibraryPassword(''); setAccountPassword(''); setEmail(''); }}
                >
                  Back to sign in
                </button>
                <button
                  className="text-sm text-primary hover:underline"
                  onClick={() => { setView('forgot_library'); setEnteredLibraryPassword(''); }}
                >
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {view === 'forgot' && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the email you registered with. We'll send you a link to reset your <strong>sign-in password</strong>. Your library password and all your files and folders will remain unchanged.
              </p>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Your registered email"
                onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                autoFocus
              />
              <Button onClick={handleForgotPassword} disabled={loading} className="w-full gap-2">
                <Mail className="h-4 w-4" />
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <button
                className="text-sm text-primary hover:underline w-full text-center"
                onClick={() => { setView('login'); setEmail(''); }}
              >
                Back to sign in
              </button>
            </>
          )}

          {view === 'forgot_library' && (
            <>
              <p className="text-sm text-muted-foreground">
                We'll send a reset link to your registered email so you can set a new <strong>sign-in password</strong>. Your library password and all your existing files and folders will remain unchanged.
              </p>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Your registered email"
                onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                autoFocus
              />
              <Button onClick={handleForgotPassword} disabled={loading} className="w-full gap-2">
                <Mail className="h-4 w-4" />
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <button
                className="text-sm text-primary hover:underline w-full text-center"
                onClick={() => { setView('login'); setEmail(''); setEnteredLibraryPassword(''); }}
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Library Page ────────────────────────────────────────
export default function LibraryPage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [library, setLibrary] = useState<LibraryData>({ folders: [], unsorted: [] });

  // Create document form (no key needed — uses library session token as access key)
  const [createName, setCreateName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createTargetFolder, setCreateTargetFolder] = useState<string | null>(null);

  // New folder
  const [newFolderName, setNewFolderName] = useState('');

  // Expanded folders
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Rename folder
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    saveLibrary(library);
  }, [library]);

  // Reload library data when unlocked (so it uses the correct per-account key)
  useEffect(() => {
    if (unlocked) {
      setLibrary(loadLibrary());
    }
  }, [unlocked]);

  const handleLogout = () => {
    sessionStorage.removeItem('library_session_token');
    setUnlocked(false);
    setLibrary({ folders: [], unsorted: [] });
  };

  if (!unlocked) {
    return <LibraryGate onUnlocked={() => setUnlocked(true)} />;
  }

  const getAccessKey = () => sessionStorage.getItem('library_session_token') || '';

  const handleCreateDocument = async () => {
    if (!createName.trim()) {
      toast.error('Enter a file name');
      return;
    }
    setCreateLoading(true);
    const hashedName = await hashSHA256(createName.trim());
    const accessKey = getAccessKey();

    const { data, error } = await supabase.rpc('rpc_create_document', {
      p_name: hashedName,
      p_access_key: accessKey,
    });
    if (error) {
      if (error.message.includes('already exists')) {
        toast.error('A file with this name already exists');
      } else {
        toast.error('Failed to create file');
      }
      setCreateLoading(false);
      return;
    }

    sessionStorage.setItem(`doc_key_${data}`, accessKey);
    const newItem: LibraryItem = { documentId: data as string, displayName: createName.trim() };
    setLibrary(prev => {
      if (createTargetFolder) {
        return {
          ...prev,
          folders: prev.folders.map(f =>
            f.id === createTargetFolder ? { ...f, items: [...f.items, newItem] } : f
          ),
        };
      }
      return { ...prev, unsorted: [...prev.unsorted, newItem] };
    });

    toast.success('File created!');
    setCreateName('');
    setCreateTargetFolder(null);
    setCreateLoading(false);
  };

  const removeItem = (documentId: string) => {
    setLibrary(prev => ({
      folders: prev.folders.map(f => ({
        ...f,
        items: f.items.filter(i => i.documentId !== documentId),
      })),
      unsorted: prev.unsorted.filter(i => i.documentId !== documentId),
    }));
    toast.success('Removed from library');
  };

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    setLibrary(prev => ({
      ...prev,
      folders: [...prev.folders, { id: generateId(), name: newFolderName.trim(), items: [] }],
    }));
    setNewFolderName('');
    toast.success('Folder created');
  };

  const deleteFolder = (folderId: string) => {
    setLibrary(prev => {
      const folder = prev.folders.find(f => f.id === folderId);
      return {
        folders: prev.folders.filter(f => f.id !== folderId),
        unsorted: [...prev.unsorted, ...(folder?.items || [])],
      };
    });
    toast.success('Folder deleted, items moved to unsorted');
  };

  const renameFolder = (folderId: string) => {
    if (!renameValue.trim()) return;
    setLibrary(prev => ({
      ...prev,
      folders: prev.folders.map(f =>
        f.id === folderId ? { ...f, name: renameValue.trim() } : f
      ),
    }));
    setRenamingFolder(null);
    setRenameValue('');
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openDocument = (item: LibraryItem) => {
    // Set access key for the document session
    const accessKey = getAccessKey();
    sessionStorage.setItem(`doc_key_${item.documentId}`, accessKey);
    navigate(`/canvas/${item.documentId}`);
  };

  const renderItem = (item: LibraryItem) => (
    <div
      key={item.documentId}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 group"
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span
        className="flex-1 text-sm text-foreground truncate cursor-pointer hover:underline"
        onClick={() => openDocument(item)}
      >
        {item.displayName}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
        onClick={() => removeItem(item.documentId)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground flex-1">My Library</h1>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to main screen
          </Button>
        </div>

        {/* Create new document form — no key field */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-lg">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FilePlus className="h-4 w-4 text-primary" /> Create New Document
          </h2>
          <Input
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            placeholder="New file name"
            maxLength={100}
            onKeyDown={e => e.key === 'Enter' && handleCreateDocument()}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
              value={createTargetFolder ?? ''}
              onChange={e => setCreateTargetFolder(e.target.value || null)}
            >
              <option value="">Unsorted</option>
              {library.folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleCreateDocument} disabled={createLoading}>
              {createLoading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-muted-foreground" />
          <Input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="max-w-[200px] h-8 text-sm"
            maxLength={50}
            onKeyDown={e => e.key === 'Enter' && createFolder()}
          />
          <Button size="sm" variant="outline" onClick={createFolder}>Create</Button>
        </div>

        {/* Folders */}
        {library.folders.map(folder => (
          <div key={folder.id} className="bg-card border border-border rounded-xl overflow-hidden shadow">
            <div
              className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/30"
              onClick={() => toggleExpand(folder.id)}
            >
              {expanded[folder.id] ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Folder className="h-4 w-4 text-primary" />
              {renamingFolder === folder.id ? (
                <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    className="h-7 text-sm flex-1"
                    maxLength={50}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && renameFolder(folder.id)}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => renameFolder(folder.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setRenamingFolder(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-medium text-foreground">{folder.name}</span>
              )}
              <span className="text-xs text-muted-foreground">{folder.items.length}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={e => {
                  e.stopPropagation();
                  setRenamingFolder(folder.id);
                  setRenameValue(folder.name);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={e => {
                  e.stopPropagation();
                  deleteFolder(folder.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {expanded[folder.id] && (
              <div className="px-3 pb-3 space-y-1 pl-8">
                {folder.items.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">Empty folder</p>
                )}
                {folder.items.map(renderItem)}
              </div>
            )}
          </div>
        ))}

        {/* Unsorted items */}
        {library.unsorted.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3 shadow space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Unsorted</h3>
            {library.unsorted.map(renderItem)}
          </div>
        )}

        {library.folders.length === 0 && library.unsorted.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Your library is empty. Create a document above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
