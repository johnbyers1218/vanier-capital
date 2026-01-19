// migrate-mongo configuration
// Adjust to use the same MONGODB_URI env var your app uses.
import dotenv from 'dotenv';
dotenv.config();

// If you want a separate migrations database / collection, customize here.
export default {
  mongodb: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/vaniercapital_dev',
    databaseName: undefined, // use database embedded in URI
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'migrations_changelog',
  migrationFileExtension: '.js',
  useFileHash: true,
};
