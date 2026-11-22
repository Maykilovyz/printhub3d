// Roda ANTES de gerar o APK: dá a ele um número de versão novo.
// Por que: o plugin de atualização pelo ar só percebe que um APK novo foi
// instalado quando a versão muda. Aí ele descarta as telas baixadas antes
// e usa as telas que vieram dentro do APK novo.
// O número é o mesmo do nome do arquivo (PrintHub3D-v6-... -> versão 6 / "1.6").
const fs = require("fs");
const path = require("path");

const GRADLE = path.join(__dirname, "android/app/build.gradle");
const PASTA = path.join(__dirname, "apks");

// Próximo número = maior número já usado nos APKs da pasta + 1
const usados = fs.existsSync(PASTA)
  ? fs.readdirSync(PASTA).map((n) => Number((n.match(/^PrintHub3D-v(\d+)-/) || [])[1])).filter(Boolean)
  : [];
const numero = Math.max(0, ...usados) + 1;

const gradle = fs.readFileSync(GRADLE, "utf8")
  .replace(/versionCode \d+/, `versionCode ${numero}`)
  .replace(/versionName "[^"]*"/, `versionName "1.${numero}"`);
fs.writeFileSync(GRADLE, gradle);
console.log(`Versão do APK: ${numero} (1.${numero})`);
