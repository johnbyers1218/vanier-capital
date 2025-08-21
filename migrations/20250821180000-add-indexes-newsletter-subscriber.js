// Example migration: ensure compound / helpful indexes for NewsletterSubscriber
// Naming convention: YYYYMMDDHHMMSS-description.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import model definitions so indexes exist in mongoose.models
import '../models/NewsletterSubscriber.js';

export async function up(db, client) {
  // Using native driver via db (NOT mongoose) for idempotent index creation
  const collection = db.collection('newslettersubscribers');
  // Build indexes (if they already exist, this is a no-op because of same spec)
  await collection.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  await collection.createIndex({ status: 1 }, { name: 'status_idx' });
  // Example of a derived field addition (if we wanted to add something):
  // await collection.updateMany({ companyName: { $exists: false } }, { $set: { companyName: null } });
}

export async function down(db, client) {
  const collection = db.collection('newslettersubscribers');
  try { await collection.dropIndex('email_unique'); } catch {}
  try { await collection.dropIndex('status_idx'); } catch {}
}
