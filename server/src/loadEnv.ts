import dotenv from 'dotenv';

// Must load before any other module reads process.env.
// PM2 can keep stale keys in process.env; .env wins after rotation.
dotenv.config({ override: true });
