import type { DiscoverItem } from '../types';

// This would typically be an API call in a real app
const discoverItems: DiscoverItem[] = [
  {
    id: 'cognitive-psychology',
    title: 'Cognitive Psychology',
    tag: 'Brief',
    image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759865401/black_background_qachfc.jpg',
    alt: 'Psychology themed background image',
    description: 'Understanding how the mind processes information and makes decisions',
    category: 'Psychology'
  },
  {
    id: 'mental-health-care',
    title: 'Mental Health Care',
    tag: 'Research',
    image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759865727/home-based-medical-care-bringing-healthcare-to-your-doorstep_tgkhkw.png',
    alt: 'Home-based medical care image',
    description: 'Modern approaches to mental health treatment and wellness',
    category: 'Health Care'
  },
  {
    id: 'personal-finance',
    title: 'Personal Finance',
    tag: 'Explain',
    image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759864459/Banner-image_10.2e16d0ba.fill-1600x900_aamymr.jpg',
    alt: 'Finance themed background image',
    description: 'Building wealth through smart financial planning and investment',
    category: 'Finance'
  },
  {
    id: 'sports-psychology',
    title: 'Sports Psychology',
    tag: 'Compare',
    image: 'https://res.cloudinary.com/dknafpppp/image/upload/v1759865889/960x0_ywcais.webp',
    alt: 'Sports psychology and mental training image',
    description: 'Mental training techniques for peak athletic performance',
    category: 'Sports'
  },
  {
    id: '1',
    title: 'The Future of AI in Healthcare',
    description: 'Exploring how artificial intelligence is revolutionizing medical diagnosis and treatment.',
    image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=200&fit=crop',
    alt: 'AI in healthcare',
    tag: 'Trending',
    category: 'Technology'
  },
  {
    id: '2',
    title: 'Sustainable Energy Solutions',
    description: 'Latest innovations in renewable energy and their impact on climate change.',
    image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=400&h=200&fit=crop',
    alt: 'Solar panels',
    tag: 'Hot',
    category: 'Environment'
  },
  {
    id: '3',
    title: 'Space Exploration Breakthroughs',
    description: 'Recent discoveries and missions that are expanding our understanding of the universe.',
    image: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=400&h=200&fit=crop',
    alt: 'Space exploration',
    tag: 'New',
    category: 'Science'
  },
  {
    id: '4',
    title: 'Quantum Computing Advances',
    description: 'How quantum computers are solving problems that classical computers cannot.',
    image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&h=200&fit=crop',
    alt: 'Quantum computing',
    tag: 'Breakthrough',
    category: 'Technology'
  },
  {
    id: '5',
    title: 'Climate Change Solutions',
    description: 'Innovative approaches to combating climate change and environmental degradation.',
    image: 'https://images.unsplash.com/photo-1569163139394-de6e45c2e44e?w=400&h=200&fit=crop',
    alt: 'Climate solutions',
    tag: 'Important',
    category: 'Environment'
  },
  {
    id: '6',
    title: 'Sports Science Innovations',
    description: 'How technology and science are improving athletic performance and safety.',
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=200&fit=crop',
    alt: 'Sports science',
    tag: 'Popular',
    category: 'Sports'
  }
];

export const getDiscoverItemById = (id: string): DiscoverItem | null => {
  return discoverItems.find(item => item.id === id) || null;
};

export const getAllDiscoverItems = (): DiscoverItem[] => {
  return discoverItems;
};
