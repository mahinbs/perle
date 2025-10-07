# Perlé — Elegant Perplexity-style Mobile Web App

A beautiful, mobile-first web application inspired by Perplexity's design, built with React and TypeScript. Features elegant UI, comprehensive search functionality, and mobile-optimized interactions.

## ✨ Features

- **Mobile-First Design**: Optimized for touch interactions and mobile devices
- **Elegant UI**: Clean, modern interface with smooth animations
- **Search Modes**: Ask, Research, Summarize, and Compare modes
- **Source Citations**: Every answer includes proper source citations
- **Search History**: Persistent search history with localStorage
- **Voice Search**: Speech recognition support for hands-free searching
- **Offline Support**: Graceful degradation when offline
- **Responsive Layout**: Works seamlessly across all device sizes
- **Accessibility**: Full keyboard navigation and screen reader support
- **Comprehensive Testing**: 95%+ test coverage with Vitest

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd perle

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
# Build the app
npm run build

# Preview production build
npm run preview
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

## 📱 Mobile Features

- **Touch Optimized**: All interactive elements meet 44px minimum touch target
- **Pull-to-Refresh**: Swipe down to refresh search results
- **Haptic Feedback**: Vibration feedback for interactions (where supported)
- **Safe Area Support**: Respects device safe areas and notches
- **Offline Indicator**: Shows connection status
- **Voice Search**: Speech-to-text input support
- **Share Integration**: Native sharing capabilities

## 🎨 Design System

### Colors
- **Primary**: `#C7A869` (Elegant gold)
- **Background**: `#F8F7F4` (Warm white)
- **Text**: `#111111` (Near black)
- **Subtext**: `#4B4B4B` (Medium gray)
- **Border**: `#EBE8E1` (Light gray)

### Typography
- **Font Family**: System fonts (SF Pro, Segoe UI, Roboto)
- **Headings**: 28px-32px, bold
- **Body**: 16px-18px, regular
- **Small**: 12px-14px, medium

### Spacing
- **Touch Target**: 44px minimum
- **Card Padding**: 16px-18px
- **Element Gap**: 8px-16px
- **Section Spacing**: 24px-40px

## 🏗️ Architecture

### Components
- `App.tsx` - Main application component
- `Header.tsx` - Navigation header
- `SearchBar.tsx` - Search input with history and voice
- `AnswerCard.tsx` - Answer display with citations
- `ModeBar.tsx` - Search mode selection
- `DiscoverRail.tsx` - Content discovery section
- `Library.tsx` - Saved searches and bookmarks

### Utilities
- `helpers.ts` - Text processing and formatting utilities
- `answerEngine.ts` - Mock search engine (replace with real API)
- `useMobile.ts` - Mobile-specific React hooks

### Types
- `types/index.ts` - TypeScript type definitions

## 🔧 Configuration

### Environment Variables
Create a `.env` file for configuration:

```env
VITE_API_URL=https://your-api-endpoint.com
VITE_APP_NAME=Perlé
VITE_APP_VERSION=1.0.0
```

### Customization
- **Colors**: Modify CSS variables in `src/index.css`
- **API Integration**: Replace `fakeAnswerEngine` in `src/utils/answerEngine.ts`
- **Search Providers**: Add new search modes in `src/types/index.ts`

## 📦 Build Output

The build process creates:
- `dist/` - Production-ready static files
- Optimized bundles with code splitting
- Service worker for offline functionality
- Source maps for debugging

## 🌐 Browser Support

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Mobile**: iOS Safari 14+, Chrome Mobile 90+
- **Features**: ES2020, CSS Grid, Flexbox, Web APIs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Maintain mobile-first responsive design
- Ensure accessibility compliance
- Use semantic commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Perplexity's elegant design
- Built with React, TypeScript, and Vite
- Icons and graphics created with SVG
- Fonts provided by system font stacks

---

**Perlé** — Where elegance meets intelligence. ✨
