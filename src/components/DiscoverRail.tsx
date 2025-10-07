import React from 'react';
import type { DiscoverItem } from '../types';

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
];

export const DiscoverRail: React.FC = () => {
  const handleItemClick = (item: DiscoverItem) => {
    // In a real app, this would navigate to a detailed view or trigger a search
    console.log('Clicked discover item:', item.title);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="h3">Discover</div>
        <button className="btn-ghost" style={{ fontSize: 14 }}>
          View All →
        </button>
      </div>
      
      <div className="scroll-x">
        {discoverItems.map(item => (
          <div 
            key={item.id} 
            className="card" 
            style={{ 
              padding: 0, 
              minWidth: 240, 
              maxWidth: 280,
              overflow: 'hidden',
              cursor: 'pointer'
            }}
            onClick={() => handleItemClick(item)}
          >
            <img 
              src={item.image} 
              alt={item.alt} 
              style={{ 
                display: 'block', 
                width: '100%', 
                height: 140, 
                objectFit: 'cover' 
              }} 
            />
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {item.title}
              </div>
              <div className="sub text-sm" style={{ marginBottom: 8, lineHeight: '18px' }}>
                {item.description}
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="chip" style={{ fontSize: 11 }}>
                  {item.tag}
                </span>
                <span className="sub text-sm">
                  {item.category}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
