// Проверка пакета ходов: node tools/validate-pack.cjs [путь]
const fs = require('fs'); const path = require('path');
const TV = require('../app/src/main/assets/engine.js');
const file = process.argv[2] || path.join(__dirname, '../app/src/main/assets/content/core-ru.json');
const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
const errs = TV.validatePack(pack).concat(TV.coverage(TV.indexPack(pack), TV.migrate({}), 4));
if (errs.length) { console.error('PACK INVALID\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`PACK OK ${pack.pack_id}@${pack.version}: ${pack.scenarios.length} ходов`);
