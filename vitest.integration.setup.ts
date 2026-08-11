import { config } from 'dotenv'

// Integration tests need the project credentials that live in .env.local.
config({ path: '.env.local' })
