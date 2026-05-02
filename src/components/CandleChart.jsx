import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';

export default function CandleChart({ symbol, candles }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return;

    // Clean up any previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // Defensive data parsing
    const uniqueCandles = [];
    const seen = new Set();
    const sortedCandles = [...candles].sort((a, b) => Number(a.time) - Number(b.time));
    
    for (const c of sortedCandles) {
      const time = Number(c.time);
      const open = Number(c.open);
      const high = Number(c.high);
      const low = Number(c.low);
      const close = Number(c.close);
      
      if (
        !isNaN(time) && !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close) &&
        !seen.has(time)
      ) {
        seen.add(time);
        uniqueCandles.push({ time, open, high, low, close });
      }
    }

    if (uniqueCandles.length === 0) return;

    // Prevent 'Value is null' crash if container isn't fully laid out yet (width = 0)
    const initialWidth = containerRef.current.clientWidth || 300;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: initialWidth,
      height: 280,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    try {
      candleSeries.setData(uniqueCandles);
      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Chart error:', e);
    }
    
    chartRef.current = chart;

    // Handle resize
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
  }, [candles, symbol]);

  if (!candles || candles.length === 0) {
    return (
      <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">No chart data available</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', marginTop: '12px' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
        {symbol} — 1H Candles (last 24 hrs)
      </div>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
}
