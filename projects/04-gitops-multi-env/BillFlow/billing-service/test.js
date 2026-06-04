const assert = require('assert');
console.log('Running BillFlow tests...');
assert.strictEqual(typeof require('./server'), 'object', 'server exports an object');
console.log('All tests passed');
process.exit(0);
