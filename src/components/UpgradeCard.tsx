import React from 'react';

export const UpgradeCard: React.FC = () => {
  const features = [
    'More messages',
    'More file uploads',
    'More image generation',
    'More advanced data analysis',
    'More memory'
  ];

  const handleUpgrade = () => {
    // Frontend-only: placeholder for upgrade action
    console.log('Upgrade clicked');
  };

  const handleRestore = () => {
    // Frontend-only: placeholder for restore action
    console.log('Restore subscription clicked');
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Features List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {features.map((feature, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 16,
                color: 'var(--text)'
              }}
            >
              <span style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 600 }}>✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* Restore Subscription Link */}
        <button
          className="btn-ghost"
          onClick={handleRestore}
          style={{
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--sub)',
            textDecoration: 'underline',
            fontSize: 14,
            fontWeight: 400,
            justifyContent: 'flex-start',
            minHeight: 'auto',
            cursor: 'pointer'
          }}
        >
          Restore subscription
        </button>

        {/* Upgrade Button */}
        <button
          onClick={handleUpgrade}
          style={{
            width: '100%',
            background: '#111111',
            color: '#FFFFFF',
            padding: '16px 24px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 16,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: 'var(--touch-target)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2A2A2A';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#111111';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Upgrade to Go
        </button>

        {/* Pricing Info */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--sub)',
            lineHeight: '1.5'
          }}
        >
          Renews for ₹399.00/month. Cancel anytime.
        </div>
      </div>
    </div>
  );
};

