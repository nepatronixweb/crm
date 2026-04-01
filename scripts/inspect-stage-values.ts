import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import Student from '../models/Student';
import AppSettings from '../models/AppSettings';

async function inspectStageValues() {
  try {
    // Connect to MongoDB
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI as string);
      console.log('✓ Connected to MongoDB\n');
    }

    // Step 1: Get the mapping from AppSettings
    console.log('='.repeat(80));
    console.log('STEP 1: Get stageToPipelineMapping from AppSettings');
    console.log('='.repeat(80));
    
    const appSettings = await AppSettings.findOne().lean();
    const mapping = appSettings?.stageToPipelineMapping || {};
    
    console.log('\nMapping keys defined in AppSettings:');
    const mappingKeys = Object.keys(mapping).sort();
    console.log(`Total mapping entries: ${mappingKeys.length}\n`);
    
    mappingKeys.forEach(key => {
      console.log(`  "${key}" → "${mapping[key]}"`);
    });

    // Step 2: Get all unique stage values from Students collection
    console.log('\n\n' + '='.repeat(80));
    console.log('STEP 2: Get all unique stage values from Student collection');
    console.log('='.repeat(80));
    
    const uniqueStages = await Student.aggregate([
      {
        $unwind: '$admissionDetails'
      },
      {
        $group: {
          _id: '$admissionDetails.stage',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).exec();

    console.log(`\nFound ${uniqueStages.length} unique stage values in database:\n`);
    
    uniqueStages.forEach((item: any) => {
      const inMapping = mappingKeys.includes(item._id) ? '✓' : '✗';
      console.log(`  ${inMapping} "${item._id}" (count: ${item.count})`);
    });

    // Step 3: Find sample records for "Offer Applied" or related
    console.log('\n\n' + '='.repeat(80));
    console.log('STEP 3: Sample records with stage values');
    console.log('='.repeat(80));

    const samples = await Student.find({})
      .select('name admissionDetails.stage admissionDetails.pipeline admissionDetails.statusDate')
      .limit(10)
      .lean()
      .exec();

    console.log(`\nShowing ${samples.length} sample records:\n`);

    samples.forEach((student: any, index: number) => {
      console.log(`Record ${index + 1}: ${student.name || 'N/A'}`);
      if (student.admissionDetails && Array.isArray(student.admissionDetails)) {
        student.admissionDetails.forEach((entry: any, entryIndex: number) => {
          console.log(`  Entry ${entryIndex + 1}:`);
          console.log(`    stage: "${entry.stage}"`);
          console.log(`    pipeline: "${entry.pipeline}"`);
          console.log(`    statusDate: ${entry.statusDate}`);
          console.log(`    In mapping: ${mappingKeys.includes(entry.stage) ? 'YES' : 'NO'}`);
        });
      }
      console.log('');
    });

    // Step 4: Check for mismatches
    console.log('\n\n' + '='.repeat(80));
    console.log('STEP 4: Mismatch Analysis');
    console.log('='.repeat(80));

    const stageValuesInDB = new Set(uniqueStages.map((item: any) => item._id));
    
    console.log('\nStages in database but NOT in mapping:');
    const unmappedStages = Array.from(stageValuesInDB).filter(
      stage => !mappingKeys.includes(stage)
    ).sort();
    
    if (unmappedStages.length === 0) {
      console.log('  ✓ None - all database stages are mapped!');
    } else {
      unmappedStages.forEach(stage => {
        const count = uniqueStages.find((item: any) => item._id === stage)?.count || 0;
        console.log(`  ✗ "${stage}" (appears in ${count} records)`);
      });
    }

    console.log('\nMapping keys defined but NOT in database:');
    const unmappedKeys = mappingKeys.filter(key => !stageValuesInDB.has(key)).sort();
    
    if (unmappedKeys.length === 0) {
      console.log('  ✓ None - all mappings are used!');
    } else {
      unmappedKeys.forEach(key => {
        console.log(`  ℹ "${key}" (maps to "${mapping[key]}")`);
      });
    }

    // Step 5: Look specifically for "Offer Applied"
    console.log('\n\n' + '='.repeat(80));
    console.log('STEP 5: Search for "Offer Applied" records');
    console.log('='.repeat(80));

    const offerAppliedRecords = await Student.find({
      'admissionDetails.stage': { $regex: '.*[Oo]ffer.*[Aa]pplied.*' }
    })
    .select('name admissionDetails.stage admissionDetails.pipeline')
    .limit(5)
    .lean()
    .exec();

    console.log(`\nFound ${offerAppliedRecords.length} records matching "Offer Applied" pattern:\n`);
    
    if (offerAppliedRecords.length === 0) {
      console.log('  No records found with "offer applied" pattern');
    } else {
      offerAppliedRecords.forEach((student: any) => {
        console.log(`${student.name}:`);
        student.admissionDetails?.forEach((entry: any) => {
          if (entry.stage && entry.stage.toLowerCase().includes('offer')) {
            console.log(`  stage: "${entry.stage}" → pipeline: "${entry.pipeline}"`);
          }
        });
      });
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

inspectStageValues();
