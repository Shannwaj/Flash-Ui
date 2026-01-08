
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Modality, Blob, GenerateContentResponse, Type } from '@google/genai';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

import { Artifact, Session, ComponentVariation, ArtifactType, GroundingChunk } from './types';
import { INITIAL_PLACEHOLDERS } from './constants';
import { generateId } from './utils';

import DottedGlowBackground from './components/DottedGlowBackground';
import ArtifactCard from './components/ArtifactCard';
import SideDrawer from './components/SideDrawer';
import CodePreview from './components/CodePreview';
import { 
    ThinkingIcon, CodeIcon, SparklesIcon, ImageIcon, VideoIcon,
    MicIcon, ChatIcon, SearchIcon, BrainIcon, UploadIcon,
    ArrowUpIcon, GridIcon, SunIcon, MoonIcon, AlertIcon, GridIcon as AssetsIcon
} from './components/Icons';

// Unique ID for this tab instance to track presence
const TAB_ID = generateId();

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number>(-1);
  const [focusedArtifactIndex, setFocusedArtifactIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('app-theme') as 'dark' | 'light') || 'dark');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  
  // Collaboration State
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [isCollabEnabled, setIsCollabEnabled] = useState<boolean>(() => localStorage.getItem('collab-enabled') !== 'false');

  // Advanced Features State
  const [genMode, setGenMode] = useState<ArtifactType>('ui');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
  const [isThinkingEnabled, setIsThinkingEnabled] = useState<boolean>(false);
  const [isSearchEnabled, setIsSearchEnabled] = useState<boolean>(false);
  const [isLowLatency, setIsLowLatency] = useState<boolean>(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);

  // Derive hasStarted from sessions state
  const hasStarted = sessions.length > 0;

  // Refs for audio processing
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawerFileInputRef = useRef<HTMLInputElement>(null);

  // Collaboration Heartbeat & Sync
  useEffect(() => {
    if (!isCollabEnabled) return;

    const heartbeat = () => {
      const presenceStr = localStorage.getItem('omni-presence') || '{}';
      const presence = JSON.parse(presenceStr);
      presence[TAB_ID] = Date.now();
      
      const now = Date.now();
      const active = Object.keys(presence).filter(id => now - presence[id] < 10000);
      const cleanedPresence: Record<string, number> = {};
      active.forEach(id => { cleanedPresence[id] = presence[id]; });
      
      localStorage.setItem('omni-presence', JSON.stringify(cleanedPresence));
      setActiveUsers(active);
    };

    const interval = setInterval(heartbeat, 3000);
    heartbeat();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'omni-sessions' && e.newValue) {
        setSessions(JSON.parse(e.newValue));
      }
      if (e.key === 'omni-presence' && e.newValue) {
        setActiveUsers(Object.keys(JSON.parse(e.newValue)));
      }
      if (e.key === 'app-theme' && e.newValue) {
        setTheme(e.newValue as 'dark' | 'light');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    const stored = localStorage.getItem('omni-sessions');
    if (stored) {
        setSessions(JSON.parse(stored));
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      const presenceStr = localStorage.getItem('omni-presence') || '{}';
      const presence = JSON.parse(presenceStr);
      delete presence[TAB_ID];
      localStorage.setItem('omni-presence', JSON.stringify(presence));
    };
  }, [isCollabEnabled]);

  useEffect(() => {
    if (isCollabEnabled && sessions.length > 0) {
      localStorage.setItem('omni-sessions', JSON.stringify(sessions));
    }
  }, [sessions, isCollabEnabled]);

  useEffect(() => {
    inputRef.current?.focus();
    const checkKey = async () => {
        try {
            // @ts-ignore
            const selected = await window.aistudio.hasSelectedApiKey();
            setHasApiKey(selected);
        } catch(e) {}
    };
    checkKey();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light');
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => setUploadedImage(ev.target?.result as string);
        reader.readAsDataURL(file);
    }
  };

  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  };

  const handleLiveAPI = async () => {
    if (isLiveActive) return;
    setIsLiveActive(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        },
        callbacks: {
            onopen: () => {
                const source = inputAudioContext.createMediaStreamSource(stream);
                const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                scriptProcessor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const int16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
                    const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
                    sessionPromise.then(s => s.sendRealtimeInput({ media: { data: b64, mimeType: 'audio/pcm;rate=16000' } }));
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: async (msg) => {
                const audioB64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioB64 && outputAudioContextRef.current) {
                    const ctx = outputAudioContextRef.current;
                    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                    const buffer = await decodeAudioData(decodeBase64(audioB64), ctx, 24000, 1);
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(ctx.destination);
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += buffer.duration;
                    sourcesRef.current.add(source);
                }
                if (msg.serverContent?.interrupted) {
                    sourcesRef.current.forEach(s => s.stop());
                    sourcesRef.current.clear();
                    nextStartTimeRef.current = 0;
                }
            },
            onclose: () => setIsLiveActive(false),
            onerror: () => setIsLiveActive(false)
        }
    });
  };

  const performGeneration = async (sessionId: string, artifactId: string, prompt: string) => {
    setIsLoading(true);
    // Create new AI instance right before making calls, especially for pro/veo/imagen models
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = isLowLatency ? 'gemini-2.5-flash-lite-latest' : (genMode === 'chat' || genMode === 'vision' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview');

    try {
        if (genMode === 'video') {
            // @ts-ignore
            if (!(await window.aistudio.hasSelectedApiKey())) {
                // @ts-ignore
                await window.aistudio.openSelectKey();
            }
            
            // Re-instantiate after key selection
            const veoAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const config = { numberOfVideos: 1, resolution: '720p' as const, aspectRatio: '16:9' as const };
            
            let op = await veoAi.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt,
                image: uploadedImage ? { imageBytes: uploadedImage.split(',')[1], mimeType: 'image/png' } : undefined,
                config
            });
            
            while (!op.done) {
                await new Promise(r => setTimeout(r, 10000));
                op = await veoAi.operations.getVideosOperation({ operation: op });
            }
            const link = op.response?.generatedVideos?.[0]?.video?.uri;
            setSessions(prev => prev.map(s => s.id === sessionId ? {
                ...s, artifacts: s.artifacts.map(a => a.id === artifactId ? { ...a, videoUrl: `${link}&key=${process.env.API_KEY}`, status: 'complete' } : a)
            } : s));
        } else if (genMode === 'image') {
            // @ts-ignore
            if (!(await window.aistudio.hasSelectedApiKey())) {
                // @ts-ignore
                await window.aistudio.openSelectKey();
            }
            
            const aiPro = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const resp = await aiPro.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { 
                    parts: [
                        { text: prompt }, 
                        ...(uploadedImage ? [{ inlineData: { data: uploadedImage.split(',')[1], mimeType: 'image/png' } }] : [])
                    ] 
                },
                config: { 
                    imageConfig: { aspectRatio, imageSize },
                    tools: isSearchEnabled ? [{ googleSearch: {} }] : undefined
                }
            });
            const imgData = resp.candidates[0].content.parts.find(p => p.inlineData)?.inlineData?.data;
            setSessions(prev => prev.map(s => s.id === sessionId ? {
                ...s, artifacts: s.artifacts.map(a => a.id === artifactId ? { ...a, imageUrl: `data:image/png;base64,${imgData}`, status: 'complete' } : a)
            } : s));
        } else {
            const config: any = {
                thinkingConfig: isThinkingEnabled ? { thinkingBudget: 32768 } : undefined,
                tools: isSearchEnabled ? [{ googleSearch: {} }] : undefined
            };

            const contents: any = {
                parts: [
                    { text: prompt },
                    ...(uploadedImage ? [{ inlineData: { data: uploadedImage.split(',')[1], mimeType: 'image/png' } }] : [])
                ]
            };

            const stream = await ai.models.generateContentStream({ model, contents, config });
            let text = '';
            for await (const chunk of stream) {
                text += chunk.text || '';
                setSessions(prev => prev.map(s => s.id === sessionId ? {
                    ...s, artifacts: s.artifacts.map(a => a.id === artifactId ? { 
                        ...a, 
                        html: genMode === 'ui' ? text.replace(/```html|```/g, '') : text, 
                        text: genMode !== 'ui' ? text : undefined,
                        groundingLinks: (chunk as any).candidates?.[0]?.groundingMetadata?.groundingChunks || a.groundingLinks,
                        status: 'streaming' 
                    } : a)
                } : s));
            }
            setSessions(prev => prev.map(s => s.id === sessionId ? {
                ...s, artifacts: s.artifacts.map(a => a.id === artifactId ? { ...a, status: 'complete' } : a)
            } : s));

            if (genMode === 'chat') {
                const ttsResp = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-preview-tts',
                    contents: { parts: [{ text }] },
                    config: { responseModalities: [Modality.AUDIO] }
                });
                const ttsB64 = ttsResp.candidates[0].content.parts[0].inlineData?.data;
                if (ttsB64) {
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                    const buffer = await decodeAudioData(decodeBase64(ttsB64), ctx, 24000, 1);
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(ctx.destination);
                    source.start();
                }
            }
        }
    } catch (e: any) {
        console.error('Generation failure:', e);
        const errorMsg = e.message || '';
        
        // Handle "Requested entity was not found" per guidelines
        if (errorMsg.includes("Requested entity was not found")) {
            try {
                // @ts-ignore
                await window.aistudio.openSelectKey();
            } catch(keyErr) {}
        }

        setSessions(prev => prev.map(s => s.id === sessionId ? {
            ...s, artifacts: s.artifacts.map(a => a.id === artifactId ? { ...a, status: 'error', html: errorMsg } : a)
        } : s));
    } finally {
        setIsLoading(false);
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    const prompt = inputValue;
    setInputValue('');

    const sessionId = generateId();
    const artifactId = generateId();

    const artifact: Artifact = {
        id: artifactId,
        styleName: genMode.toUpperCase(),
        html: '',
        type: genMode,
        status: isThinkingEnabled ? 'thinking' : 'streaming'
    };

    const session: Session = { id: sessionId, prompt, timestamp: Date.now(), artifacts: [artifact] };
    setSessions(prev => [...prev, session]);
    setCurrentSessionIndex(sessions.length);
    setFocusedArtifactIndex(0);

    performGeneration(sessionId, artifactId, prompt);
  }, [inputValue, genMode, imageSize, aspectRatio, isThinkingEnabled, isSearchEnabled, isLowLatency, uploadedImage, sessions.length]);

  const handleRetry = (sessionId: string, artifactId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || isLoading) return;

    setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        artifacts: s.artifacts.map(a => a.id === artifactId ? { ...a, status: isThinkingEnabled ? 'thinking' : 'streaming', html: '', text: '' } : a)
    } : s));

    performGeneration(sessionId, artifactId, session.prompt);
  };

  const handleTranscribe = async () => {
    setIsLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
        const audioBlob = new window.Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
            const b64 = (reader.result as string).split(',')[1];
            const resp = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ inlineData: { data: b64, mimeType: 'audio/webm' } }, { text: 'Transcribe this exactly.' }] }
            });
            setInputValue(resp.text || '');
            setIsLoading(false);
        };
        reader.readAsDataURL(audioBlob);
    };
    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 4000);
  };

  const clearSessions = () => {
      setSessions([]);
      localStorage.removeItem('omni-sessions');
  };

  return (
    <>
        <div className="top-nav-controls">
            {isCollabEnabled && activeUsers.length > 1 && (
                <div className="presence-indicator">
                    <div className="presence-pills">
                        {activeUsers.map(id => (
                            <div key={id} className={`presence-dot ${id === TAB_ID ? 'current' : ''}`} title={id === TAB_ID ? 'You' : 'Collaborator'} />
                        ))}
                    </div>
                    <span>{activeUsers.length} Live</span>
                </div>
            )}
            <button className="nav-btn" onClick={() => setIsDrawerOpen(true)} title="Settings & Assets">
                <AssetsIcon />
            </button>
            <button className="nav-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
        </div>

        <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title="Omni Settings">
            <div className="drawer-section">
                <h3>Collaboration</h3>
                <p className="section-desc">Sync sessions across tabs and see active collaborators.</p>
                <div className="setting-item">
                    <span>Live Sync (Local)</span>
                    <button 
                        className={`toggle-switch ${isCollabEnabled ? 'active' : ''}`} 
                        onClick={() => {
                            const newState = !isCollabEnabled;
                            setIsCollabEnabled(newState);
                            localStorage.setItem('collab-enabled', String(newState));
                        }} 
                    />
                </div>
                {isCollabEnabled && (
                    <button className="danger-btn" onClick={clearSessions}>Clear Global Sessions</button>
                )}
            </div>

            <div className="drawer-section">
                <h3>Reference Image</h3>
                <p className="section-desc">Upload an image to guide visual generations.</p>
                
                <div className="reference-upload-container">
                    {uploadedImage ? (
                        <div className="reference-preview">
                            <img src={uploadedImage} alt="Reference" />
                            <button className="clear-ref-btn" onClick={() => setUploadedImage(null)}>&times;</button>
                        </div>
                    ) : (
                        <button className="upload-ref-btn" onClick={() => drawerFileInputRef.current?.click()}>
                            <UploadIcon />
                            <span>Upload Reference</span>
                        </button>
                    )}
                    <input 
                        type="file" 
                        ref={drawerFileInputRef} 
                        style={{ display: 'none' }} 
                        onChange={onFileChange} 
                        accept="image/*" 
                    />
                </div>
            </div>
            
            <div className="drawer-section">
                <h3>Session Settings</h3>
                <div className="setting-item">
                    <span>Low Latency Mode</span>
                    <button className={`toggle-switch ${isLowLatency ? 'active' : ''}`} onClick={() => setIsLowLatency(!isLowLatency)} />
                </div>
                <div className="setting-item">
                    <span>Search Grounding</span>
                    <button className={`toggle-switch ${isSearchEnabled ? 'active' : ''}`} onClick={() => setIsSearchEnabled(!isSearchEnabled)} />
                </div>
            </div>
        </SideDrawer>

        <div className="immersive-app">
            <DottedGlowBackground gap={32} speedScale={isLoading ? 3 : 0.5} />
            <div className={`stage-container ${focusedArtifactIndex !== null ? 'mode-focus' : ''}`}>
                 <div className={`empty-state ${hasStarted ? 'fade-out' : ''}`}>
                     <h1>Flash Omni</h1>
                     <p>Multimodal intelligence in a flash</p>
                 </div>
                {sessions.map((session, sIdx) => (
                    <div key={session.id} className={`session-group ${sIdx === currentSessionIndex ? 'active-session' : ''}`}>
                        <div className="artifact-grid">
                            {session.artifacts.map((a, aIdx) => (
                                <ArtifactCard 
                                    key={a.id} 
                                    artifact={a} 
                                    isFocused={focusedArtifactIndex === aIdx} 
                                    onClick={() => setFocusedArtifactIndex(aIdx)} 
                                    onRetry={() => handleRetry(session.id, a.id)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="floating-input-container">
                <div className="mode-dock">
                    <button className={`mode-btn ${genMode === 'ui' ? 'active' : ''}`} onClick={() => setGenMode('ui')}><CodeIcon /> UI</button>
                    <button className={`mode-btn ${genMode === 'chat' ? 'active' : ''}`} onClick={() => setGenMode('chat')}><ChatIcon /> Chat</button>
                    <button className={`mode-btn ${genMode === 'image' ? 'active' : ''}`} onClick={() => setGenMode('image')}><ImageIcon /> Image</button>
                    <button className={`mode-btn ${genMode === 'video' ? 'active' : ''}`} onClick={() => setGenMode('video')}><VideoIcon /> Video</button>
                    <button className={`mode-btn ${genMode === 'vision' ? 'active' : ''}`} onClick={() => setGenMode('vision')}><UploadIcon /> Vision</button>
                    <button className={`mode-btn ${isLiveActive ? 'active' : ''}`} onClick={handleLiveAPI}><MicIcon /> Live</button>
                </div>

                {genMode === 'image' && (
                    <div className="image-config-bar">
                        <div className="config-group">
                            <span className="config-label">Ratio:</span>
                            {(['1:1', '4:3', '3:4', '16:9', '9:16'] as const).map(r => (
                                <button key={r} className={`config-chip ${aspectRatio === r ? 'active' : ''}`} onClick={() => setAspectRatio(r)}>{r}</button>
                            ))}
                        </div>
                        <div className="config-group">
                            <span className="config-label">Size:</span>
                            {(['1K', '2K', '4K'] as const).map(s => (
                                <button key={s} className={`config-chip ${imageSize === s ? 'active' : ''}`} onClick={() => setImageSize(s)}>{s}</button>
                            ))}
                        </div>
                    </div>
                )}

                <div className={`input-wrapper ${isLoading ? 'loading' : ''}`}>
                    <button className="file-input-btn" onClick={() => fileInputRef.current?.click()} title="Upload Image"><UploadIcon /></button>
                    <input ref={inputRef} value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Ask Flash Omni..." />
                    
                    <div className="toggle-group">
                        <span 
                            className={`toggle-item ${isThinkingEnabled ? 'active' : ''}`} 
                            onClick={() => {
                                setIsThinkingEnabled(!isThinkingEnabled);
                                if (!isThinkingEnabled) setIsSearchEnabled(false); 
                            }}
                            title="Deep Thinking Mode"
                        >
                            <BrainIcon />
                        </span>
                        <span 
                            className={`toggle-item ${isSearchEnabled ? 'active' : ''}`} 
                            onClick={() => {
                                setIsSearchEnabled(!isSearchEnabled);
                                if (!isSearchEnabled) setIsThinkingEnabled(false);
                            }}
                            title="Google Search Grounding"
                        >
                            <SearchIcon />
                        </span>
                        <span className={`toggle-item ${isLowLatency ? 'active' : ''}`} onClick={() => setIsLowLatency(!isLowLatency)} title="Flash Lite Mode">Lite</span>
                        <span className="toggle-item" onClick={handleTranscribe} title="Voice Input"><MicIcon /></span>
                    </div>

                    <button className="send-button" onClick={() => handleSendMessage()} disabled={isLoading}><ArrowUpIcon /></button>
                </div>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileChange} accept="image/*" />
            </div>
        </div>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
