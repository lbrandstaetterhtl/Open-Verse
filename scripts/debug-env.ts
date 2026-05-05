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
    console.log('.env first 20 chars:', content.substring(0, 20).replace(/\n/g, '\\n'));
    console.log('.env total length:', content.length);
  } catch (err) {
    console.log('❌ Error reading .env:', (err as any).message);
  }
} else {
  console.log('❌ .env file NOT FOUND');
}

console.log('--- Variables ---');
console.log('USE_SQLITE:', process.env.USE_SQLITE);
console.log('DATABASE_URL defined:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL preview:', process.env.DATABASE_URL.substring(0, 10) + '...');
}
