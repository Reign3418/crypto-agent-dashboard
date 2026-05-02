import { useEffect, useRef } from 'react';

export default function AINeuralFeed({ logs, isScanning }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(0, 0, 0, 0.4)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid var(--border-subtle)', 
        fontSize: '0.7rem', 
        color: isScanning ? 'var(--accent-green)' : 'var(--text-muted)', 
        display: 'flex', 
        justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <span>&gt; CIPHER_NEURAL_LINK_v2.5</span>
        <span className={isScanning ? 'blink' : ''}>{isScanning ? 'PROCESSING...' : 'IDLE'}</span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', fontSize: '0.75rem', color: '#10b981' }}>
        {logs.map((log, idx) => (
          <div key={idx} style={{ marginBottom: '6px', lineHeight: '1.4' }}>
            <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>[{log.time}]</span>
            <span style={{ color: log.color || '#10b981' }}>{log.text}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>System idle. Awaiting next scout cycle...</div>
        )}
      </div>
    </div>
  );
}
