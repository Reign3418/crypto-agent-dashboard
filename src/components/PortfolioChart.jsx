import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';

export default function PortfolioChart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch settings');
        const settings = await res.json();
        if (active && settings.portfolioHistory) {
          // Sort by time ascending just to be safe
          const sorted = [...settings.portfolioHistory].sort((a, b) => a.time - b.time);
          setData(sorted);
        }
      } catch (e) {
        console.error('Failed to load portfolio history:', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 60000); // refresh every minute
    return () => { active = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    // Clean up any previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const uniqueData = [];
    const seen = new Set();
    
    for (const p of data) {
      if (!seen.has(p.time) && !isNaN(p.value)) {
        seen.add(p.time);
        uniqueData.push(p);
      }
    }

    if (uniqueData.length === 0) return;

    const initialWidth = containerRef.current.clientWidth || 300;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'transparent' }, // Robinhood doesn't show grid lines
        horzLines: { color: 'rgba(255,255,255,0.02)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 152, 0, 0.4)',
          width: 1,
          style: 3,
        },
        horzLine: {
          visible: false, // Robinhood crosshair style
          labelVisible: false,
        },
      },
      rightPriceScale: { 
        borderColor: 'transparent',
        tickMarkFormatter: (price) => '$' + price.toFixed(2),
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: initialWidth,
      height: 280,
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#ff9800', // Bastion / Robinhood orange
      topColor: 'rgba(255, 152, 0, 0.3)',
      bottomColor: 'rgba(255, 152, 0, 0.0)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#fff',
      crosshairMarkerBackgroundColor: '#ff9800',
    });

    try {
      areaSeries.setData(uniqueData);
      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Portfolio Chart error:', e);
    }
    
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current && containerRef.current.clientWidth > 0) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">Loading portfolio data...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted" style={{ textAlign: 'center', lineHeight: '1.5' }}>
          Waiting for first 15-minute portfolio snapshot.<br/>
          (Chart will begin drawing shortly)
        </p>
      </div>
    );
  }

  const currentValue = data[data.length - 1].value;
  const firstValue = data[0].value;
  const diff = currentValue - firstValue;
  const percentDiff = firstValue > 0 ? (diff / firstValue) * 100 : 0;
  const isUp = diff >= 0;

  return (
    <div style={{ width: '100%', marginTop: '12px' }}>
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>
          ${currentValue.toFixed(2)}
        </div>
        <div style={{ fontSize: '0.85rem', color: isUp ? '#22c55e' : '#ef4444', display: 'flex', gap: '6px' }}>
          <span>{isUp ? '↗' : '↘'}</span>
          <span>${Math.abs(diff).toFixed(2)} ({Math.abs(percentDiff).toFixed(2)}%) All Time</span>
        </div>
      </div>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
}
