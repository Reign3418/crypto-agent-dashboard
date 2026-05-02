import Parser from 'rss-parser';

const parser = new Parser();

export async function fetchLiveNews() {
  try {
    // CoinDesk RSS feed for general crypto news
    const feed = await parser.parseURL('https://www.coindesk.com/arc/outboundfeeds/rss/');
    
    // Extract top 10 headlines
    const headlines = feed.items.slice(0, 10).map(item => ({
      title: item.title,
      pubDate: item.pubDate,
      link: item.link
    }));

    return headlines;
  } catch (error) {
    console.error('Failed to fetch RSS news:', error);
    return [];
  }
}
