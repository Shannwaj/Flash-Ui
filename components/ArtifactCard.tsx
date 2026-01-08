
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Artifact } from '../types';
import { SearchIcon, AlertIcon, CodeIcon } from './Icons';

interface ArtifactCardProps {
    artifact: Artifact;
    isFocused: boolean;
    onClick: () => void;
    onRetry?: () => void;
    isLiveEditEnabled?: boolean;
    onUpdate?: (id: string, updates: Partial<Artifact>) => void;
}

const ArtifactCard = React.memo(({ 
    artifact, 
    isFocused, 
    onClick,
    onRetry,
    isLiveEditEnabled,
    onUpdate
}: ArtifactCardProps) => {
    const codeRef = useRef<HTMLPreElement>(null);
    const [simulatedProgress, setSimulatedProgress] = useState(0);
    const [showTechnical, setShowTechnical] = useState(false);

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

    const errorAnalysis = useMemo(() => {
        if (!isError) return null;
        const msg = (artifact.html || artifact.text || "").toLowerCase();
        
        let category = "Unknown System Error";
        let suggestions = [];
        let actionLabel = "Retry";

        if (msg.includes("requested entity was not found") || msg.includes("404")) {
            category = "Billing or API Key Issue";
            suggestions = [
                "The selected model requires a paid Google Cloud project.",
                "Verify billing is enabled at console.cloud.google.com.",
                "Check if the API Key has permission for this specific model."
            ];
            actionLabel = "Update API Key";
        } else if (msg.includes("safety") || msg.includes("blocked") || msg.includes("finish_reason_safety")) {
            category = "Content Blocked";
            suggestions = [
                "The prompt triggered Gemini's safety filters.",
                "Try phrasing your request more neutrally.",
                "Avoid sensitive topics that might violate usage policies."
            ];
        } else if (msg.includes("quota") || msg.includes("exhausted") || msg.includes("429")) {
            category = "Rate Limit Reached";
            suggestions = [
                "You've exceeded your current request quota.",
                "Wait 60 seconds before retrying.",
                "Consider using 'Lite' mode to reduce resource consumption."
            ];
            actionLabel = "Retry Now";
        } else if (msg.includes("network") || msg.includes("fetch") || msg.includes("connection")) {
            category = "Network Connectivity";
            suggestions = [
                "Check your local internet connection.",
                "Firewall or VPN might be blocking the API stream.",
                "The Gemini service might be experiencing temporary downtime."
            ];
        } else if (msg.includes("invalid") || msg.includes("argument") || msg.includes("400")) {
            category = "Invalid Request Parameter";
            suggestions = [
                "The prompt or configuration might be too large.",
                "Check that any uploaded images are correctly formatted.",
                "Reduce the complexity of your request."
            ];
        } else {
            suggestions = [
                "Refresh your browser tab.",
                "Clear the session and start a new conversation.",
                "Switch to a different generation mode (e.g., Chat instead of UI)."
            ];
        }
        
        return { category, suggestions, actionLabel };
    }, [isError, artifact.html, artifact.text]);

    return (
        <div 
            className={`artifact-card ${isFocused ? 'focused' : ''} ${isGenerating ? 'generating' : ''} ${isError ? 'error-state' : ''} ${isChat ? 'chat-mode' : ''} ${isLiveEditEnabled && isFocused && artifact.type === 'ui' ? 'live-edit-layout' : ''}`}
            onClick={isChat && !isError ? undefined : onClick}
        >
            <div className="artifact-header">
                <div className="header-left">
                    <span className="artifact-style-tag">
                        {isError ? 'STATION_OFFLINE' : artifact.styleName}
                    </span>
                    {isLiveEditEnabled && artifact.type === 'ui' && !isError && !isGenerating && (
                        <span className="live-badge">LIVE_EDIT_ACTIVE</span>
                    )}
                </div>
                {isGenerating && (
                    <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 800, fontFamily: 'monospace' }}>
                        {artifact.status === 'thinking' ? 'THINKING' : 'GENERATING'} {simulatedProgress}%
                    </span>
                )}
                {isError && (
                    <span style={{ fontSize: '0.65rem', color: '#f87171', fontWeight: 800, fontFamily: 'monospace' }}>
                        ERR_CODE: {artifact.id.slice(0,8).toUpperCase()}
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
                        
                        <div className="error-badge">{errorAnalysis?.category}</div>
                        <div className="error-title-main">GENERATION_FAILED</div>
                        
                        {!showTechnical ? (
                            <div className="troubleshooting-box">
                                <div className="troubleshooting-title">Recommended Actions:</div>
                                <ul className="troubleshooting-list">
                                    {errorAnalysis?.suggestions.map((s, i) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ul>
                                <button className="text-toggle-btn" onClick={() => setShowTechnical(true)}>
                                    <CodeIcon /> Show Technical Details
                                </button>
                            </div>
                        ) : (
                            <div className="error-log-box-ref">
                                <div className="log-header">RAW_DIAGNOSTIC_DATA:</div>
                                <div className="error-message-ref">
                                    {artifact.html || artifact.text || "Status: Undefined System Exception"}
                                </div>
                                <button className="text-toggle-btn" onClick={() => setShowTechnical(false)}>
                                    Hide Technical Details
                                </button>
                            </div>
                        )}

                        <button 
                            className="try-again-button" 
                            onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
                        >
                            {errorAnalysis?.actionLabel}
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
                            <div className="ui-content-wrapper">
                                <iframe 
                                    srcDoc={artifact.html} 
                                    title={artifact.id} 
                                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                                    className="artifact-iframe"
                                    style={{ opacity: isGenerating ? 0 : 1 }}
                                />
                                {isLiveEditEnabled && isFocused && !isGenerating && (
                                    <div className="live-editor-pane">
                                        <div className="pane-header">CODE_SOURCE_LIVE</div>
                                        <textarea 
                                            className="live-textarea"
                                            value={artifact.html}
                                            onChange={(e) => onUpdate?.(artifact.id, { html: e.target.value })}
                                            spellCheck={false}
                                        />
                                    </div>
                                )}
                            </div>
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
