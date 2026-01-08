/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo } from 'react';

interface CodePreviewProps {
    code: string;
}

/**
 * A simple, lightweight high-performance syntax highlighter for HTML/CSS.
 * Using regex to avoid bringing in heavy dependencies while maintaining a world-class look.
 */
const highlightCode = (code: string) => {
    return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/(&lt;!--.*?--&gt;)/gs, '<span class="token-comment">$1</span>')
        .replace(/(".*?")/g, '<span class="token-string">$1</span>')
        .replace(/('.*?')/g, '<span class="token-string">$1</span>')
        .replace(/(&lt;\/?[a-z1-6]+)/gi, '<span class="token-tag">$1</span>')
        .replace(/([a-z-]+)=/gi, '<span class="token-attr">$1</span>=')
        .replace(/[{};]/g, '<span class="token-punctuation">$&</span>');
};

const CodePreview: React.FC<CodePreviewProps> = ({ code }) => {
    const lines = useMemo(() => code.trim().split('\n'), [code]);

    return (
        <div className="code-preview-container">
            <div className="line-numbers">
                {lines.map((_, i) => (
                    <div key={i} className="line-number">{i + 1}</div>
                ))}
            </div>
            <pre className="code-content">
                <code dangerouslySetInnerHTML={{ __html: highlightCode(code) }} />
            </pre>
        </div>
    );
};

export default CodePreview;