import { useState } from 'react';

export default function AgentChat({ isHalted, miniMode = false }) {
  const [messages, setMessages] = useState([
    { role: 'agent', content: 'Hello! I am your personal trading assistant. I am currently monitoring your portfolio and the broader crypto market. \n\nHow can I help you today? You can ask me to analyze a specific asset, monitor a spread, or execute a trade.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage.content })
      });

      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'agent', content: data.response || data.error }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'agent', content: 'Error connecting to the Vercel backend server. Make sure you are running the app with "vercel dev".' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className={miniMode ? "" : "glass-panel"} style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: miniMode ? 0 : '24px', borderRadius: miniMode ? 0 : '16px' }}>
      {!miniMode && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2>AI Trading Assistant</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>Gemini Advanced Model</p>
        </div>
      )}
      
      <div style={{ flex: 1, background: miniMode ? 'transparent' : 'var(--bg-tertiary)', borderRadius: '12px', padding: miniMode ? 0 : '16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '12px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: 'white',
                background: msg.role === 'user' ? 'var(--bg-primary)' : 'var(--accent-blue)',
                border: msg.role === 'user' ? '1px solid var(--border-subtle)' : 'none'
              }}>
                {msg.role === 'user' ? 'ME' : 'AI'}
              </div>
              <div style={{ 
                background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-secondary)', 
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)', 
                padding: '12px 16px', 
                borderRadius: msg.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px', 
                fontSize: '0.95rem', lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                maxWidth: '85%'
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>AI</div>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '0 12px 12px 12px', fontSize: '0.95rem' }}>
                <span style={{ opacity: 0.5 }}>Thinking...</span>
              </div>
            </div>
          )}

        </div>

        {/* Input Area */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '8px', borderTop: miniMode ? 'none' : '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isHalted && !isLoading && handleSend()}
            placeholder={isHalted ? "SYSTEM HALTED. CHAT DISABLED." : "Type your instructions here..."}
            style={{ 
              flex: 1, 
              background: 'var(--bg-primary)', 
              border: '1px solid var(--border-subtle)', 
              color: 'white', 
              padding: '12px 16px', 
              borderRadius: '8px', 
              outline: 'none', 
              fontSize: '0.95rem',
              opacity: isHalted ? 0.5 : 1,
              cursor: isHalted ? 'not-allowed' : 'text'
            }}
            disabled={isLoading || isHalted}
          />
          <button 
            onClick={handleSend} 
            className="btn-primary" 
            style={{ 
              padding: '0 24px',
              opacity: (isLoading || !input.trim() || isHalted) ? 0.5 : 1, 
              cursor: (isLoading || isHalted) ? 'not-allowed' : 'pointer'
            }} 
            disabled={isLoading || !input.trim() || isHalted}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </aside>
  );
}
