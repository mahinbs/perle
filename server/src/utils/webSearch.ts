import { tavily } from '@tavily/core';

// Initialize Tavily client
const tavilyApiKey = process.env.TAVILY_API_KEY;
const tvly = tavilyApiKey ? tavily({ apiKey: tavilyApiKey }) : null;

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Detect if a query requires current/latest information
 */
export function requiresCurrentInfo(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  
  // Keywords that indicate need for current information (COMPREHENSIVE LIST)
  const currentInfoIndicators = [
    // Time-based indicators
    'latest', 'newest', 'current', 'recent', 'today', 'now', 'this year', 'this month', 'this week',
    'last year', 'last month', 'last week', 'yesterday', 'right now', 'at the moment',
    '2026', '2025', '2024', '2023', 'in 2026', 'in 2025', 'in 2024',
    
    // Status/Release indicators
    'what is new', 'what\'s new', 'whats new', 'new release', 'just released', 'newly released',
    'just announced', 'recently announced', 'newly launched', 'just launched',
    'upcoming', 'coming soon', 'future', 'next', 'next generation', 'next gen',
    
    // Quality/Ranking indicators
    'best', 'top', 'leading', 'flagship', 'premium', 'most popular', 'trending',
    'top rated', 'highest rated', 'best rated', 'most recommended',
    'number one', 'no 1', '#1', 'top 10', 'top 5', 'best of',
    
    // Technology/Innovation indicators
    'modern', 'contemporary', 'state of the art', 'cutting edge', 'most advanced',
    'innovative', 'breakthrough', 'revolutionary', 'game changing',
    
    // Update/Change indicators
    'update', 'updated', 'upgrade', 'upgraded', 'improved', 'enhanced',
    'changed', 'modified', 'revised', 'new version', 'version',
    
    // Comparison indicators (often need current info)
    'vs', 'versus', 'compare', 'comparison', 'better than', 'faster than',
    'which is better', 'should i buy', 'worth it', 'worth buying',
    
    // Availability/Market indicators
    'available', 'in stock', 'buy', 'purchase', 'order', 'pre order', 'preorder',
    'where to buy', 'how much', 'price', 'cost', 'priced at', 'costs',
    'on sale', 'discount', 'deal', 'offer', 'promotion',
    
    // Status indicators
    'is out', 'has been released', 'released', 'launch', 'launched', 'debut',
    'reveal', 'revealed', 'unveil', 'unveiled', 'announce', 'announced'
  ];
  
  // Topics that typically need current information (COMPREHENSIVE LIST)
  const currentTopics = [
    // Electronics & Technology
    'phone', 'mobile', 'smartphone', 'iphone', 'android', 'samsung', 'google pixel',
    'processor', 'cpu', 'gpu', 'chipset', 'snapdragon', 'apple silicon', 'intel', 'amd', 'nvidia',
    'laptop', 'computer', 'pc', 'mac', 'macbook', 'tablet', 'ipad',
    'gadget', 'device', 'tech', 'technology', 'electronics',
    'smartwatch', 'watch', 'wearable', 'fitness tracker', 'airpods', 'earbuds', 'headphones',
    'camera', 'dslr', 'mirrorless', 'lens', 'photography',
    'tv', 'television', 'smart tv', 'oled', 'qled', 'monitor', 'display', 'screen',
    'speaker', 'soundbar', 'audio', 'bluetooth',
    'router', 'wifi', 'modem', 'internet', 'broadband', '5g', '6g',
    'drone', 'robot', 'smart home', 'alexa', 'google home', 'siri',
    
    // Vehicles & Transportation
    'car', 'vehicle', 'automobile', 'sedan', 'suv', 'truck', 'van',
    'electric vehicle', 'ev', 'electric car', 'hybrid', 'tesla', 'bmw', 'mercedes', 'toyota',
    'bike', 'motorcycle', 'scooter', 'cycle', 'bicycle',
    'bus', 'train', 'metro', 'flight', 'airplane', 'airline',
    
    // Software & Apps
    'app', 'application', 'software', 'program', 'tool', 'platform',
    'ios app', 'android app', 'windows', 'macos', 'linux',
    'browser', 'chrome', 'safari', 'firefox', 'edge',
    'game', 'video game', 'gaming', 'playstation', 'xbox', 'nintendo', 'steam',
    'social media', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube',
    
    // AI & Machine Learning
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
    'chatgpt', 'gpt', 'claude', 'gemini', 'llm', 'language model',
    'chatbot', 'ai model', 'ai tool',
    
    // Business & Finance
    'stock', 'share', 'market', 'stock market', 'nasdaq', 'dow jones',
    'crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain',
    'company', 'startup', 'business', 'ipo', 'merger', 'acquisition',
    'salary', 'wage', 'job', 'employment', 'hiring', 'layoff',
    'economy', 'recession', 'inflation', 'gdp', 'interest rate',
    
    // Entertainment & Media
    'movie', 'film', 'cinema', 'netflix', 'disney', 'amazon prime', 'streaming',
    'series', 'tv show', 'show', 'episode', 'season',
    'music', 'song', 'album', 'artist', 'singer', 'band', 'concert', 'spotify',
    'book', 'novel', 'author', 'bestseller', 'kindle',
    'celebrity', 'actor', 'actress', 'star',
    
    // News & Events
    'news', 'breaking news', 'headlines', 'story',
    'event', 'announcement', 'conference', 'summit', 'convention',
    'election', 'vote', 'politics', 'government', 'president', 'prime minister',
    'war', 'conflict', 'peace', 'treaty', 'agreement',
    'disaster', 'earthquake', 'hurricane', 'flood', 'fire',
    
    // Sports
    'sports', 'sport', 'match', 'game', 'tournament', 'championship',
    'football', 'soccer', 'cricket', 'basketball', 'baseball', 'tennis',
    'olympics', 'world cup', 'fifa', 'nba', 'nfl', 'ipl',
    'player', 'team', 'score', 'result', 'winner', 'champion',
    
    // Science & Research
    'research', 'study', 'discovery', 'breakthrough', 'finding',
    'vaccine', 'medicine', 'drug', 'treatment', 'cure', 'therapy',
    'disease', 'virus', 'covid', 'pandemic', 'epidemic',
    'space', 'nasa', 'spacex', 'rocket', 'satellite', 'mars', 'moon',
    'climate', 'climate change', 'global warming', 'weather', 'temperature',
    
    // Education & Learning
    'university', 'college', 'school', 'admission', 'exam', 'test',
    'course', 'program', 'degree', 'certification', 'online course',
    
    // Real Estate & Travel
    'property', 'real estate', 'house', 'apartment', 'rent', 'mortgage',
    'hotel', 'resort', 'travel', 'tourism', 'vacation', 'trip', 'destination',
    'visa', 'passport', 'flight ticket',
    
    // Food & Restaurant
    'restaurant', 'cafe', 'food', 'cuisine', 'recipe', 'menu',
    
    // Fashion & Shopping
    'fashion', 'clothing', 'brand', 'designer', 'collection',
    'shopping', 'store', 'retail', 'ecommerce', 'amazon', 'flipkart',
    
    // Health & Fitness
    'health', 'fitness', 'workout', 'exercise', 'gym', 'yoga',
    'diet', 'nutrition', 'weight loss', 'protein', 'supplement',
    
    // General time-sensitive topics
    'price', 'cost', 'rate', 'value', 'worth',
    'review', 'rating', 'opinion', 'verdict',
    'specification', 'specs', 'feature', 'detail',
    'release date', 'launch date', 'availability'
  ];
  
  // Check if query contains current info indicators
  const hasCurrentIndicator = currentInfoIndicators.some(indicator => 
    lowerQuery.includes(indicator)
  );
  
  // Check if query is about topics that need current info
  const hasCurrentTopic = currentTopics.some(topic => 
    lowerQuery.includes(topic)
  );
  
  // If it has both a current indicator AND a current topic, definitely needs search
  if (hasCurrentIndicator && hasCurrentTopic) {
    return true;
  }
  
  // Strong indicators that alone trigger search (EXPANDED)
  const strongIndicators = [
    'latest', 'newest', 'current', 'recent', 'today', 'now', 'this year', 'this month',
    '2026', '2025', 'in 2026', 'in 2025',
    'what is new', 'what\'s new', 'whats new',
    'just released', 'just announced', 'just launched',
    'breaking news', 'news today'
  ];
  if (strongIndicators.some(indicator => lowerQuery.includes(indicator))) {
    return true;
  }
  
  // Topics that almost always need current info (even without indicators)
  const alwaysCurrentTopics = [
    'news', 'breaking news', 'headlines',
    'weather', 'temperature',
    'stock price', 'crypto price', 'bitcoin price',
    'score', 'match result', 'game result',
    'trending', 'viral',
    'traffic', 'flight status'
  ];
  if (alwaysCurrentTopics.some(topic => lowerQuery.includes(topic))) {
    return true;
  }
  
  // Question patterns that often need current info
  const currentQuestionPatterns = [
    /what.*(?:best|top|leading|fastest)/,
    /which.*(?:better|best|recommended)/,
    /how much.*(?:cost|price)/,
    /when.*(?:release|launch|available)/,
    /is.*(?:out|available|released)/,
    /has.*(?:released|launched|announced)/
  ];
  if (currentQuestionPatterns.some(pattern => pattern.test(lowerQuery))) {
    // Additional check: must contain at least one current topic for these patterns
    if (hasCurrentTopic) {
      return true;
    }
  }
  
  return false;
}

