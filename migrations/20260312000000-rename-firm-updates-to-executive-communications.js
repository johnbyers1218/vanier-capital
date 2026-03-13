// Migration: Rename publicationType 'Firm Updates' → 'Executive Communications'
// Run with: npm run migrate:up

export const up = async (db) => {
  const result = await db.collection('blogposts').updateMany(
    { publicationType: 'Firm Updates' },
    { $set: { publicationType: 'Executive Communications' } }
  );
  console.log(`[Migration] Renamed ${result.modifiedCount} BlogPost(s) from 'Firm Updates' → 'Executive Communications'`);
};

export const down = async (db) => {
  const result = await db.collection('blogposts').updateMany(
    { publicationType: 'Executive Communications' },
    { $set: { publicationType: 'Firm Updates' } }
  );
  console.log(`[Migration] Reverted ${result.modifiedCount} BlogPost(s) from 'Executive Communications' → 'Firm Updates'`);
};
