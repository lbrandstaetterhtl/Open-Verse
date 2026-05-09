const fs = require('fs');
const path = require('path');

const localesDirs = ['de', 'en', 'es', 'fr', 'it', 'zh'];
localesDirs.forEach(lang => {
  const file = `client/public/locales/${lang}/common.json`;
  if (fs.existsSync(file)) {
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.back) data.back = 'Zurück';
    if (!data.backToFeed) data.backToFeed = 'Zurück zum Feed';
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } else {
    fs.writeFileSync(file, JSON.stringify({ back: 'Zurück', backToFeed: 'Zurück zum Feed' }, null, 2));
  }
});
console.log('done');