/**
 * Perform web search using Tavily
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  if (!tvly) {
    console.warn('⚠️ Tavily API key not configured - skipping web search');
    return [];
  }
  
  try {
    console.log(`🔍 Searching web for: "${query}"`);
    
    const response = await tvly.search(query, {
      maxResults,
      searchDepth: 'advanced',
      includeAnswer: false,
      includeRawContent: false,
      includeDomains: [],
      excludeDomains: []
    });
    
    const results: SearchResult[] = response.results.map((result: any) => ({
      title: result.title || '',
      url: result.url || '',
      content: result.content || '',
      score: result.score || 0
    }));
    
    console.log(`✅ Found ${results.length} web search results`);
    return results;
    
  } catch (error) {
    console.error('❌ Web search error:', error);
    return [];
  }
}

/**
 * Format search results for AI context
 */
export function formatSearchResultsForContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return '';
  }
  
  const formattedResults = results
    .map((result, index) => {
      return `[${index + 1}] ${result.title}\nSource: ${result.url}\n${result.content}\n`;
    })
    .join('\n');
  
  return `

🌐 CURRENT WEB SEARCH RESULTS (${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}):

${formattedResults}

IMPORTANT: Use the above web search results to provide current, accurate information. These results are from live sources and reflect the latest available data. Cite these sources in your response.`;
}
