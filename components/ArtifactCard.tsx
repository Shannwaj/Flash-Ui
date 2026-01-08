
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Artifact } from '../types';
import { SearchIcon, AlertIcon } from './Icons';

interface ArtifactCardProps {
    artifact: Artifact;
    isFocused: boolean;
    onClick: () => void;
    onRetry?: () => void;
}

const ArtifactCard = React.memo(({ 
    artifact, 
    isFocused, 
    onClick,
    onRetry
}: ArtifactCardProps) => {
    const codeRef = useRef<HTMLPreElement>(null);
    const [simulatedProgress, setSimulatedProgress] = useState(0);

    useEffect(() => {
        if (codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }, [artifact.html, artifact.text]);

    useEffect(() => {
        if (artifact.status === 'streaming' || artifact.status === 'thinking') {
            const interval = setInterval(() => {
                setSimulatedProgress(p => (p < 99 ? p + Math.floor(Math.random() * 3) : 99));
            }, 500);
            return () => clearInterval(interval);
        } else setSimulatedProgress(100);
    }, [artifact.status]);

    const isGenerating = artifact.status === 'streaming' || artifact.status === 'thinking';
    const isError = artifact.status === 'error';
    const isChat = artifact.type === 'chat';

    const errorContext = useMemo(() => {
        if (!isError) return null;
        const msg = (artifact.html || artifact.text || "").toLowerCase();
        
        const suggestions = [];
        if (msg.includes("requested entity was not found") || msg.includes("404")) {
            suggestions.push("Ensure you have selected a valid paid API key for this model.");
            suggestions.push("Check if billing is enabled for your project in Google AI Studio.");
        } else if (msg.includes("safety") || msg.includes("blocked")) {
            suggestions.push("Try rephrasing your prompt to be more neutral.");
            suggestions.push("The model's safety filters may have flagged the content.");
        } else if (msg.includes("quota") || msg.includes("exhausted") || msg.includes("429")) {
            suggestions.push("You've reached your rate limit. Wait 60 seconds and try again.");
            suggestions.push("Switch to 'Lite' mode for higher quota availability.");
        } else if (msg.includes("format") || msg.includes("mime")) {
            suggestions.push("Check that the uploaded image is a valid PNG or JPEG.");
        } else {
            suggestions.push("Check your internet connection.");
            suggestions.push("Try refreshing the session or switching generation modes.");
        }
        
        return suggestions;
    }, [isError, artifact.html, artifact.text]);

    return (
        <div 
            className={`artifact-card ${isFocused ? 'focused' : ''} ${isGenerating ? 'generating' : ''} ${isError ? 'error-state' : ''} ${isChat ? 'chat-mode' : ''}`}
            onClick={isChat && !isError ? undefined : onClick}
        >
            <div className="artifact-header">
                <span className="artifact-style-tag">
                    {isError ? 'FAILED' : artifact.styleName}
                </span>
                {isGenerating && (
                    <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 800, fontFamily: 'monospace' }}>
                        {artifact.status === 'thinking' ? 'THINKING' : 'GENERATING'} {simulatedProgress}%
                    </span>
                )}
                {isError && (
                    <span style={{ fontSize: '0.65rem', color: '#f87171', fontWeight: 800, fontFamily: 'monospace' }}>
                        {artifact.id.slice(0,8).toUpperCase()}
                    </span>
                )}
            </div>

            <div className="artifact-card-inner" style={{ 
                background: artifact.type === 'ui' && !isError ? '#fff' : (isChat && !isError ? 'transparent' : 'var(--card-bg)') 
            }}>
                {isError ? (
                    <div className="error-container">
                        <div className="hazard-stripes" />
                        <div className="error-icon-circle">
                            <AlertIcon />
                        </div>
                        <div className="error-title-main">GENERATION ERROR</div>
                        
                        <div className="error-log-box-ref">
                            <div className="error-message-ref">
                                {artifact.html || artifact.text || "An unexpected system failure occurred during generation."}
                            </div>
                        </div>

                        {errorContext && (
                            <div className="troubleshooting-box">
                                <div className="troubleshooting-title">TROUBLESHOOTING_STEPS:</div>
                                <ul className="troubleshooting-list">
                                    {errorContext.map((s, i) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <button 
                            className="try-again-button" 
                            onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
                        >
                            Try Again
                        </button>
                    </div>
                ) : (
                    <>
                        {isGenerating && artifact.type !== 'chat' && (
                            <div className="generating-overlay">
                                <div className="blueprint-grid" />
                                <div className="scanline" />
                                <div className="loading-meta">
                                    <div className="meta-item">{artifact.status === 'thinking' ? 'DEEP_REASONING_ENGINE' : 'CONSTRUCTING_ARTIFACT'}</div>
                                    <div className="meta-item">ALLOCATING_LATENT_RESOURCES</div>
                                </div>
                                {artifact.type === 'ui' && (
                                    <pre ref={codeRef} className="code-stream-preview">
                                        {artifact.html || '/* Initializing Code Stream... */'}
                                    </pre>
                                )}
                            </div>
                        )}

                        {artifact.type === 'image' && artifact.imageUrl && (
                            <img src={artifact.imageUrl} alt="Result" className="artifact-image" />
                        )}

                        {artifact.type === 'video' && artifact.videoUrl && (
                            <video src={artifact.videoUrl} className="artifact-image" controls autoPlay loop />
                        )}

                        {artifact.type === 'ui' && (
                            <iframe 
                                srcDoc={artifact.html} 
                                title={artifact.id} 
                                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                                className="artifact-iframe"
                                style={{ opacity: isGenerating ? 0 : 1 }}
                            />
                        )}

                        {(artifact.type === 'chat' || artifact.type === 'vision' || artifact.type === 'transcription') && (
                            <div className="chat-bubble-container">
                                <div className="bubble bot">
                                    {artifact.text || artifact.html}
                                    {artifact.groundingLinks && artifact.groundingLinks.length > 0 && (
                                        <div className="grounding-links">
                                            {artifact.groundingLinks.map((link, idx) => (
                                                <a key={idx} href={link.web?.uri || link.maps?.uri} target="_blank" rel="noreferrer" className="grounding-link">
                                                    <SearchIcon /> {link.web?.title || 'Source'}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

export default ArtifactCard;
