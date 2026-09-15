/**
 * Imports the ML model's labeled training dataset (the same
 * internship_data.csv used by internship_performance_prediction/) into the
 * `TrainingRecord` collection, so the admin dashboard's
 * GET /api/performance/training-evaluation endpoint has something to score.
 *
 * Usage:
 *   node scripts/importTrainingData.js --input /path/to/internship_data.csv
 *
 * Expected CSV header (exact, case-sensitive):
 *   GPA,Course_Scores,Aptitude_Score,Attendance,Supervisor_Evaluation,
 *   Report_Quality,Activity_Log_Frequency,Completion_Time,Feedback_Rating,
 *   Performance,Intern_ID,Performance_Score
 *
 * (Performance_Score is optional; everything else is required.)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const TrainingRecord = require('../src/models/TrainingRecord');

const REQUIRED_COLUMNS = [
  'GPA', 'Course_Scores', 'Aptitude_Score', 'Attendance', 'Supervisor_Evaluation',
  'Report_Quality', 'Activity_Log_Frequency', 'Completion_Time', 'Feedback_Rating',
  'Performance', 'Intern_ID',
];

/** Minimal CSV parser — fine for this dataset (no quoted/escaped commas). */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());

  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new Error(`CSV is missing required column(s): ${missing.join(', ')}`);
  }

  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((col, i) => { row[col] = cells[i]; });
    return row;
  });
}

async function main() {
  const inputArgIdx = process.argv.indexOf('--input');
  const inputPath = inputArgIdx !== -1 ? process.argv[inputArgIdx + 1] : null;

  if (!inputPath) {
    console.error('Usage: node scripts/importTrainingData.js --input /path/to/internship_data.csv');
    process.exit(1);
  }

  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(resolvedPath, 'utf8'));
  console.log(`Parsed ${rows.length} rows from ${resolvedPath}`);

  await connectDB();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const internId = row.Intern_ID;
    const performance = row.Performance;

    if (!internId || !performance) {
      skipped += 1;
      continue;
    }

    const doc = {
      internId,
      performance,
      performanceScore: row.Performance_Score !== undefined && row.Performance_Score !== ''
        ? Number(row.Performance_Score)
        : null,
      features: {
        GPA: Number(row.GPA),
        Course_Scores: Number(row.Course_Scores),
        Aptitude_Score: Number(row.Aptitude_Score),
        Attendance: Number(row.Attendance),
        Supervisor_Evaluation: Number(row.Supervisor_Evaluation),
        Report_Quality: Number(row.Report_Quality),
        Activity_Log_Frequency: Number(row.Activity_Log_Frequency),
        Completion_Time: Number(row.Completion_Time),
        Feedback_Rating: Number(row.Feedback_Rating),
      },
    };

    const result = await TrainingRecord.findOneAndUpdate(
      { internId },
      doc,
      { upsert: true, new: true, runValidators: true, rawResult: true }
    );

    if (result.lastErrorObject?.updatedExisting) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}, Skipped (bad rows): ${skipped}`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
