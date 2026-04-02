const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function seedMapping() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/etg-crm');
    
    const db = mongoose.connection.db;
    
    // The mapping that should be in the database
    const mapping = {
      "document_pending": "Application",
      "document_submitted": "Application",
      "offer_applied": "Offer",
      "acknowledge": "Offer",
      "document_requested": "Offer",
      "document_sent": "Offer",
      "conditional_offer_received": "Offer",
      "unconditional_offer_received": "Offer",
      "offer_rejected": "Offer",
      "gs_applied": "GS",
      "gs_additional_doc_requested": "GS",
      "gs_additional_doc_sent": "GS",
      "gs_approved": "GS",
      "gs_rejected": "GS",
      "coe_applied": "COE",
      "coe_additional_doc_requested": "COE",
      "coe_additional_doc_sent": "COE",
      "coe_received": "COE",
      "coe_rejected": "COE",
      "coe_withdrawn": "COE",
      "visa_applied": "Visa",
      "visa_grant": "Visa",
      "visa_reject": "Visa",
      "visa_invalid": "Visa",
      "visa_withdrawn": "Visa"
    };
    
    console.log('Updating AppSettings with stageToPipelineMapping...');
    
    const result = await db.collection('appsettings').updateOne(
      {},
      { $set: { stageToPipelineMapping: mapping } },
      { upsert: true }
    );
    
    console.log('✅ Updated:', result.modifiedCount, 'documents');
    console.log('✅ stageToPipelineMapping seeded with', Object.keys(mapping).length, 'mappings');
    
    await mongoose.connection.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedMapping();
