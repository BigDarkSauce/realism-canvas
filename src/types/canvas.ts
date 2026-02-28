export interface Block {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fileUrl?: string;
  fileName?: string;
  groupId?: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

export interface Group {
  id: string;
  label: string;
  blockIds: string[];
}

export type CanvasTool = 'select' | 'connect' | 'add';

export type CanvasBackground = 'grid' | 'dots' | 'plain' | 'blueprint';
