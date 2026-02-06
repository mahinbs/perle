import { searchWithAzureGrounding } from './azureGroundingSearch.js';

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
  
  // Quick check: if query is very generic (< 3 words and no tech terms), might not need search
  const wordCount = lowerQuery.split(/\s+/).length;
  if (wordCount <= 2) {
    // Very short queries like "hello", "thanks" don't need search
    const genericPhrases = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no'];
    if (genericPhrases.some(phrase => lowerQuery === phrase)) {
      return false;
    }
  }
  
  // Keywords that indicate need for current information (COMPREHENSIVE LIST + MISSPELLINGS)
  const currentInfoIndicators = [
    // Time-based indicators
    'latest', 'newest', 'current', 'recent', 'today', 'now', 'this year', 'this month', 'this week',
    'last year', 'last month', 'last week', 'yesterday', 'right now', 'at the moment',
    '2026', '2025', '2024', '2023', 'in 2026', 'in 2025', 'in 2024',
    'up to date', 'most recent', 'as of now', 'currently', 'present', 'modern',
    // Misspellings of time-based
    'latst', 'lates', 'laest', 'newst', 'neest', 'curent', 'currnt', 'curren', 'recnt', 'resent',
    'todya', 'toady', 'ysterday', 'yestrday', 'curenttly', 'presentt', 'modrn', 'modren',
    
    // Status/Release indicators
    'what is new', 'what\'s new', 'whats new', 'new release', 'just released', 'newly released',
    'just announced', 'recently announced', 'newly launched', 'just launched',
    'upcoming', 'coming soon', 'future', 'next', 'next generation', 'next gen',
    // Misspellings
    'wat is new', 'whts new', 'wat new', 'relase', 'releae', 'relesed', 'anounced', 'annnounced',
    'launced', 'launchd', 'upcomng', 'upcomig', 'comng soon', 'futre', 'nxt',
    
    // Quality/Ranking indicators
    'best', 'top', 'leading', 'flagship', 'premium', 'most popular', 'trending',
    'top rated', 'highest rated', 'best rated', 'most recommended',
    'number one', 'no 1', '#1', 'top 10', 'top 5', 'best of',
    // Misspellings
    'bst', 'bset', 'bes', 'leadng', 'leadin', 'flagshp', 'premiun', 'premum', 'populr', 'poplar',
    'trendng', 'trendig', 'trening',
    
    // Technology/Innovation indicators
    'modern', 'contemporary', 'state of the art', 'cutting edge', 'most advanced',
    'innovative', 'breakthrough', 'revolutionary', 'game changing',
    // Misspellings
    'modrn', 'modren', 'advnced', 'advaned', 'inovative', 'inovatve', 'revolutionay', 'revolitionay',
    
    // Update/Change indicators
    'update', 'updated', 'upgrade', 'upgraded', 'improved', 'enhanced',
    'changed', 'modified', 'revised', 'new version', 'version',
    // Misspellings
    'updte', 'updtd', 'upgade', 'upgrad', 'improvd', 'imroved', 'enhaced', 'enhaned',
    'versn', 'vrsion', 'verion',
    
    // Comparison indicators (often need current info)
    'vs', 'versus', 'compare', 'comparison', 'better than', 'faster than', 'difference between',
    'which is better', 'which is best', 'should i buy', 'should i get', 'worth it', 'worth buying',
    'or', 'between', 'which one', 'what is better', 'what is best',
    // Misspellings
    'compar', 'compre', 'comparisn', 'comparision', 'beter than', 'betr', 'fastr', 'fastre',
    'diferrence', 'diferense', 'btween', 'betwn', 'wich', 'whch',
    
    // Availability/Market indicators
    'available', 'in stock', 'buy', 'purchase', 'order', 'pre order', 'preorder',
    'where to buy', 'how much', 'price', 'cost', 'priced at', 'costs',
    'on sale', 'discount', 'deal', 'offer', 'promotion',
    // Misspellings
    'avalable', 'availble', 'avilable', 'purchse', 'purchas', 'puchase', 'ordr', 'preordr',
    'pric', 'prce', 'cst', 'discout', 'disount',
    
    // Status indicators
    'is out', 'has been released', 'released', 'launch', 'launched', 'debut',
    'reveal', 'revealed', 'unveil', 'unveiled', 'announce', 'announced',
    // Misspellings
    'launh', 'lauch', 'debue', 'revea', 'unvei', 'anounce', 'anounced'
  ];
  
  // Topics that typically need current information (COMPREHENSIVE LIST + MISSPELLINGS)
  const currentTopics = [
    // Electronics & Technology
    'phone', 'mobile', 'smartphone', 'iphone', 'android', 'samsung', 'google pixel', 'oneplus', 'xiaomi', 'oppo', 'vivo',
    'processor', 'cpu', 'gpu', 'chipset', 'snapdragon', 'apple silicon', 'intel', 'amd', 'nvidia',
    'dimensity', 'mediatek', 'exynos', 'tensor', 'qualcomm', 'kirin', 'bionic',
    'laptop', 'computer', 'pc', 'mac', 'macbook', 'tablet', 'ipad',
    'gadget', 'device', 'tech', 'technology', 'electronics',
    'smartwatch', 'watch', 'wearable', 'fitness tracker', 'airpods', 'earbuds', 'headphones',
    'camera', 'dslr', 'mirrorless', 'lens', 'photography',
    'tv', 'television', 'smart tv', 'oled', 'qled', 'monitor', 'display', 'screen',
    'speaker', 'soundbar', 'audio', 'bluetooth',
    'router', 'wifi', 'modem', 'internet', 'broadband', '5g', '6g',
    'drone', 'robot', 'smart home', 'alexa', 'google home', 'siri',
    // Misspellings of Electronics & Technology
    'phne', 'phn', 'fone', 'fon', 'phon', 'pohne', 'ophne', 'mobil', 'moblie', 'moble', 'mobiel',
    'smartphne', 'smartfone', 'smarthone', 'smrtphone', 'iphne', 'ipone', 'iphone', 'ifone', 'iphon',
    'andriod', 'androd', 'androyd', 'androi', 'samsng', 'samsun', 'samung', 'gogle', 'googl', 'gooogle',
    'onepls', 'oneplus', 'onepluss', 'xiomi', 'xiaomi', 'xiami', 'opo', 'oppo', 'viv', 'vivo',
    'procesor', 'processer', 'procesoor', 'prcessor', 'proccessor', 'processr', 'procesro', 'proccesor',
    'chipst', 'chpset', 'chiset', 'snapdragn', 'snapdragon', 'snapdrgn', 'snapdrgon',
    'dimensty', 'dimesity', 'dimentity', 'mediatk', 'mediatek', 'mediatec', 'exynos', 'exynoss', 'exinos',
    'tensr', 'tensor', 'tensro', 'qualcom', 'qualcomm', 'qualcm', 'kirin', 'kirn', 'bionic', 'bionc',
    'lapto', 'laptpo', 'laptp', 'compter', 'computr', 'comuter', 'compuer',
    'macbok', 'macboo', 'macbk', 'tabl', 'tblet', 'tablte', 'ipa', 'ipad', 'ipd',
    'gadgt', 'gadet', 'devic', 'devis', 'devce', 'tecnology', 'technolgy', 'technlogy', 'tecnlogy',
    'electronis', 'electrnics', 'eletronics',
    'smartwach', 'smartwach', 'smrtwatch', 'watc', 'wach', 'wereable', 'wearble', 'airopods', 'airpod',
    'earbud', 'earbds', 'headphne', 'headfone', 'headpone',
    'camra', 'cemera', 'cmera', 'photograpy', 'fotography', 'photografy',
    'televison', 'televisin', 'telivision', 'monitr', 'moniter', 'displya', 'disply', 'scren', 'scrn',
    'speakr', 'speker', 'soundbr', 'auido', 'audo', 'bluetoth', 'blutooth', 'bluethooth',
    'ruter', 'routr', 'wif', 'wi-fi', 'modem', 'intrnet', 'intenet', 'brodband', 'broadbnd',
    
    // Vehicles & Transportation
    'car', 'vehicle', 'automobile', 'sedan', 'suv', 'truck', 'van',
    'electric vehicle', 'ev', 'electric car', 'hybrid', 'tesla', 'bmw', 'mercedes', 'toyota',
    'bike', 'motorcycle', 'scooter', 'cycle', 'bicycle',
    'bus', 'train', 'metro', 'flight', 'airplane', 'airline',
    // Misspellings
    'vehicl', 'vehical', 'vehcle', 'automibile', 'automble', 'sedn', 'teslaa', 'tesle', 'toyot',
    'motorcyle', 'motocycle', 'scootr', 'scoote', 'bycle', 'bicyle', 'airpalne', 'airplan',
    
    // Software & Apps
    'app', 'application', 'software', 'program', 'tool', 'platform',
    'ios app', 'android app', 'windows', 'macos', 'linux',
    'browser', 'chrome', 'safari', 'firefox', 'edge',
    'game', 'video game', 'gaming', 'playstation', 'xbox', 'nintendo', 'steam',
    'social media', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube',
    // Misspellings
    'aplication', 'aplicaton', 'aap', 'sofware', 'softwar', 'softwre', 'progam', 'prgram',
    'windos', 'wndows', 'winows', 'maos', 'mac os', 'linx', 'lnux',
    'browsr', 'broser', 'chromm', 'chrom', 'safri', 'safai', 'firefo', 'firefx',
    'gam', 'gme', 'gamng', 'gmng', 'playstaton', 'playstaion', 'xbx', 'nintedo', 'nintndo',
    'facbook', 'facebok', 'fb', 'instgram', 'instagra', 'insta', 'twitr', 'twiter', 'tiktk', 'tiktoc',
    'youtub', 'youtbe', 'ytube',
    
    // AI & Machine Learning
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
    'chatgpt', 'gpt', 'claude', 'gemini', 'llm', 'language model',
    'chatbot', 'ai model', 'ai tool',
    // Misspellings
    'artificail intelligence', 'artifical intelligence', 'machne learning', 'machin learning',
    'chatgp', 'chatgt', 'chat gpt', 'claud', 'claue', 'gemni', 'gemin', 'gemeni',
    'chatbt', 'chatbot', 'chat bot',
    
    // Business & Finance
    'stock', 'share', 'market', 'stock market', 'nasdaq', 'dow jones',
    'crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain',
    'company', 'startup', 'business', 'ipo', 'merger', 'acquisition',
    'salary', 'wage', 'job', 'employment', 'hiring', 'layoff',
    'economy', 'recession', 'inflation', 'gdp', 'interest rate',
    // Misspellings
    'stok', 'stck', 'shar', 'markt', 'mrket', 'nasdq', 'nasda',
    'crypto', 'cryto', 'cyrpto', 'cryptocurency', 'bitcon', 'bitconi', 'bitcion', 'etherium', 'etherum', 'blockchan',
    'compny', 'copany', 'startap', 'busines', 'busness', 'employmnt', 'emploment',
    'econmy', 'econoy', 'recesion', 'inflaton', 'infation',
    
    // Entertainment & Media
    'movie', 'film', 'cinema', 'netflix', 'disney', 'amazon prime', 'streaming',
    'series', 'tv show', 'show', 'episode', 'season',
    'music', 'song', 'album', 'artist', 'singer', 'band', 'concert', 'spotify',
    'book', 'novel', 'author', 'bestseller', 'kindle',
    'celebrity', 'actor', 'actress', 'star',
    // Misspellings
    'movi', 'moive', 'movei', 'flim', 'cinem', 'netflx', 'netlix', 'disny', 'diney', 'amazn prime',
    'streamng', 'streming', 'serie', 'sries', 'episod', 'epsode', 'seaon', 'seasn',
    'musi', 'musci', 'sng', 'albm', 'ablum', 'artst', 'singr', 'concrt', 'concer', 'spotif', 'spotyfi',
    'bok', 'novl', 'authr', 'kindl', 'kinle', 'celebrty', 'celebity', 'actr', 'actres',
    
    // News & Events
    'news', 'breaking news', 'headlines', 'story',
    'event', 'announcement', 'conference', 'summit', 'convention',
    'election', 'vote', 'politics', 'government', 'president', 'prime minister',
    'war', 'conflict', 'peace', 'treaty', 'agreement',
    'disaster', 'earthquake', 'hurricane', 'flood', 'fire',
    // Misspellings
    'nws', 'newz', 'breakng news', 'hedlines', 'headlins', 'stry', 'storey',
    'evnt', 'anouncement', 'anncouncement', 'conferenc', 'sumit', 'summitt', 'conventon',
    'electon', 'elction', 'vot', 'politcs', 'politiks', 'governmnt', 'govrnment', 'presiden', 'presedent',
    'dister', 'disastr', 'earthqake', 'eartquake', 'huricane', 'hurrican', 'flod',
    
    // Sports
    'sports', 'sport', 'match', 'game', 'tournament', 'championship',
    'football', 'soccer', 'cricket', 'basketball', 'baseball', 'tennis',
    'olympics', 'world cup', 'fifa', 'nba', 'nfl', 'ipl',
    'player', 'team', 'score', 'result', 'winner', 'champion',
    // Misspellings
    'sprt', 'sprts', 'mach', 'mtch', 'tournment', 'tournamnt', 'championshp', 'champinship',
    'footbal', 'fotball', 'socer', 'socr', 'criket', 'crcket', 'basketbal', 'baskeball', 'basball', 'tenis', 'teniss',
    'olimpics', 'olymics', 'worldcup', 'wrld cup', 'playstation', 'plyr', 'playr', 'tem', 'scor', 'reslt', 'winnr', 'champon',
    
    // Science & Research
    'research', 'study', 'discovery', 'breakthrough', 'finding',
    'vaccine', 'medicine', 'drug', 'treatment', 'cure', 'therapy',
    'disease', 'virus', 'covid', 'pandemic', 'epidemic',
    'space', 'nasa', 'spacex', 'rocket', 'satellite', 'mars', 'moon',
    'climate', 'climate change', 'global warming', 'weather', 'temperature',
    // Misspellings
    'resarch', 'reserch', 'researh', 'studie', 'studdy', 'discovry', 'discvery', 'breaktrough', 'findng',
    'vacine', 'vaccin', 'vaccinne', 'medicne', 'medcine', 'treatmnt', 'treatement', 'ther', 'theropy',
    'diseas', 'desease', 'vrus', 'viris', 'covd', 'cov19', 'pandmic', 'pandemc', 'epidmic',
    'spce', 'nas', 'spacx', 'roket', 'satelite', 'satllite', 'mrs', 'mon', 'wether', 'wheather', 'temperture', 'temprature',
    
    // Education & Learning
    'university', 'college', 'school', 'admission', 'exam', 'test',
    'course', 'program', 'degree', 'certification', 'online course',
    // Misspellings
    'univeristy', 'univrsity', 'univerity', 'colege', 'collge', 'scool', 'shool', 'admision', 'admissn',
    'exm', 'tst', 'corse', 'cours', 'progam', 'degre', 'certifcation', 'certificaton', 'onlin course',
    
    // Real Estate & Travel
    'property', 'real estate', 'house', 'apartment', 'rent', 'mortgage',
    'hotel', 'resort', 'travel', 'tourism', 'vacation', 'trip', 'destination',
    'visa', 'passport', 'flight ticket',
    // Misspellings
    'proprty', 'propety', 'realestate', 'hose', 'hous', 'apartmnt', 'apartement', 'rnt', 'mortage', 'morgage',
    'hotl', 'hotle', 'resrt', 'travl', 'trvel', 'torism', 'turism', 'vacaton', 'vacaion', 'trp', 'destinaton', 'destiation',
    'vis', 'viza', 'pasport', 'passprt', 'flght ticket',
    
    // Food & Restaurant
    'restaurant', 'cafe', 'food', 'cuisine', 'recipe', 'menu',
    // Misspellings
    'restraunt', 'resturant', 'restarant', 'caf', 'caffe', 'fod', 'fud', 'cusine', 'cuisin', 'recpe', 'recipie', 'mnu',
    
    // Fashion & Shopping
    'fashion', 'clothing', 'brand', 'designer', 'collection',
    'shopping', 'store', 'retail', 'ecommerce', 'amazon', 'flipkart',
    // Misspellings
    'fashon', 'fasion', 'clothng', 'clohing', 'brnd', 'brandd', 'desigr', 'designr', 'collecton', 'colection',
    'shopng', 'shoping', 'stor', 'retai', 'ecomerce', 'e-commerce', 'amazn', 'amzon', 'flipcart', 'flipkrt',
    
    // Health & Fitness
    'health', 'fitness', 'workout', 'exercise', 'gym', 'yoga',
    'diet', 'nutrition', 'weight loss', 'protein', 'supplement',
    // Misspellings
    'helth', 'healt', 'fitnes', 'fitess', 'workot', 'worout', 'exercis', 'excercise', 'gm', 'yog', 'yga',
    'deit', 'diet', 'nutition', 'nutrion', 'wieght loss', 'weight los', 'protien', 'protin', 'suplements', 'supplment',
    
    // General time-sensitive topics
    'price', 'cost', 'rate', 'value', 'worth',
    'review', 'rating', 'opinion', 'verdict',
    'specification', 'specs', 'feature', 'detail',
    'release date', 'launch date', 'availability',
    // Misspellings
    'pric', 'prce', 'cst', 'cos', 'rat', 'valu', 'wrth', 'wort',
    'revie', 'revew', 'ratng', 'opinon', 'opnion', 'verdct', 'verdit',
    'specificaton', 'specfication', 'specifikation', 'spec', 'spcs', 'feture', 'featuer', 'detil', 'detai',
    'relase date', 'releae date', 'launh date', 'launc date', 'availablity', 'availbility'
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
  
  // Strong indicators that alone trigger search (EXPANDED + MISSPELLINGS)
  const strongIndicators = [
    'latest', 'newest', 'current', 'recent', 'today', 'now', 'this year', 'this month',
    '2026', '2025', 'in 2026', 'in 2025',
    'what is new', 'what\'s new', 'whats new',
    'just released', 'just announced', 'just launched',
    'breaking news', 'news today',
    // Misspellings
    'latst', 'lates', 'laest', 'newst', 'neest', 'curent', 'currnt', 'curren', 'recnt', 'resent',
    'todya', 'toady', 'wat is new', 'whts new', 'wat new',
    'jst released', 'jus released', 'jst announced', 'jus announced', 'jst launched', 'jus launched',
    'breakng news', 'breakin news', 'nws today', 'news tday'
  ];
  if (strongIndicators.some(indicator => lowerQuery.includes(indicator))) {
    return true;
  }
  
  // Topics that almost always need current info (even without indicators + MISSPELLINGS)
  const alwaysCurrentTopics = [
    'news', 'breaking news', 'headlines',
    'weather', 'temperature',
    'stock price', 'crypto price', 'bitcoin price',
    'score', 'match result', 'game result',
    'trending', 'viral',
    'traffic', 'flight status',
    // Misspellings
    'nws', 'newz', 'breakng news', 'hedlines', 'headlins',
    'wether', 'wheather', 'temperture', 'temprature',
    'stok price', 'stock pric', 'cryto price', 'crypto pric', 'bitcon price', 'bitcoin pric',
    'scor', 'mach result', 'match reslt', 'gam result', 'game reslt',
    'trendng', 'trendig', 'virl', 'virall',
    'trafic', 'traffc', 'flght status', 'flight staus'
  ];
  if (alwaysCurrentTopics.some(topic => lowerQuery.includes(topic))) {
    return true;
  }
  
  // Question patterns that often need current info
  const currentQuestionPatterns = [
    /what.*(?:best|top|leading|fastest|latest|newest|current)/,
    /which.*(?:better|best|recommended|latest)/,
    /how much.*(?:cost|price)/,
    /when.*(?:release|launch|available)/,
    /is.*(?:out|available|released)/,
    /has.*(?:released|launched|announced)/,
    /what is.*(?:latest|newest|best|current)/,
    /what are.*(?:latest|newest|best|current|top)/,
    /tell me about.*(?:latest|newest|current)/,
    /list.*(?:latest|best|top|all)/,
    /show me.*(?:latest|best|top)/
  ];
  if (currentQuestionPatterns.some(pattern => pattern.test(lowerQuery))) {
    // Additional check: must contain at least one current topic for these patterns
    if (hasCurrentTopic) {
      return true;
    }
  }
  
  // "What is" questions about tech topics almost always need search
  const whatIsPatterns = [
    /^what (is|are) (the )?(latest|newest|best|current|top)/i,
    /^what (is|are) .*(processor|phone|chipset|mobile|cpu|gpu|chip)/i,
  ];
  if (whatIsPatterns.some(pattern => pattern.test(lowerQuery))) {
    return true;
  }
  
  return false;
}

