// Rotas do app Android: atualização das telas "pelo ar", sem reinstalar o APK.
// O app guarda as telas (pasta public) dentro do celular. Ao abrir, ele pergunta
// aqui qual é a versão atual; se for diferente da dele, baixa o .zip e troca sozinho.
// Não precisa de login: são os mesmos arquivos que o site já entrega para qualquer um.
const express = require("express");
const AdmZip = require("adm-zip");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const rotas = express.Router();
const PASTA_PUBLIC = path.join(__dirname, "..", "..", "public");

// Lista todos os arquivos da pasta (e subpastas), sempre na mesma ordem
function listarArquivos(pasta, prefixo = "") {
  return fs.readdirSync(pasta, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((item) => {
      const relativo = prefixo + item.name;
      return item.isDirectory()
        ? listarArquivos(path.join(pasta, item.name), relativo + "/")
        : [relativo];
    });
}

// Monta o pacote uma vez só, quando o servidor liga.
// As telas só mudam quando sai um deploy novo, e aí o servidor liga de novo.
const zip = new AdmZip();
const resumo = crypto.createHash("sha256");
for (const arquivo of listarArquivos(PASTA_PUBLIC)) {
  const conteudo = fs.readFileSync(path.join(PASTA_PUBLIC, arquivo));
  zip.addFile(arquivo, conteudo);
  resumo.update(arquivo).update(conteudo);
}
// A versão é um "resumo" (hash) do conteúdo: mudou qualquer tela, muda a versão.
const VERSAO = resumo.digest("hex").slice(0, 12);
const PACOTE = zip.toBuffer();

// GET /api/app/versao -> qual é a versão atual das telas e onde baixar
rotas.get("/versao", (req, res) => {
  res.json({ versao: VERSAO, url: "/api/app/pacote.zip?v=" + VERSAO });
});

// GET /api/app/pacote.zip -> o .zip com todas as telas
rotas.get("/pacote.zip", (req, res) => {
  res.set("Content-Type", "application/zip");
  res.send(PACOTE);
});

module.exports = rotas;
