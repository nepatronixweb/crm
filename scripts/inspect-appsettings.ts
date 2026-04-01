import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import AppSettings from '../models/AppSettings';
import Student from '../models/Student';

async function inspectAppSettings() {
  try {
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI as string);
    }

    console.log('='.repeat(80));
    console.log('AppSettings Collection Content');
    console.log('='.repeat(80));
    
    const allSettings = await AppSettings.find({}).lean();
    
    console.log(`\nTotal AppSettings documents: ${allSettings.length}\n`);
    
    allSettings.forEach((doc: any, index: number) => {
      console.log(`Document ${index + 1}:`);
      console.log(JSON.stringify(doc, null, 2));
      console.log('');
    });

    // Also check the Student model to see the schema
    console.log('='.repeat(80));
    console.log('Student Collection - Detailed Stage Analysis');
    console.log('='.repeat(80));

    const allStudents = await Student.find({})
      .select('name admissionDetails')
      .lean()
      .limit(20)
      .exec();

    console.log(`\nTotal Students (showing first 20):\n`);
    
    allStudents.forEach((student: any) => {
      if (student.admissionDetails && student.admissionDetails.length > 0) {
        console.log(`\n${student.name || 'N/A'}:`);
        student.admissionDetails.forEach((entry: any, idx: number) => {
          console.log(`  Entry ${idx}:`, JSON.stringify(entry, null, 4));
        });
      }
    });

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

inspectAppSettings();
