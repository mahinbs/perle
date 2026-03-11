import type { DiscoverItem } from '../types';
 
const CACHE_KEY = 'perle-discover-cache-v2';

// -------------------------------------------------------------------
// Full topic pool — 10-12 per category.
// This is used as the primary source when no backend is available,
// and also synced to the backend discover.json.
// -------------------------------------------------------------------
const TOPIC_POOL: DiscoverItem[] = [
  // ─── Technology ─────────────────────────────────────────────────
  { id: 'ai-healthcare', title: 'AI in Healthcare', tag: 'Trending', image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=300&fit=crop', alt: 'AI in healthcare', description: 'How artificial intelligence is revolutionizing medical diagnosis and treatment', category: 'Technology' },
  { id: 'quantum-computing', title: 'Quantum Computing Advances', tag: 'Breakthrough', image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=300&fit=crop', alt: 'Quantum computing', description: 'How quantum computers are solving problems that classical computers cannot', category: 'Technology' },
  { id: 'cybersecurity', title: 'Cybersecurity Essentials', tag: 'Brief', image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&h=300&fit=crop', alt: 'Cybersecurity', description: 'Protecting your data and privacy in the digital age', category: 'Technology' },
  { id: 'machine-learning', title: 'Machine Learning Explained', tag: 'Brief', image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=300&fit=crop', alt: 'Machine learning', description: 'How machines learn from data and make intelligent predictions', category: 'Technology' },
  { id: 'blockchain', title: 'Blockchain Revolution', tag: 'Research', image: 'https://images.unsplash.com/photo-1639762681057-408e52192e55?w=600&h=300&fit=crop', alt: 'Blockchain', description: 'How decentralized ledgers are transforming trust and transactions', category: 'Technology' },
  { id: 'augmented-reality', title: 'Augmented Reality Future', tag: 'Hot', image: 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=600&h=300&fit=crop', alt: 'Augmented reality', description: 'How AR is blending the digital and physical worlds', category: 'Technology' },
  { id: '5g-tech', title: '5G Technology Impact', tag: 'Explain', image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=300&fit=crop', alt: '5G network', description: 'The speed and connectivity revolution reshaping society', category: 'Technology' },
  { id: 'robotics-manufacturing', title: 'Robotics in Manufacturing', tag: 'Research', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=300&fit=crop', alt: 'Robotics', description: 'Automation and robots are transforming factories and supply chains', category: 'Technology' },
  { id: 'cloud-computing', title: 'Cloud Computing Fundamentals', tag: 'Brief', image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&h=300&fit=crop', alt: 'Cloud computing', description: 'How the cloud powers modern software and business', category: 'Technology' },
  { id: 'natural-language-processing', title: 'Natural Language Processing', tag: 'Trending', image: 'https://images.unsplash.com/photo-1526378722484-bd91ca387e72?w=600&h=300&fit=crop', alt: 'NLP', description: 'Teaching computers to understand and generate human language', category: 'Technology' },
  { id: 'computer-vision', title: 'Computer Vision Applications', tag: 'Popular', image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&h=300&fit=crop', alt: 'Computer vision', description: 'How machines learn to see and interpret visual information', category: 'Technology' },
  { id: 'edge-computing', title: 'Edge Computing Explained', tag: 'Explain', image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=300&fit=crop', alt: 'Edge computing', description: 'Processing data closer to its source for faster real-time decisions', category: 'Technology' },

  // ─── Science ─────────────────────────────────────────────────────
  { id: 'space-exploration', title: 'Space Exploration Breakthroughs', tag: 'New', image: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=600&h=300&fit=crop', alt: 'Space exploration', description: 'Recent discoveries and missions expanding our understanding of the universe', category: 'Science' },
  { id: 'climate-science', title: 'Climate Change Science', tag: 'Research', image: 'https://images.unsplash.com/photo-1569163138754-2c2e3e5a7190?w=600&h=300&fit=crop', alt: 'Climate science', description: 'Latest research on global warming, carbon cycles, and mitigation strategies', category: 'Science' },
  { id: 'sleep-science', title: 'Science of Sleep', tag: 'Explain', image: 'https://images.unsplash.com/photo-1541783245831-57d6fb0926d3?w=600&h=300&fit=crop', alt: 'Sleep science', description: 'Why sleep matters and how to optimize it for health and performance', category: 'Science' },
  { id: 'crispr-gene-editing', title: 'CRISPR Gene Editing', tag: 'Breakthrough', image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=300&fit=crop', alt: 'Gene editing', description: 'How gene editing is opening new frontiers in medicine and biology', category: 'Science' },
  { id: 'black-holes', title: 'Black Holes Explained', tag: 'Popular', image: 'https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=600&h=300&fit=crop', alt: 'Black hole', description: 'The mysteries of the densest and most fascinating objects in the universe', category: 'Science' },
  { id: 'neuroplasticity', title: 'Neuroplasticity Research', tag: 'Hot', image: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=300&fit=crop', alt: 'Brain neuroplasticity', description: 'How the brain rewires itself with experience, learning, and therapy', category: 'Science' },
  { id: 'particle-physics', title: 'Particle Physics Basics', tag: 'Brief', image: 'https://images.unsplash.com/photo-1635070041409-e63e783ce3c1?w=600&h=300&fit=crop', alt: 'Particle physics', description: 'The building blocks of the universe at the subatomic scale', category: 'Science' },
  { id: 'ocean-exploration', title: 'Deep Ocean Exploration', tag: 'New', image: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=600&h=300&fit=crop', alt: 'Ocean exploration', description: 'Discovering life and geology in the deep ocean', category: 'Science' },
  { id: 'nanotechnology', title: 'Nanotechnology Advances', tag: 'Research', image: 'https://images.unsplash.com/photo-1554475901-4538ddfbccc2?w=600&h=300&fit=crop', alt: 'Nanotechnology', description: 'Engineering at the scale of atoms for medicine and materials', category: 'Science' },
  { id: 'astrobiology', title: 'Astrobiology and Life in Space', tag: 'Trending', image: 'https://images.unsplash.com/photo-1614728894747-a83421789f10?w=600&h=300&fit=crop', alt: 'Astrobiology', description: 'The search for life beyond Earth across the cosmos', category: 'Science' },
  { id: 'volcano-earth-science', title: 'Volcanology and Earth Science', tag: 'Explain', image: 'https://images.unsplash.com/photo-1554244933-d876deb6b2ff?w=600&h=300&fit=crop', alt: 'Volcano', description: 'What eruptions and plate tectonics reveal about our planet', category: 'Science' },

  // ─── Psychology ───────────────────────────────────────────────────
  { id: 'cognitive-psychology', title: 'Cognitive Psychology', tag: 'Brief', image: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=300&fit=crop', alt: 'Psychology', description: 'Understanding how the mind processes information and makes decisions', category: 'Psychology' },
  { id: 'sports-psychology', title: 'Sports Psychology', tag: 'Compare', image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759865889/960x0_ywcais.webp', alt: 'Sports psychology', description: 'Mental training techniques for peak athletic performance', category: 'Psychology' },
  { id: 'mental-resilience', title: 'Building Mental Resilience', tag: 'Research', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=300&fit=crop', alt: 'Mental resilience', description: 'Strategies to build emotional strength and bounce back from adversity', category: 'Psychology' },
  { id: 'science-of-happiness', title: 'The Science of Happiness', tag: 'Popular', image: 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=600&h=300&fit=crop', alt: 'Happiness', description: 'What research tells us about well-being, joy, and fulfillment', category: 'Psychology' },
  { id: 'behavioral-economics', title: 'Behavioral Economics', tag: 'Explain', image: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=600&h=300&fit=crop', alt: 'Behavioral economics', description: 'How psychology shapes economic decisions and markets', category: 'Psychology' },
  { id: 'emotional-intelligence', title: 'Emotional Intelligence', tag: 'Hot', image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=300&fit=crop', alt: 'Emotional intelligence', description: 'Understanding and mastering emotions for better relationships', category: 'Psychology' },
  { id: 'decision-making-biases', title: 'Decision Making and Biases', tag: 'Brief', image: 'https://images.unsplash.com/photo-1455849318743-b2233052fcff?w=600&h=300&fit=crop', alt: 'Decision making', description: 'The cognitive shortcuts and biases that shape every choice we make', category: 'Psychology' },
  { id: 'mindfulness-research', title: 'Mindfulness Research', tag: 'Trending', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=300&fit=crop', alt: 'Mindfulness', description: 'Evidence-based benefits of mindfulness and meditation', category: 'Psychology' },
  { id: 'attachment-theory', title: 'Attachment Theory', tag: 'Research', image: 'https://images.unsplash.com/photo-1491438590914-bc09fcaaf77a?w=600&h=300&fit=crop', alt: 'Attachment', description: 'How early bonds shape our relationships throughout life', category: 'Psychology' },
  { id: 'psychology-of-habits', title: 'The Psychology of Habits', tag: 'Explain', image: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=600&h=300&fit=crop', alt: 'Habits', description: 'How habits form, break, and shape who we are', category: 'Psychology' },
  { id: 'motivation-science', title: 'Motivation and Self-Determination', tag: 'Popular', image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=300&fit=crop', alt: 'Motivation', description: 'What drives human motivation and how to sustain it', category: 'Psychology' },

  // ─── Health Care ─────────────────────────────────────────────────
  { id: 'mental-health-care', title: 'Mental Health Care', tag: 'Research', image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759865727/home-based-medical-care-bringing-healthcare-to-your-doorstep_tgkhkw.png', alt: 'Mental health', description: 'Modern approaches to mental health treatment and wellness', category: 'Health Care' },
  { id: 'nutrition-science', title: 'Nutrition and Diet Science', tag: 'Explain', image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&h=300&fit=crop', alt: 'Nutrition', description: 'Evidence-based nutrition for optimal health and disease prevention', category: 'Health Care' },
  { id: 'gut-microbiome', title: 'Gut Microbiome Health', tag: 'Hot', image: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&h=300&fit=crop', alt: 'Gut health', description: 'How gut bacteria influence immunity, mood, and overall health', category: 'Health Care' },
  { id: 'exercise-brain', title: 'Exercise and the Brain', tag: 'Trending', image: 'https://images.unsplash.com/photo-1594737625785-a6cbdabd333c?w=600&h=300&fit=crop', alt: 'Exercise brain health', description: 'How physical activity boosts cognition, mood, and mental health', category: 'Health Care' },
  { id: 'cancer-immunotherapy', title: 'Cancer Immunotherapy', tag: 'Breakthrough', image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=300&fit=crop', alt: 'Cancer therapy', description: 'How the immune system is being trained to fight cancer', category: 'Health Care' },
  { id: 'telemedicine', title: 'Telemedicine Revolution', tag: 'New', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=600&h=300&fit=crop', alt: 'Telemedicine', description: 'How remote healthcare is expanding access to quality treatment', category: 'Health Care' },
  { id: 'precision-medicine', title: 'Precision Medicine', tag: 'Research', image: 'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?w=600&h=300&fit=crop', alt: 'Precision medicine', description: 'Tailoring medical treatment to the individual genetic profile', category: 'Health Care' },
  { id: 'longevity-science', title: 'Aging and Longevity Science', tag: 'Popular', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=300&fit=crop', alt: 'Longevity', description: 'The science of slowing aging and living longer, healthier lives', category: 'Health Care' },
  { id: 'vaccine-science', title: 'Vaccine Science', tag: 'Brief', image: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=600&h=300&fit=crop', alt: 'Vaccine', description: 'How vaccines work and the science behind immunization', category: 'Health Care' },
  { id: 'heart-health', title: 'Heart Health Innovations', tag: 'Hot', image: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=600&h=300&fit=crop', alt: 'Heart health', description: 'The latest advances in cardiovascular disease prevention and treatment', category: 'Health Care' },

  // ─── Environment ─────────────────────────────────────────────────
  { id: 'sustainable-energy', title: 'Sustainable Energy Solutions', tag: 'Hot', image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=600&h=300&fit=crop', alt: 'Solar panels', description: 'Latest innovations in renewable energy and their impact on climate change', category: 'Environment' },
  { id: 'renewable-tech', title: 'Renewable Energy Technologies', tag: 'Compare', image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&h=300&fit=crop', alt: 'Renewable energy', description: 'Solar, wind, hydro, and other clean energy technologies compared', category: 'Environment' },
  { id: 'biodiversity', title: 'Biodiversity Conservation', tag: 'Research', image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=300&fit=crop', alt: 'Biodiversity', description: 'Why protecting species diversity is critical for planetary health', category: 'Environment' },
  { id: 'plastic-pollution', title: 'Plastic Pollution Solutions', tag: 'Trending', image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&h=300&fit=crop', alt: 'Plastic pollution', description: 'Innovative approaches to reducing and reversing plastic pollution', category: 'Environment' },
  { id: 'electric-vehicles', title: 'Electric Vehicles Impact', tag: 'New', image: 'https://images.unsplash.com/photo-1593941707874-ef25b8b4a92b?w=600&h=300&fit=crop', alt: 'Electric vehicles', description: 'How EVs are transforming transportation and reducing emissions', category: 'Environment' },
  { id: 'coral-reefs', title: 'Coral Reef Restoration', tag: 'Popular', image: 'https://images.unsplash.com/photo-1546026423-cc4642628d2b?w=600&h=300&fit=crop', alt: 'Coral reef', description: 'Science-backed methods to restore dying coral reef ecosystems', category: 'Environment' },
  { id: 'carbon-sequestration', title: 'Forest Carbon Sequestration', tag: 'Research', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&h=300&fit=crop', alt: 'Forest carbon', description: 'How forests absorb CO₂ and the role of reforestation', category: 'Environment' },
  { id: 'water-conservation', title: 'Water Conservation Strategies', tag: 'Brief', image: 'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=600&h=300&fit=crop', alt: 'Water conservation', description: 'Managing the world\'s freshwater resources for a sustainable future', category: 'Environment' },
  { id: 'circular-economy', title: 'The Circular Economy', tag: 'Explain', image: 'https://images.unsplash.com/photo-1542601906897-ffffb4853af0?w=600&h=300&fit=crop', alt: 'Circular economy', description: 'Redesigning production to eliminate waste and regenerate resources', category: 'Environment' },
  { id: 'urban-sustainability', title: 'Urban Sustainability', tag: 'Hot', image: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&h=300&fit=crop', alt: 'Smart city', description: 'How cities are being redesigned to become greener and smarter', category: 'Environment' },

  // ─── Finance ──────────────────────────────────────────────────────
  { id: 'personal-finance', title: 'Personal Finance Fundamentals', tag: 'Explain', image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759864459/Banner-image_10.2e16d0ba.fill-1600x900_aamymr.jpg', alt: 'Personal finance', description: 'Building wealth through smart financial planning and investment', category: 'Finance' },
  { id: 'cryptocurrency', title: 'Cryptocurrency Explained', tag: 'Hot', image: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=600&h=300&fit=crop', alt: 'Cryptocurrency', description: 'Bitcoin, Ethereum, and the rise of digital currencies', category: 'Finance' },
  { id: 'stock-market', title: 'Stock Market Basics', tag: 'Brief', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=300&fit=crop', alt: 'Stock market', description: 'How equity markets work and how to start investing', category: 'Finance' },
  { id: 'behavioral-finance', title: 'Behavioral Finance', tag: 'Research', image: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=600&h=300&fit=crop', alt: 'Behavioral finance', description: 'How psychology drives financial decisions and market behavior', category: 'Finance' },
  { id: 'real-estate-investment', title: 'Real Estate Investment', tag: 'Popular', image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&h=300&fit=crop', alt: 'Real estate', description: 'How to build wealth through property investment', category: 'Finance' },
  { id: 'financial-independence', title: 'Financial Independence', tag: 'Trending', image: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&h=300&fit=crop', alt: 'Financial independence', description: 'The path to financial freedom and retiring early', category: 'Finance' },
  { id: 'impact-investing', title: 'Impact Investing', tag: 'New', image: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600&h=300&fit=crop', alt: 'Impact investing', description: 'Generating financial returns while driving positive social change', category: 'Finance' },
  { id: 'startup-funding', title: 'Startup Funding Explained', tag: 'Explain', image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=300&fit=crop', alt: 'Startup funding', description: 'From bootstrapping and angel investors to venture capital and IPOs', category: 'Finance' },
  { id: 'inflation-money', title: 'Inflation and Your Money', tag: 'Brief', image: 'https://images.unsplash.com/photo-1554774853-719586f82d77?w=600&h=300&fit=crop', alt: 'Inflation', description: 'How inflation erodes purchasing power and strategies to protect your wealth', category: 'Finance' },
  { id: 'retirement-planning', title: 'Retirement Planning', tag: 'Compare', image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&h=300&fit=crop', alt: 'Retirement planning', description: 'Building a secure retirement through smart planning and investing', category: 'Finance' },

  // ─── Sports ───────────────────────────────────────────────────────
  { id: 'sports-science', title: 'Sports Science Innovations', tag: 'Popular', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&h=300&fit=crop', alt: 'Sports science', description: 'How technology and science improve athletic performance and safety', category: 'Sports' },
  { id: 'recovery-science', title: 'Recovery Science in Sports', tag: 'Research', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=300&fit=crop', alt: 'Sports recovery', description: 'How elite athletes use science to recover faster and perform better', category: 'Sports' },
  { id: 'athlete-nutrition', title: 'Nutrition for Athletes', tag: 'Explain', image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&h=300&fit=crop', alt: 'Athlete nutrition', description: 'Fueling peak performance through sports nutrition and diet', category: 'Sports' },
  { id: 'wearable-sports-tech', title: 'Wearable Tech in Sports', tag: 'Hot', image: 'https://images.unsplash.com/photo-1576243345690-4e4b79b63288?w=600&h=300&fit=crop', alt: 'Wearable tech', description: 'How smartwatches and sensors are revolutionizing training', category: 'Sports' },
  { id: 'esports', title: 'The Rise of eSports', tag: 'Trending', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=300&fit=crop', alt: 'eSports', description: 'How competitive gaming became a global billion-dollar industry', category: 'Sports' },
  { id: 'olympic-training', title: 'Olympic Training Methods', tag: 'Brief', image: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=600&h=300&fit=crop', alt: 'Olympic training', description: 'The science and discipline behind elite Olympic athlete preparation', category: 'Sports' },
  { id: 'cricket-analytics', title: 'Cricket Analytics', tag: 'New', image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&h=300&fit=crop', alt: 'Cricket', description: 'Data analytics transforming how cricket is played and coached', category: 'Sports' },
  { id: 'football-tactics', title: 'Football Tactics Evolution', tag: 'Compare', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=300&fit=crop', alt: 'Football tactics', description: 'How modern football tactics have evolved with data and science', category: 'Sports' },
  { id: 'swimming-biomechanics', title: 'Swimming Biomechanics', tag: 'Research', image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600&h=300&fit=crop', alt: 'Swimming', description: 'The physics and physiology behind elite swimming performance', category: 'Sports' },
  { id: 'mental-performance-sports', title: 'Mental Performance in Sports', tag: 'Popular', image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=300&fit=crop', alt: 'Mental performance', description: 'The psychology behind clutch performance and focus under pressure', category: 'Sports' },
];

// -------------------------------------------------------------------
// Deterministic shuffle seeded by date (same order for 24h)
// -------------------------------------------------------------------
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  // mulberry32 prng
  const rand = (s: number) => { let t = s + 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand((h + i) >>> 0) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function todaySeed(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// -------------------------------------------------------------------
// Cache helpers
// -------------------------------------------------------------------
interface DiscoverCache { items: DiscoverItem[]; date: string; }

function getCached(): DiscoverItem[] | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    if (!raw) return null;
    const cache: DiscoverCache = JSON.parse(raw);
    // Expire when the date changes (24h rotation)
    if (cache.date !== todaySeed()) return null;
    return cache.items;
  } catch { return null; }
}

function setCache(items: DiscoverItem[]) {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(CACHE_KEY, JSON.stringify({ items, date: todaySeed() }));
  } catch { /* ignore */ }
}

// Returns today's shuffled topic pool (from cache, API, or local pool)
async function fetchAndCache(): Promise<DiscoverItem[]> {
  const baseUrl = (import.meta as any)?.env?.VITE_API_URL as string | undefined;

  if (baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/discover`);
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          setCache(items);
          return items;
        }
      }
    } catch { /* fall through to local pool */ }
  }

  // Backend unavailable — use local TOPIC_POOL with daily shuffle
  const shuffled = seededShuffle(TOPIC_POOL, todaySeed());
  setCache(shuffled);
  return shuffled;
}

export const getAllDiscoverItems = async (): Promise<DiscoverItem[]> => {
  const cached = getCached();
  if (cached && cached.length > 0) return cached;
  return fetchAndCache();
};

export const getDiscoverItemById = async (id: string): Promise<DiscoverItem | null> => {
  const all = await getAllDiscoverItems();
  return all.find(item => item.id === id) || null;
};
