import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const initDbConnect = (db: D1Database) => drizzle(db, { schema });