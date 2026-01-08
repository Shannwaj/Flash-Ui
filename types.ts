
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type ArtifactType = 'ui' | 'image' | 'video' | 'chat' | 'vision' | 'audio' | 'transcription';

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri: string; title: string };
}

export interface Artifact {
  id: string;
  styleName: string;
  html: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  text?: string;
  type: ArtifactType;
  status: 'streaming' | 'complete' | 'error' | 'thinking';
  groundingLinks?: GroundingChunk[];
}

export interface Session {
    id: string;
    prompt: string;
    timestamp: number;
    artifacts: Artifact[];
}

export interface ComponentVariation { name: string; html: string; }
