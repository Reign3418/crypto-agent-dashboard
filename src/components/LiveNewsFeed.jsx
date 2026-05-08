import { useEffect, useState } from 'react';

export default function LiveNewsFeed() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news');
        if (!res.ok) throw new Error('Failed to fetch news');
        const data = await res.json();
        if (active) {
          setNews(data);
        }
      } catch (e) {
        console.error('News feed error', e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 60000); // Poll every 60s
    return () => { active = false; clearInterval(interval); };
  }, []);

  return (
    <div className="terminal-panel" style={{ gridArea: 'orderbook' }}>
      <div className="terminal-header">
        <span>Global News Feed</span>
        <span style={{ color: 'var(--status-success)', fontWeight: 400 }}>Live 🟢</span>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '8px' }}>
        {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading news...</div>}
        
        {news.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No recent news available.
          </div>
        )}

        {news.map((item, idx) => {
          const date = new Date(item.pubDate);
          const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

          return (
            <div key={idx} style={{ 
              marginBottom: '12px', 
              paddingBottom: '12px', 
              borderBottom: idx === news.length - 1 ? 'none' : '1px solid var(--border-subtle)' 
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                {dateString} • {timeString}
              </div>
              <a 
                href={item.link} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  color: 'var(--accent-blue)', 
                  textDecoration: 'none', 
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  fontWeight: '500',
                  display: 'block'
                }}
              >
                {item.title}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
