import mongoose from 'mongoose';

const isAtlasUri = (uri = '') => uri.startsWith('mongodb+srv://');

const maskUri = (uri = '') => uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');

export const getMongoOptions = () => {
  const uri = process.env.MONGO_URI || '';
  const options = {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 15000,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10
  };

  if (isAtlasUri(uri)) {
    options.retryWrites = true;
    options.w = 'majority';
  }

  return options;
};

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri?.trim()) {
    console.error('MongoDB connection error: MONGO_URI is not set in backend/.env');
    process.exit(1);
  }

  const trimmedUri = uri.trim();

  try {
    const conn = await mongoose.connect(trimmedUri, getMongoOptions());
    const provider = isAtlasUri(trimmedUri) ? 'MongoDB Atlas' : 'MongoDB';
    console.log(`${provider} connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    if (isAtlasUri(trimmedUri)) {
      console.error('Atlas checklist:');
      console.error('  1. Cluster is running and MONGO_URI uses mongodb+srv://');
      console.error('  2. Database username/password are correct (URL-encode special characters)');
      console.error('  3. Your IP address is allowed in Atlas Network Access');
      console.error('  4. Connection string includes the database name, e.g. /crusher_accounting');
    } else {
      console.error(`Attempted URI: ${maskUri(trimmedUri)}`);
    }
    process.exit(1);
  }
};

export const getDatabaseStatus = () => {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    status: states[state] || 'unknown',
    provider: isAtlasUri(process.env.MONGO_URI || '') ? 'atlas' : 'local',
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};
