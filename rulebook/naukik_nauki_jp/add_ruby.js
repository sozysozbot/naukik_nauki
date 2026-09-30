const fs = require('fs');
const filePath = 'c:/Users/yasus/Documents/latacet_vivliostyle/jamata/jamata_takan/rule.md';
const text = fs.readFileSync(filePath, 'utf-8');

const regex = /(\{[^|}]+\|[^}]+\})|([\u4E00-\u9FFF\u3005])/g;

const newText = text.replace(regex, (match, p1, p2) => {
    if (p1) return p1;
    if (p2) return '{' + p2 + '|○○}';
    return match;
});

fs.writeFileSync(filePath, newText, 'utf-8');
console.log('done');
