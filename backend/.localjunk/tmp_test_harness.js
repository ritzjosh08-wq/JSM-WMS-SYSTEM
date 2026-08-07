const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const filePath = '/sessions/lucid-sharp-archimedes/mnt/uploads/Warehouse Stock 01-06-2026.xlsx';
const fileBase64 = fs.readFileSync(filePath).toString('base64');
const fileName = 'Warehouse Stock 01-06-2026.xlsx';

const workerPath = path.join(__dirname, 'tmp_test_worker.js');
const t0 = Date.now();
const worker = new Worker(workerPath, {
  workerData: { fileBase64, fileName },
  resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 },
});
worker.on('message', (msg) => {
  console.log('Worker responded in', Date.now()-t0, 'ms');
  console.log('success:', msg.success);
  if (msg.success) {
    console.log('sheetName:', msg.sheetName);
    console.log('headers:', JSON.stringify(msg.headers));
    console.log('row count:', msg.rows.length);
    console.log('totalRowsInSheet:', msg.totalRowsInSheet, 'blankRowsSkipped:', msg.blankRowsSkipped);
    console.log('sample row 0:', JSON.stringify(msg.rows[0]));
    console.log('sample row 1:', JSON.stringify(msg.rows[1]));
  } else {
    console.log('error:', msg.error);
  }
});
worker.on('error', (e) => { console.log('WORKER ERROR:', e); });
worker.on('exit', (code) => { console.log('worker exited', code); process.exit(0); });
