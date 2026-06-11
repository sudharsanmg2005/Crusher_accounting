import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { MongoClient } = mongoose.mongo;

const localUri = (process.env.LOCAL_MONGO_URI || 'mongodb://127.0.0.1:27017/crusher_accounting').trim();
const atlasUri = (process.env.ATLAS_URI || process.env.MONGO_URI || '').trim();

if (!atlasUri.startsWith('mongodb+srv://') && !process.env.FORCE_MIGRATE) {
  console.error('Set ATLAS_URI to your MongoDB Atlas connection string before running migration');
  process.exit(1);
}

const run = async () => {
  console.log('Connecting to local database...');
  const clientLocal = new MongoClient(localUri);
  await clientLocal.connect();
  console.log('Connected to local database.');

  console.log('Connecting to MongoDB Atlas...');
  const clientAtlas = new MongoClient(atlasUri);
  await clientAtlas.connect();
  console.log('Connected to MongoDB Atlas.');

  const dbLocal = clientLocal.db();
  const dbAtlas = clientAtlas.db();

  console.log('Fetching collections...');
  const collections = await dbLocal.listCollections().toArray();
  console.log(`Found ${collections.length} collections locally.`);

  for (const col of collections) {
    const name = col.name;
    if (name.startsWith('system.')) continue;

    console.log(`Migrating collection: ${name}`);
    const docs = await dbLocal.collection(name).find({}).toArray();

    if (docs.length > 0) {
      // Drop Atlas collection if it exists to perform a clean sync
      try {
        await dbAtlas.collection(name).drop();
        console.log(`  Dropped existing collection ${name} in Atlas`);
      } catch (err) {
        // Collection might not exist in Atlas, ignore error
      }

      await dbAtlas.collection(name).insertMany(docs);
      console.log(`  Successfully copied ${docs.length} documents for ${name}`);
    } else {
      console.log(`  Collection ${name} is empty, skipping data copy`);
    }
  }

  console.log('\nMigration completed successfully!');
  await clientLocal.close();
  await clientAtlas.close();
};

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
