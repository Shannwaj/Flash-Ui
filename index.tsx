/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

//Vibe coded by ammaar@google.com

import { GoogleGenAI } from '@google/genai';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import { Artifact, Session, ComponentVariation, LayoutOption } from './types';
import { INITIAL_PLACEHOLDERS } from './constants';
import { generateId } from './utils';

import DottedGlowBackground from './components/DottedGlowBackground';
import ArtifactCard from './components/ArtifactCard';
import SideDrawer from './components/SideDrawer';
import CodePreview from './components/CodePreview';
import { 
    ThinkingIcon, 
    CodeIcon, 
    SparklesIcon, 
    ArrowLeftIcon, 
    ArrowRightIcon, 
    ArrowUpIcon, 
    GridIcon,
    SunIcon,
    MoonIcon
} from './components/Icons';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number>(-1);
  const [focusedArtifactIndex, setFocusedArtifactIndex] = useState<number | null>(null);
  
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholders, setPlaceholders] = useState<string[]>(INITIAL_PLACEHOLDERS);
  
  const [drawerState, setDrawerState] = useState<{
      isOpen: boolean;
      mode: 'code' | 'variations' | null;
      title: string;
      data: any; 
  }>({ isOpen: false, mode: null, title: '', data: null });

  const [componentVariations, setComponentVariations] = useState<ComponentVariation[]>([]);
  
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
      const saved = localStorage.getItem('app-theme');
      return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      inputRef.current?.focus();
  }, []);

  // Theme effect
  useEffect(() => {
      if (theme === 'light') {
          document.documentElement.classList.add('light-theme');
      } else {
          document.documentElement.classList.remove('light-theme');
      }
      localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Fix for mobile: reset scroll when focusing an item
  useEffect(() => {
    if (focusedArtifactIndex !== null && window.innerWidth <= 1024) {
        if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
        window.scrollTo(0, 0);
    }
  }, [focusedArtifactIndex]);

  // Cycle placeholders
  useEffect(() => {
      const interval = setInterval(() => {
          setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
      }, 4000);
      return () => clearInterval(interval);
  }, [placeholders.length]);

  // Dynamic placeholder generation
  useEffect(() => {
      const fetchDynamicPlaceholders = async () => {
          try {
              const apiKey = process.env.API_KEY;
              if (!apiKey) return;
              const ai = new GoogleGenAI({ apiKey });
              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: { 
                      role: 'user', 
                      parts: [{ 
                          text: 'Generate 15 extremely creative UI component prompts (e.g. "Bioluminescent space task list"). Return ONLY a raw JSON array of strings.' 
                      }] 
                  }
              });
              const text = response.text || '[]';
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                  const newPlaceholders = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(newPlaceholders) && newPlaceholders.length > 0) {
                      setPlaceholders(prev => [...prev, ...newPlaceholders]);
                  }
              }
          } catch (e) {}
      };
      setTimeout(fetchDynamicPlaceholders, 2000);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value);

  const handleGenerateVariations = useCallback(async () => {
    const currentSession = sessions[currentSessionIndex];
    if (!currentSession || focusedArtifactIndex === null) return;
    const currentArtifact = currentSession.artifacts[focusedArtifactIndex];

    setIsLoading(true);
    setComponentVariations([]);
    setDrawerState({ isOpen: true, mode: 'variations', title: 'Generative Variations', data: currentArtifact.id });

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Generate 3 RADICAL CONCEPTUAL VARIATIONS of: "${currentSession.prompt}". Return ONE JSON object per line: { "name": "Name", "html": "..." }`;
        
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{ text: prompt }], role: 'user' }],
            config: { temperature: 1.2 }
        });

        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (!text) continue;
            const lines = text.split('\n');
            for (const line of lines) {
                try {
                    const variation = JSON.parse(line.trim());
                    if (variation.name && variation.html) {
                        setComponentVariations(prev => [...prev, variation]);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const applyVariation = (html: string) => {
      if (focusedArtifactIndex === null) return;
      setSessions(prev => prev.map((sess, i) => 
          i === currentSessionIndex ? {
              ...sess,
              artifacts: sess.artifacts.map((art, j) => 
                j === focusedArtifactIndex ? { ...art, html, status: 'complete' } : art
              )
          } : sess
      ));
      setDrawerState(s => ({ ...s, isOpen: false }));
  };

  const handleSendMessage = useCallback(async (manualPrompt?: string) => {
    const promptToUse = manualPrompt || inputValue;
    const trimmedInput = promptToUse.trim();
    if (!trimmedInput || isLoading) return;
    if (!manualPrompt) setInputValue('');

    setIsLoading(true);
    const sessionId = generateId();

    const placeholderArtifacts: Artifact[] = Array(3).fill(null).map((_, i) => ({
        id: `${sessionId}_${i}`,
        styleName: 'SYNTHESIZING...',
        html: '',
        status: 'streaming',
    }));

    const newSession: Session = {
        id: sessionId,
        prompt: trimmedInput,
        timestamp: Date.now(),
        artifacts: placeholderArtifacts
    };

    setSessions(prev => [...prev, newSession]);
    setCurrentSessionIndex(sessions.length); 
    setFocusedArtifactIndex(null); 

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const stylePrompt = `Return ONLY a raw JSON array of 3 unique, material-metaphor design directions for: "${trimmedInput}". Be poetic and evocative.`;
        const styleResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { role: 'user', parts: [{ text: stylePrompt }] }
        });

        let generatedStyles = ["Modern Core", "Tactile Surface", "Kinetic Fluid"];
        try {
            const jsonMatch = styleResponse.text.match(/\[[\s\S]*\]/);
            if (jsonMatch) generatedStyles = JSON.parse(jsonMatch[0]);
        } catch (e) {}

        setSessions(prev => prev.map(s => s.id === sessionId ? {
            ...s, artifacts: s.artifacts.map((art, i) => ({ ...art, styleName: generatedStyles[i] || "Custom Direction" }))
        } : s));

        const generateArtifact = async (artifact: Artifact, style: string) => {
            try {
                const prompt = `You are Flash UI. Create a world-class UI component for: "${trimmedInput}" with direction: "${style}". Use advanced CSS features. RAW HTML ONLY. No markdown.`;
                const responseStream = await ai.models.generateContentStream({
                    model: 'gemini-3-flash-preview',
                    contents: [{ parts: [{ text: prompt }], role: "user" }],
                });

                let accumulatedHtml = '';
                for await (const chunk of responseStream) {
                    if (chunk.text) {
                        accumulatedHtml += chunk.text;
                        setSessions(prev => prev.map(sess => sess.id === sessionId ? {
                            ...sess, artifacts: sess.artifacts.map(art => art.id === artifact.id ? { ...art, html: accumulatedHtml } : art)
                        } : sess));
                    }
                }
                
                let final = accumulatedHtml.replace(/```html|```/g, '').trim();
                setSessions(prev => prev.map(sess => sess.id === sessionId ? {
                    ...sess, artifacts: sess.artifacts.map(art => art.id === artifact.id ? { ...art, html: final, status: 'complete' } : art)
                } : sess));

            } catch (e) {
                setSessions(prev => prev.map(sess => sess.id === sessionId ? {
                    ...sess, artifacts: sess.artifacts.map(art => art.id === artifact.id ? { ...art, status: 'error' } : art)
                } : sess));
            }
        };

        await Promise.all(placeholderArtifacts.map((art, i) => generateArtifact(art, generatedStyles[i])));

    } catch (e) {
        console.error(e);
    } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [inputValue, isLoading, sessions.length]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const hasStarted = sessions.length > 0 || isLoading;
  const currentSession = sessions[currentSessionIndex];

  return (
    <>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <SideDrawer isOpen={drawerState.isOpen} onClose={() => setDrawerState(s => ({...s, isOpen: false}))} title={drawerState.title}>
            {isLoading && drawerState.mode === 'variations' && <div className="loading-state"><ThinkingIcon /> Designing...</div>}
            {drawerState.mode === 'code' && (
                <CodePreview code={drawerState.data} />
            )}
            {drawerState.mode === 'variations' && (
                <div className="sexy-grid">
                    {componentVariations.map((v, i) => (
                         <div key={i} className="sexy-card" onClick={() => applyVariation(v.html)}>
                             <div className="sexy-preview"><iframe srcDoc={v.html} title={v.name} sandbox="allow-scripts allow-same-origin" /></div>
                             <div className="sexy-label">{v.name}</div>
                         </div>
                    ))}
                </div>
            )}
        </SideDrawer>

        <div className="immersive-app">
            <DottedGlowBackground 
                gap={32} 
                radius={1.2} 
                color={theme === 'dark' ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"} 
                glowColor={theme === 'dark' ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)"} 
                speedScale={isLoading ? 3.0 : 0.5}
            />

            <div className={`stage-container ${focusedArtifactIndex !== null ? 'mode-focus' : 'mode-split'}`}>
                 <div className={`empty-state ${hasStarted ? 'fade-out' : ''}`}>
                     <div className="empty-content">
                         <h1>Flash UI</h1>
                         <p>Design in the speed of thought</p>
                         <button className="surprise-button" onClick={() => handleSendMessage(placeholders[placeholderIndex])}>
                             <SparklesIcon /> Surprise Me
                         </button>
                     </div>
                 </div>

                {sessions.map((session, sIndex) => (
                    <div key={session.id} className={`session-group ${sIndex === currentSessionIndex ? 'active-session' : (sIndex < currentSessionIndex ? 'past-session' : 'future-session')}`}>
                        <div className="artifact-grid" ref={sIndex === currentSessionIndex ? gridScrollRef : null}>
                            {session.artifacts.map((artifact, aIndex) => (
                                <ArtifactCard 
                                    key={artifact.id}
                                    artifact={artifact}
                                    isFocused={focusedArtifactIndex === aIndex}
                                    onClick={() => setFocusedArtifactIndex(aIndex)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className={`action-bar ${focusedArtifactIndex !== null ? 'visible' : ''}`}>
                 <div className="action-buttons" style={{ pointerEvents: 'auto' }}>
                    <button onClick={() => setFocusedArtifactIndex(null)}><GridIcon /> Grid View</button>
                    <button onClick={handleGenerateVariations} disabled={isLoading}><SparklesIcon /> Explore Variations</button>
                    <button onClick={() => setDrawerState({ isOpen: true, mode: 'code', title: 'Export Code', data: currentSession?.artifacts[focusedArtifactIndex!]?.html })}><CodeIcon /> View Source</button>
                 </div>
            </div>

            <div className="floating-input-container">
                <div className={`input-wrapper ${isLoading ? 'loading' : ''}`}>
                    {!inputValue && !isLoading && (
                        <div className="animated-placeholder" key={placeholderIndex} style={{ opacity: 0.4 }}>
                            <span className="placeholder-text">{placeholders[placeholderIndex]}</span>
                            <span className="tab-hint" style={{ fontSize: '0.6rem', padding: '2px 6px', border: '1px solid var(--border-color)', borderRadius: '4px', marginLeft: '10px' }}>Tab</span>
                        </div>
                    )}
                    {!isLoading ? (
                        <input ref={inputRef} type="text" value={inputValue} onChange={handleInputChange} onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendMessage();
                            if (e.key === 'Tab' && !inputValue) { e.preventDefault(); setInputValue(placeholders[placeholderIndex]); }
                        }} />
                    ) : (
                        <div className="input-generating-label">
                            <span className="generating-prompt-text">{currentSession?.prompt}</span>
                            <ThinkingIcon />
                        </div>
                    )}
                    <button className="send-button" onClick={() => handleSendMessage()} disabled={isLoading || !inputValue.trim()}><ArrowUpIcon /></button>
                </div>
            </div>
        </div>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) ReactDOM.createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);