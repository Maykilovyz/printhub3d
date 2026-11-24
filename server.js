// =============================================================
// PrintHub 3D - Servidor principal
// Este arquivo liga tudo: entrega as páginas (pasta public)
// e responde às chamadas da API (rotas em src/rotas).
// =============================================================
const express = require("express");
const path = require("path");

const rotasUsuarios = require("./src/rotas/usuarios");
const rotasPedidos = require("./src/rotas/pedidos");
const rotasOrcamentos = require("./src/rotas/orcamentos");
const rotasMensagens = require("./src/rotas/mensagens");
const rotasConvites = require("./src/rotas/convites");
const rotasApp = require("./src/rotas/app");

const app = express();

// Permite ler JSON enviado pelo navegador (ex.: dados do login)
app.use(express.json());

// O app Android (Capacitor) abre as páginas a partir de "https://localhost".
// Para o navegador do app poder chamar esta API, liberamos (CORS) só essa origem.
// O site não precisa disso, porque ele e a API estão no mesmo endereço.
const ORIGENS_DO_APP = ["https://localhost", "capacitor://localhost"];
app.use("/api", (req, res, next) => {
  const origem = req.headers.origin;
  if (ORIGENS_DO_APP.includes(origem)) {
    res.set("Access-Control-Allow-Origin", origem);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    // Antes de algumas chamadas o navegador pergunta "posso?" (OPTIONS). Respondemos que sim.
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

// Entrega os arquivos do site (HTML, CSS, JS) que estão em /public
app.use(express.static(path.join(__dirname, "public")));

// Guia de estudo do projeto (fica em docs/, fora de public/, para não entrar no app Android)
app.get("/guia", (req, res) => res.sendFile(path.join(__dirname, "docs", "guia-de-estudo.html")));

// Configuração PÚBLICA que o navegador precisa para o botão do Google.
// (A chave "publishable" é feita para ficar no navegador; a secreta nunca sai daqui.)
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseChavePublica: process.env.SUPABASE_PUBLISHABLE_KEY || null,
    // ID do cliente "Aplicativo da Web" do Google. O app Android usa no login nativo.
    googleClientId: process.env.GOOGLE_WEB_CLIENT_ID || null,
  });
});

// Rotas da API. Tudo que começa com /api é dado, não página.
app.use("/api/usuarios", rotasUsuarios);
app.use("/api/app", rotasApp);      // atualização do app Android pelo ar
app.use("/api/convites", rotasConvites);
app.use("/api/pedidos", rotasPedidos);
app.use("/api", rotasOrcamentos);   // /api/pedidos/:id/orcamentos e /api/orcamentos/:id/aceitar
app.use("/api", rotasMensagens);    // /api/pedidos/:id/mensagens

// Rota simples para checar se o servidor está no ar
app.get("/api/saude", (req, res) => res.json({ ok: true }));

// Qualquer outro endereço de API que não existe: responde em JSON (não em página HTML)
app.use("/api", (req, res) => res.status(404).json({ erro: "Endereço da API não encontrado." }));

// Tratamento de erros: qualquer erro não tratado cai aqui
app.use((erro, req, res, next) => {
  console.error(erro);
  // Erro do multer quando o arquivo é grande demais
  if (erro.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ erro: "Arquivo maior que 20 MB." });
  }
  // Mais arquivos que o permitido (ou campo de arquivo com outro nome)
  if (erro.code === "LIMIT_FILE_COUNT" || erro.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ erro: "Envie no máximo 5 arquivos." });
  }
  // JSON quebrado no corpo da requisição
  if (erro.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "Os dados enviados estão em formato inválido." });
  }
  res.status(500).json({ erro: "Erro interno no servidor. Tente de novo." });
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`PrintHub 3D rodando em http://localhost:${PORTA}`);
});
