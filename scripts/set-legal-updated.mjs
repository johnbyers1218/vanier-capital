import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Settings from '../models/Settings.js';

dotenv.config();

async function run() {
  const mongo = process.env.MONGODB_URI;
  if (!mongo) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const privacy = process.env.PRIVACY_UPDATED || new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const terms = process.env.TERMS_UPDATED || privacy;

  await mongoose.connect(mongo);

  const upserts = [
    { key: 'privacyPolicyLastUpdated', valueString: privacy },
    { key: 'termsOfServiceLastUpdated', valueString: terms },
  ];

  for (const { key, valueString } of upserts) {
    await Settings.updateOne({ key }, { $set: { valueString } }, { upsert: true });
    console.log(`✓ Set ${key} = ${valueString}`);
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Failed to set legal lastUpdated:', err?.message || err);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
