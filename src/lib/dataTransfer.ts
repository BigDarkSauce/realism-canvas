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

export async function importAllData(bundle: ExportBundle): Promise<{ documents: number; saves: number; folders: number }> {
  let docsImported = 0;
  let savesImported = 0;
  let foldersImported = 0;

  // Import documents via RPC (upsert)
  if (bundle.documents?.length) {
    for (const doc of bundle.documents) {
      const { error } = await supabase.rpc('rpc_upsert_document', {
        p_id: doc.id,
        p_name: doc.name,
        p_access_key: doc.access_key || '',
        p_canvas_data: doc.canvas_data || {},
        p_created_at: doc.created_at,
      });
      if (!error) docsImported++;
    }
  }

  // Import save folders first (saves reference them)
  if (bundle.folders?.length) {
    for (const folder of bundle.folders) {
      const { error } = await supabase
        .from('save_folders')
        .upsert(folder, { onConflict: 'id' });
      if (!error) foldersImported++;
    }
  }

  // Import saves
  if (bundle.saves?.length) {
    for (const save of bundle.saves) {
      const { error } = await supabase
        .from('canvas_saves')
        .upsert(save, { onConflict: 'id' });
      if (!error) savesImported++;
    }
  }

  // Restore library config
  if (bundle.library) {
    localStorage.setItem('canvas_library', JSON.stringify(bundle.library));
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
