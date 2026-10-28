// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const catalogProducts = sqliteTable('catalog_products', {
  userId: text('user_id').notNull(),
  code: text('code').notNull(),
  category: text('category').notNull(),
  dish: text('dish').notNull(),
  fr: text('fr').notNull(),
  cents: integer('cents').notNull(),
  active: integer('active').notNull(),
  imageId: text('image_id'),
  createdAt: text('created_at').notNull(),
}, table => [primaryKey({columns:[table.userId,table.code]})]);
export const prices = sqliteTable('product_prices', {
  userId: text('user_id').notNull(),
  code: text('code').notNull(),
  cents: integer('cents').notNull(),
  active: integer('active').notNull(),
  revision: integer('revision').notNull(),
  deleted: integer('deleted').notNull().default(0),
  imageId: text('image_id'),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({columns:[table.userId,table.code]})]);

export const sales = sqliteTable('sales', {
  sequence: integer('sequence').primaryKey({autoIncrement:true}),
  userId: text('user_id').notNull(),
  orderId: text('order_id').notNull(),
  month: text('month').notNull(),
  body: text('body').notNull(),
  revision: integer('revision').notNull().default(1),
}, table=>[uniqueIndex('sales_user_order').on(table.userId,table.orderId)]);
export const closures = sqliteTable('sales_closures', {
  userId: text('user_id').notNull(),
  month: text('month').notNull(),
  closedAt: text('closed_at').notNull(),
}, table=>[primaryKey({columns:[table.userId,table.month]})]);

export const catalogImages = sqliteTable('catalog_images', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('catalog_images_object_key').on(table.objectKey)]);

