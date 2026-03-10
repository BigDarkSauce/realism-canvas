/**
 * Export and Import all user data (documents, saves, folders, library config).
 */
import { supabase } from '@/integrations/supabase/client';

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  library: any;
  documents: any[];
  saves: any[];
  folders: any[];
}

export async function exportAllData(): Promise<ExportBundle> {
  // Fetch documents via RPC (no access_key exposed)
  const { data: documents, error: docErr } = await supabase.rpc('rpc_export_documents');
  if (docErr) throw new Error(`Failed to fetch documents: ${docErr.message}`);

  // Fetch all saves
  const { data: saves, error: saveErr } = await supabase
    .from('canvas_saves')
    .select('*');
  if (saveErr) throw new Error(`Failed to fetch saves: ${saveErr.message}`);

  // Fetch all folders
  const { data: folders, error: folderErr } = await supabase
    .from('save_folders')
    .select('*');
  if (folderErr) throw new Error(`Failed to fetch folders: ${folderErr.message}`);

  // Get library config from localStorage
  let library = null;
  try {
    const raw = localStorage.getItem('canvas_library');
    if (raw) library = JSON.parse(raw);
  } catch {}

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    library,
    documents: documents || [],
    saves: saves || [],
    folders: folders || [],
  };
}

const MAX_CANVAS_DATA_SIZE = 5 * 1024 * 1024; // 5 MB per document
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOCUMENTS = 500;
const MAX_SAVES = 1000;
const MAX_FOLDERS = 200;

function isValidUUID(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function isValidDocument(doc: unknown): doc is { id: string; name: string; access_key?: string; canvas_data?: any; created_at: string } {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Record<string, unknown>;
  if (!isValidUUID(d.id)) return false;
  if (typeof d.name !== 'string' || d.name.length === 0 || d.name.length > 500) return false;
  if (typeof d.created_at !== 'string') return false;
  if (d.canvas_data !== undefined && JSON.stringify(d.canvas_data).length > MAX_CANVAS_DATA_SIZE) return false;
  return true;
}

function isValidSave(save: unknown): save is { id: string; name: string; document_id?: string; folder_id?: string; canvas_data: any; created_at: string } {
  if (!save || typeof save !== 'object') return false;
  const s = save as Record<string, unknown>;
  if (!isValidUUID(s.id)) return false;
  if (typeof s.name !== 'string' || s.name.length > 500) return false;
  if (s.document_id !== null && s.document_id !== undefined && !isValidUUID(s.document_id)) return false;
  if (s.folder_id !== null && s.folder_id !== undefined && !isValidUUID(s.folder_id)) return false;
  if (s.canvas_data !== undefined && JSON.stringify(s.canvas_data).length > MAX_CANVAS_DATA_SIZE) return false;
  return true;
}

function isValidFolder(folder: unknown): folder is { id: string; document_id: string; name: string; created_at: string } {
  if (!folder || typeof folder !== 'object') return false;
  const f = folder as Record<string, unknown>;
  if (!isValidUUID(f.id)) return false;
  if (!isValidUUID(f.document_id)) return false;
  if (typeof f.name !== 'string' || f.name.length > 200) return false;
  return true;
}

export async function importAllData(bundle: ExportBundle): Promise<{ documents: number; saves: number; folders: number }> {
  if (!bundle || bundle.version !== 1) {
    throw new Error('Invalid or unsupported backup file version');
  }
  if (!Array.isArray(bundle.documents)) {
    throw new Error('Invalid backup: documents must be an array');
  }

  let docsImported = 0;
  let savesImported = 0;
  let foldersImported = 0;

  // Validate & import documents via RPC (upsert)
  const validDocs = (bundle.documents || []).filter(isValidDocument).slice(0, MAX_DOCUMENTS);
  for (const doc of validDocs) {
    try {
      const { error } = await supabase.rpc('rpc_upsert_document', {
        p_id: doc.id,
        p_name: doc.name,
        p_access_key: doc.access_key || '',
        p_canvas_data: doc.canvas_data || {},
        p_created_at: doc.created_at,
      });
      if (!error) docsImported++;
    } catch {
      // Skip invalid records
    }
  }

  // Validate & import save folders first (saves reference them)
  const validFolders = (bundle.folders || []).filter(isValidFolder).slice(0, MAX_FOLDERS);
  for (const folder of validFolders) {
    try {
      const { error } = await supabase
        .from('save_folders')
        .upsert(folder, { onConflict: 'id' });
      if (!error) foldersImported++;
    } catch {
      // Skip invalid records
    }
  }

  // Validate & import saves
  const validSaves = (bundle.saves || []).filter(isValidSave).slice(0, MAX_SAVES);
  for (const save of validSaves) {
    try {
      const { error } = await supabase
        .from('canvas_saves')
        .upsert(save, { onConflict: 'id' });
      if (!error) savesImported++;
    } catch {
      // Skip invalid records
    }
  }

  // Restore library config (validate it's an object with expected shape)
  if (bundle.library && typeof bundle.library === 'object' && !Array.isArray(bundle.library)) {
    const lib = bundle.library as Record<string, unknown>;
    if (Array.isArray(lib.folders) && Array.isArray(lib.unsorted)) {
      localStorage.setItem('canvas_library', JSON.stringify(bundle.library));
    }
  }

  return { documents: docsImported, saves: savesImported, folders: foldersImported };
}

export function downloadJson(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
