// Script to generate password hash for ADMIN_PASSWORD_HASH environment variable
const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
    console.error('Usage: node scripts/hash-password.js YOUR_PASSWORD');
    process.exit(1);
}

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('\n=== Password Hash Generated ===');
console.log('\nAdd this to your environment variables:');
console.log(`\nADMIN_PASSWORD_HASH=${hash}`);
console.log('\n===============================\n');
