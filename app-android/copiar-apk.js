// Depois que o Gradle gera o APK, copia ele para a pasta "apks" com um nome
// que diz qual é o mais novo: número da versão + dia e hora.
// Exemplo: apks/PrintHub3D-v3-22-11-14h05.apk
const fs = require("fs");
const path = require("path");

const ORIGEM = path.join(__dirname, "android/app/build/outputs/apk/debug/app-debug.apk");
const PASTA = path.join(__dirname, "apks");
fs.mkdirSync(PASTA, { recursive: true });

// O número é a versão que o versao-apk.js gravou no build.gradle antes do build
const gradle = fs.readFileSync(path.join(__dirname, "android/app/build.gradle"), "utf8");
const numero = Number(gradle.match(/versionCode (\d+)/)[1]);

const agora = new Date();
const dois = (n) => String(n).padStart(2, "0");
const data = `${dois(agora.getDate())}-${dois(agora.getMonth() + 1)}-${dois(agora.getHours())}h${dois(agora.getMinutes())}`;

const destino = path.join(PASTA, `PrintHub3D-v${numero}-${data}.apk`);
fs.copyFileSync(ORIGEM, destino);
console.log("APK pronto: " + destino);
