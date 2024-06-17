import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const articles = sqliteTable('articles', {
  id: integer('id').primaryKey(),
  origin_id: integer('origin_id'),
  title: text('title', { length: 256 }).notNull(),
  content: text('content').notNull(),
  summary: text('summary', { length: 1024 }).notNull(),
  image: text('image'),
  rank: integer('rank').default(1).notNull(),
  published_at: integer('published_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  language: text('language').notNull(),
  category: text('category').notNull(),
}, (table) => {
  return {
    listIdx: index("list_idx").on(table.category, table.language, table.rank),
    originIdx: index("origin_idx").on(table.origin_id),
  }
});

export const admin_users = sqliteTable('admin_users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  two_factor_secret: text('two_factor_secret'),
  status: integer('status').default(1).notNull(),
}, (table) => {
  return {
    emailIdx: uniqueIndex("username_idx").on(table.email),
  }
})

export const languages = sqliteTable('languages', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  flag: text('flag').notNull(),
  status: integer('status').default(1).notNull(),
})

export const media_files = sqliteTable('media_files', {
  id: integer('id').primaryKey(),
  type_id: integer('type_id').notNull(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  content_type: text('content_type').notNull(),
  size: integer('size'),
  description: text('description'),
  upload_time: integer('upload_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
  return {
    typeIdIdx: index('type_id_idx').on(table.type_id),
    nameIdx: index('name_idx').on(table.name),
    uploadTimeIdx: index('upload_time_idx').on(table.upload_time),
  }
});