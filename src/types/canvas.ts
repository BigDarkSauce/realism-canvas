export type BlockShape = 'rectangle' | 'circle' | 'diamond' | 'sticky' | 'text' | 'image';

export interface Block {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fileUrl?: string;
  fileName?: string;
  fileStorageUrl?: string;
  groupId?: string;
  fontSize?: string;
  shape?: BlockShape;
  bgColor?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  textColor?: string;
  markdown?: string;
  linkedDocumentId?: string;
  comment?: string;
  icon?: string;
}

export type ArrowStyle = 'solid' | 'dashed' | 'dotted';

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  cpX?: number;
  cpY?: number;
  color?: string;
  strokeWidth?: number;
  arrowStyle?: ArrowStyle;
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

export interface CanvasComment {
  id: string;
  x: number;
  y: number;
  text: string;
  author: string;
  timestamp: string;
  blockId?: string;
}

// Knowledge Graph types — deeply elaborated
export interface KnowledgeConcept {
  id: string;
  label: string;
  description?: string;
  sourceBlockIds: string[];
  domain: string;
  epistemicStatus?: 'established' | 'hypothetical' | 'contested' | 'emergent';
  x?: number;
  y?: number;
}

export interface KnowledgeRule {
  id: string;
  description: string;
  elaboration?: string;
  domain: string;
  sourceConceptIds: string[];
  isGeneralizable?: boolean;
}

export interface KnowledgeMutation {
  id: string;
  conceptId: string;
  previousState: string;
  newState: string;
  reason: string;
  mutationType?: 'refined' | 'reversed' | 'expanded' | 'narrowed' | 'merged' | 'split';
  timestamp: string;
}

export interface CausalLink {
  id: string;
  fromId: string;
  toId: string;
  type: 'causes' | 'derives' | 'contradicts' | 'supports' | 'evolves' | 'enables' | 'constrains' | 'transforms';
  description: string;
  isBidirectional?: boolean;
  confidence?: 'high' | 'medium' | 'low' | 'speculative';
}

export interface ConvergencePoint {
  id: string;
  conceptIds: string[];
  description: string;
}

export interface KnowledgeGraphData {
  concepts: KnowledgeConcept[];
  rules: KnowledgeRule[];
  mutations: KnowledgeMutation[];
  causalLinks: CausalLink[];
  convergencePoints?: ConvergencePoint[];
  lastAnalyzedAt: string | null;
  summary?: string;
}

export type CanvasTool = 'select' | 'connect' | 'add' | 'draw' | 'eraser';

export type CanvasBackground = 'grid' | 'dots' | 'plain' | 'blueprint' | 'image';
