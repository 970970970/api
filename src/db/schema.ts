import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

export const mods = sqliteTable('mods', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: integer('status').default(1).notNull(),
}, (table) => {
  return {
    codeIdx: uniqueIndex('mod_code_idx').on(table.code),
  }
});

export const article_mods = sqliteTable('article_mods', {
  article_id: integer('article_id').notNull(),
  mod_id: integer('mod_id').notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.article_id, table.mod_id] }),
    modIdx: index('article_mods_mod_idx').on(table.mod_id),
    articleIdx: index('article_mods_article_idx').on(table.article_id),
  }
});

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
}, (table) => {
  return {
    listIdx: index("list_idx").on(table.language, table.rank, table.published_at),
    originIdx: index("origin_idx").on(table.origin_id),
  }
});

export const admin_users = sqliteTable('admin_users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  two_factor_secret: text('two_factor_secret'),
  two_factor_enabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
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