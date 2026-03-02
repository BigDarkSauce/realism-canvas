export interface Block {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fileUrl?: string;
  fileName?: string;
  fileStorageUrl?: string; // URL from cloud storage
  groupId?: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  // Control point offset for bending
  cpX?: number;
  cpY?: number;
}

export interface Group {
  id: string;
  label: string;
  blockIds: string[];
  fontFamily?: string;
  fontSize?: string;
  bgColor?: string;
  textColor?: string;
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  width: number;
}

export type CanvasTool = 'select' | 'connect' | 'add' | 'draw' | 'eraser';

export type CanvasBackground = 'grid' | 'dots' | 'plain' | 'blueprint' | 'image';
