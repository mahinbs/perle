# SyntraIQ Backend

Express + TypeScript backend with Supabase integration for the SyntraIQ application.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Supabase account and project

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Supabase:**
   - Create a project at [supabase.com](https://supabase.com)
   - Get your `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Settings → API
   - Run the SQL schema from `database/schema.sql` in Supabase SQL Editor

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your Supabase credentials:
   ```env
   PORT=3333
   CORS_ORIGIN=http://localhost:3000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   # Optional: enable real AI answers
   OPENAI_API_KEY=your-openai-key-here
   ```

4. **Run the server:**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3333`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - Login user
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/verify` - Verify token

### Search
- `POST /api/search` - Perform search
- `GET /api/suggestions?q=...` - Get search suggestions
- `GET /api/related?q=...` - Get related queries
- `GET /api/search/history` - Get user search history
- `DELETE /api/search/history` - Delete search history

### Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `DELETE /api/profile` - Delete user account

### Library
- `GET /api/library` - Get user library items
- `GET /api/library/:id` - Get single library item
- `POST /api/library` - Create library item
- `PATCH /api/library/:id` - Update library item
- `DELETE /api/library/:id` - Delete library item

### Discover
- `GET /api/discover` - Get all discover items
- `GET /api/discover/:id` - Get single discover item

## 🔒 Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

Tokens are obtained from `/api/auth/login` or `/api/auth/signup`.

## 🗄️ Database Schema

See `database/schema.sql` for the complete database schema. The schema includes:

- **users** - User accounts
- **sessions** - Authentication sessions
- **user_profiles** - User settings and preferences
- **search_history** - User search queries
- **library_items** - Saved library items

## 🛠️ Development

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3333` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |
| `SUPABASE_URL` | Supabase project URL | Required |
| `SUPABASE_ANON_KEY` | Supabase anon key | Required |

## 🔐 Security Features

- Password hashing with bcrypt
- Session-based authentication
- Token expiration (7 days)
- Automatic session cleanup
- Input validation with Zod
- SQL injection protection via Supabase
- Row Level Security (RLS) policies

## 📦 Dependencies

- **express** - Web framework
- **@supabase/supabase-js** - Supabase client
- **bcryptjs** - Password hashing
- **zod** - Schema validation
- **cors** - CORS middleware

## 🐛 Error Handling

All errors are handled consistently:
- Validation errors: 400 Bad Request
- Authentication errors: 401 Unauthorized
- Not found errors: 404 Not Found
- Server errors: 500 Internal Server Error

Error responses follow this format:
```json
{
  "error": "Error message",
  "details": {} // Optional validation details
}
```

