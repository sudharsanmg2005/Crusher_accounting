import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Buyer from '../models/Buyer.js';
import Customer from '../models/Customer.js';

dotenv.config({ path: 'backend/.env' });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI not defined in environment variables');
  process.exit(1);
}

async function migrate() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // Fetch all buyers
    const buyers = await Buyer.find({});
    console.log(`Found ${buyers.length} buyers in the database.`);

    let migratedCount = 0;
    let existingCount = 0;

    for (const buyer of buyers) {
      // Check if customer already exists with same name or phone
      const existingCustomer = await Customer.findOne({
        $or: [
          { phone: buyer.phone },
          { name: buyer.name }
        ]
      });

      if (existingCustomer) {
        console.log(`Customer already exists for buyer: "${buyer.name}" (Phone: ${buyer.phone}). Skipping creation.`);
        existingCount++;
      } else {
        // Create new Customer
        const newCustomer = new Customer({
          name: buyer.name,
          phone: buyer.phone,
          address: buyer.address || '',
          vehicles: [],
          isDeleted: buyer.isDeleted || false
        });

        await newCustomer.save();
        console.log(`Successfully migrated buyer "${buyer.name}" (Phone: ${buyer.phone}) to Customer.`);
        migratedCount++;
      }
    }

    console.log('\nMigration Summary:');
    console.log(`Total buyers processed: ${buyers.length}`);
    console.log(`New customers created: ${migratedCount}`);
    console.log(`Existing customers (skipped): ${existingCount}`);

  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

migrate();
