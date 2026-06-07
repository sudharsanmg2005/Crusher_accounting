/**
 * Copy local MongoDB data to MongoDB Atlas.
 * Requires mongodump and mongorestore installed (MongoDB Database Tools).
 *
 * Usage:
 *   set ATLAS_URI=mongodb+srv://user:pass@cluster.mongodb.net/crusher_accounting
 *   npm run migrate:atlas
 */
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';

dotenv.config();

const localUri = (process.env.LOCAL_MONGO_URI || 'mongodb://127.0.0.1:27017/crusher_accounting').trim();
const atlasUri = (process.env.ATLAS_URI || process.env.MONGO_URI || '').trim();
const backupDir = 'atlas-migration-backup';

if (!atlasUri.startsWith('mongodb+srv://') && !process.env.FORCE_MIGRATE) {
  console.error('Set ATLAS_URI to your MongoDB Atlas connection string before running migrate:atlas');
  process.exit(1);
}

console.log('Exporting local database...');
const dump = spawnSync('mongodump', [`--uri=${localUri}`, `--out=${backupDir}`], { stdio: 'inherit', shell: true });
if (dump.status !== 0) {
  console.error('mongodump failed. Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools');
  process.exit(1);
}

console.log('\nImporting into MongoDB Atlas...');
const restore = spawnSync(
  'mongorestore',
  [`--uri=${atlasUri}`, '--drop', `${backupDir}/crusher_accounting`],
  { stdio: 'inherit', shell: true }
);

if (restore.status !== 0) {
  console.error('mongorestore failed. Check ATLAS_URI, Atlas IP access, and database user permissions.');
  process.exit(1);
}

console.log('\nMigration complete.');
console.log('Next steps:');
console.log('  1. Set MONGO_URI in backend/.env to your Atlas URI');
console.log('  2. Run npm run verify:atlas');
console.log('  3. Run npm run prepare:production');
