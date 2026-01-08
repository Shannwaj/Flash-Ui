/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { Artifact } from '../types';

interface ArtifactCardProps {
    artifact: Artifact;
    isFocused: boolean;
    onClick: () => void;
}

const ArtifactCard = React.memo(({ 
    artifact, 
    isFocused, 
    onClick 
}: ArtifactCardProps) => {
    const codeRef = useRef<HTMLPreElement>(null);
    const [simulatedProgress, setSimulatedProgress] = useState(0);

    // Auto-scroll logic for this specific card
    useEffect(() => {
        if (codeRef.current) {
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
        }
    }, [artifact.html]);

    // Simulated technical logs for flair
    useEffect(() => {
        if (artifact.status === 'streaming') {
            const interval = setInterval(() => {
                setSimulatedProgress(p => (p < 99 ? p + Math.floor(Math.random() * 5) : 99));
            }, 400);
            return () => clearInterval(interval);
        } else {
            setSimulatedProgress(100);
        }
    }, [artifact.status]);

    const isGenerating = artifact.status === 'streaming';
    const hasContent = artifact.html.length > 0;

    return (
        <div 
            className={`artifact-card ${isFocused ? 'focused' : ''} ${isGenerating ? 'generating' : ''}`}
            onClick={onClick}
        >
            <div className="artifact-header">
                <span className="artifact-style-tag">{artifact.styleName}</span>
                {isGenerating && (
                    <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 800, fontFamily: 'monospace' }}>
                        COMPILING {simulatedProgress}%
                    </span>
                )}
            </div>
            <div className="artifact-card-inner" style={{ background: hasContent ? '#fff' : 'var(--accent-bg)' }}>
                {isGenerating && (
                    <div className="generating-overlay">
                        <div className="blueprint-grid" />
                        <div className="scanline" />
                        <div className="loading-meta">
                            <div className="meta-item">RESOLVING_SCHEMA</div>
                            <div className="meta-item">SYNTHESIZING_LAYOUT</div>
                            <div className="meta-item">RENDER_PIPELINE_INIT</div>
                            <div className="meta-item" style={{ color: '#fff', opacity: 1 }}>FLOW_DATA_RECEIVING</div>
                        </div>
                        <pre ref={codeRef} className="code-stream-preview">
                            {artifact.html || '/* Waiting for stream... */'}
                        </pre>
                    </div>
                )}
                {!isGenerating && !hasContent && (
                    <div style={{ 
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.3, letterSpacing: '0.1em'
                    }}>
                        EMPTY_SLOT
                    </div>
                )}
                <iframe 
                    srcDoc={artifact.html} 
                    title={artifact.id} 
                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                    className="artifact-iframe"
                    style={{ opacity: isGenerating ? 0 : 1 }}
                />
            </div>
        </div>
    );
});

export default ArtifactCard;