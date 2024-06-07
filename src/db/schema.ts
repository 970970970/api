import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const articles = sqliteTable('articles', {
  id: integer('id').primaryKey(),
  title: text('title', { length: 256 }).notNull(),
  content: text('content').notNull(),
  summary: text('summary', { length: 1024 }).notNull(),
  image: text('image'),
  rank: integer('rank').default(1).notNull(),
  published_at: text('published_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  language: text('language').notNull(),
  category: text('category').notNull(),
}, (table) => {
  return {
    listIdx: index("list_idx").on(table.category, table.language, table.rank),
  }
});