/**
 * Perform web search using Azure Grounding with Bing via AI Foundry Agent Service
 * This replaces the old Bing Search v7 API which was retired in August 2025
 */
export async function searchWeb(query: string, maxResults: number = 15): Promise<SearchResult[]> {
  // Use Azure AI Foundry Agent Service with Grounding with Bing
  return await searchWithAzureGrounding(query, maxResults);
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
  
  const currentDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' });
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
  
  return `

🔴🔴🔴 CRITICAL BACKGROUND CONTEXT 🔴🔴🔴

📅 TODAY'S DATE: ${currentDate}
📅 CURRENT MONTH: ${currentMonth}
📅 CURRENT YEAR: ${currentYear}

You are operating in ${currentMonth} ${currentYear}.
ALL references to "latest", "current", "newest", "recent", "now" mean "as of ${currentMonth} ${currentYear}".
Prioritize ${currentYear} and late 2025 information. Older data (2024, 2023) may be outdated.

🔴🔴🔴 END BACKGROUND CONTEXT 🔴🔴🔴

🌐 WEB SEARCH RESULTS (Live Bing search from ${currentDate}):

${formattedResults}

CRITICAL INSTRUCTIONS:
1. Use ONLY the above web search results to provide current, accurate information
2. These results are from live Bing search as of ${currentDate}
3. Always cite sources using [1], [2], [3], etc. notation from the numbered search results above
4. ⚠️ NEVER use the phrase "[Context provided]" - ONLY cite numbered sources like [1], [2], etc.
5. ALL facts MUST come from search results with [source number] citations

⚠️ CRITICAL INTERPRETATION GUIDELINES (NOT to be cited - only for interpreting search results):

🔴 WHEN USER ASKS ABOUT "PROCESSORS" OR "CHIPSETS" - READ THIS CAREFULLY:

THE USER WANTS PROCESSOR/CHIPSET NAMES, NOT PHONE MODEL NAMES!

✅ ANSWER WITH THESE (from search results):
• Processor/Chipset names: "Snapdragon 8 Elite Gen 5", "Apple A19 Pro", "Dimensity 9500", "Exynos 2600", "Tensor G5"
• Performance specs: CPU cores, GPU, benchmarks, AnTuTu scores
• Manufacturing process: 3nm, 2nm, etc.
• Release timeline: when each processor was announced/released

❌ DO NOT ANSWER WITH THESE:
• Phone model names: "Galaxy S26", "iPhone 17 Pro", "Pixel 10a" (these are PHONES, not PROCESSORS!)
• Phone features: camera specs, screen size, battery
• Only mention phone models when explaining "which phones use this processor"

🔴 MANDATORY FORMAT when answering processor questions:

"The latest mobile processors in ${currentMonth} ${currentYear} include:

1. **[Processor Name]** by [Manufacturer] [source]
   - Used in: [phone models that use it]
   - Performance: [CPU/GPU specs, benchmarks]
   - Release: [when it was announced/released]

2. **[Next Processor Name]** by [Manufacturer] [source]
   ..."

🔴 BRAND BALANCE:
- Search results contain info about Apple, Qualcomm, MediaTek, Samsung, Google processors
- You MUST mention ALL brands found in search results
- DO NOT present only Apple/iPhone processors
- DO NOT skip Android chipsets (Snapdragon, Dimensity, Exynos, Tensor)

🔴 GENERAL GUIDELINES FOR ALL QUERIES:

1. TEMPORAL AWARENESS:
   - Today's date: ${currentDate} (${currentMonth} ${currentYear})
   - Interpret "latest", "current", "recent", "now" as of ${currentMonth} ${currentYear}
   - Prioritize ${currentYear} and late 2025 information from search results
   - If search results show conflicting years/dates, note which is most recent

2. CITATION REQUIREMENTS:
   - ALL facts MUST cite search results: [1], [2], [3], etc.
   - NEVER use "[Context provided]" or similar phrases
   - Only cite the numbered search results above
   - Do NOT cite these interpretation guidelines

3. COMPREHENSIVENESS:
   - Present ALL relevant information found in search results
   - Do NOT cherry-pick only certain brands/options
   - If multiple brands/options are mentioned, include them ALL
   - Present in order of prominence in search results

4. ACCURACY:
   - Use ONLY information from search results
   - Do NOT add facts not present in search results
   - If information is unclear/conflicting, cite multiple sources and note the discrepancy`;
}
