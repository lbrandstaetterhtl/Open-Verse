import fs from 'fs';
import path from 'path';
import 'dotenv/config';

console.log('--- Environment Debug ---');
console.log('CWD:', process.cwd());
console.log('__filename:', import.meta.url);

const envPath = path.join(process.cwd(), '.env');
console.log('Checking .env at:', envPath);

if (fs.existsSync(envPath)) {
  console.log('✅ .env file EXISTS');
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    console.log('.env Content Preview (first 500 chars):');
    console.log('----------------------------------------');
    // Mask sensitive looking values just in case
    const safeContent = content.substring(0, 500).replace(/=[^ \n]{4,}/g, '=********');
    console.log(safeContent);
    console.log('----------------------------------------');
    console.log('.env total length:', content.length);
  } catch (err) {
    console.log('❌ Error reading .env:', (err as any).message);
  }
} else {
  console.log('❌ .env file NOT FOUND');
}

console.log('--- Process Environment Keys ---');
const keys = Object.keys(process.env).filter(k => k.startsWith('USE_') || k.startsWith('DATABASE_') || k.includes('SECRET'));
keys.forEach(k => {
  const val = process.env[k];
  console.log(`${k}: ${val ? (val.length > 5 ? val.substring(0, 5) + '...' : val) : 'undefined'}`);
});

