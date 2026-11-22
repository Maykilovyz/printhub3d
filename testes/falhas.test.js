// =============================================================
// Testes de FALHAS: o que acontece quando o usuário erra, tenta
// algo que não pode, ou manda dados estranhos.
// Cada teste confere que o servidor responde com o erro certo
// (401, 403, 404, 400...) e uma mensagem clara — nunca "erro interno" (500).
//
// Como rodar (na pasta do projeto):  npm test
// Usa o banco de verdade do .env, mas só cria UM pedido de teste
// (descrição começando com "[TESTE AUTOMÁTICO]") e apaga no final.
// =============================================================
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const jwt = require("jsonwebtoken");

const PORTA = 3988;
const BASE = `http://localhost:${PORTA}/api`;
const MARCA = "[TESTE AUTOMÁTICO]";
let servidor, supabase, inicio;
const tokens = {};   // cliente, outroCliente, fabricante, dono
let pedidoTeste;     // pedido criado só para os testes

// Faz uma chamada à API como um usuário (ou sem login, se quem = null)
async function chamar(metodo, caminho, { quem = null, corpo, cabecalhos = {} } = {}) {
  const h = { ...cabecalhos };
  if (quem) h.Authorization = "Bearer " + tokens[quem];
  let body = corpo;
  if (corpo && !(corpo instanceof FormData) && typeof corpo !== "string") {
    h["Content-Type"] = "application/json";
    body = JSON.stringify(corpo);
  }
  const r = await fetch(BASE + caminho, { method: metodo, headers: h, body });
  const dados = await r.json().catch(() => null);
  return { status: r.status, dados };
}

// Confere status e que veio uma mensagem de erro em JSON
function esperarErro(resposta, status) {
  assert.strictEqual(resposta.status, status, `esperava ${status}, veio ${resposta.status}: ${JSON.stringify(resposta.dados)}`);
  assert.ok(resposta.dados && typeof resposta.dados.erro === "string", "a resposta deve ter { erro: '...' }");
}

// Formulário de novo pedido válido; cada teste estraga um campo
function formulario(mudancas = {}) {
  const f = new FormData();
  const campos = { categoria: "Engenharia", titulo: MARCA + " peça", descricao: MARCA + " criado pelos testes", ...mudancas };
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
  return f;
}

before(async () => {
  inicio = new Date().toISOString();
  supabase = require(path.join(__dirname, "..", "src", "supabase"));

  // Escolhe contas reais para os papéis (só leitura) e cria tokens para elas
  const { data: usuarios } = await supabase.from("usuarios").select("id, nome, tipo, dono").order("id");
  const clientes = usuarios.filter((u) => u.tipo === "cliente");
  const papeis = {
    cliente: clientes[0],
    outroCliente: clientes[1],
    fabricante: usuarios.find((u) => u.tipo === "fabricante" && !u.dono),
    dono: usuarios.find((u) => u.dono),
  };
  for (const [papel, u] of Object.entries(papeis)) {
    assert.ok(u, `o banco precisa ter uma conta para o papel "${papel}"`);
    tokens[papel] = jwt.sign({ id: u.id, nome: u.nome, tipo: u.tipo, dono: !!u.dono }, process.env.JWT_SECRET, { expiresIn: "10m" });
  }

  // Liga o servidor numa porta só para os testes
  servidor = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORTA) }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/saude")).ok) break; } catch { /* ainda ligando */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  // O único pedido que os testes criam de propósito
  const criado = await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario() });
  assert.strictEqual(criado.status, 201, "não conseguiu criar o pedido de teste");
  pedidoTeste = criado.dados;
});

after(async () => {
  // Limpeza: apaga tudo que os testes criaram (pedido de teste e qualquer
  // pedido que uma validação quebrada tenha deixado passar)
  const { data: sobras } = await supabase.from("pedidos").select("id")
    .like("descricao", MARCA + "%").gte("criado_em", inicio);
  for (const p of sobras || []) await supabase.from("pedidos").delete().eq("id", p.id);
  servidor?.kill();
});

// ---------------- LOGIN / TOKEN ----------------
test("sem login: listar pedidos é recusado (401)", async () => {
  esperarErro(await chamar("GET", "/pedidos"), 401);
});

test("token inventado é recusado (401)", async () => {
  esperarErro(await chamar("GET", "/pedidos", { cabecalhos: { Authorization: "Bearer abc.def.ghi" } }), 401);
});

test("token assinado com outro segredo é recusado (401)", async () => {
  const falso = jwt.sign({ id: 1, tipo: "fabricante", dono: true }, "segredo-errado");
  esperarErro(await chamar("GET", "/pedidos", { cabecalhos: { Authorization: "Bearer " + falso } }), 401);
});

test("token vencido é recusado (401)", async () => {
  const vencido = jwt.sign({ id: 1, tipo: "cliente", exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
  esperarErro(await chamar("GET", "/pedidos", { cabecalhos: { Authorization: "Bearer " + vencido } }), 401);
});

test("token de conta que não existe é recusado (401)", async () => {
  const fantasma = jwt.sign({ id: 999999999, tipo: "cliente" }, process.env.JWT_SECRET);
  esperarErro(await chamar("GET", "/pedidos", { cabecalhos: { Authorization: "Bearer " + fantasma } }), 401);
});

test("login de teste: campos vazios (400), tipos errados (400) e senha errada (401)", async () => {
  esperarErro(await chamar("POST", "/usuarios/login", { corpo: {} }), 400);
  esperarErro(await chamar("POST", "/usuarios/login", { corpo: { email: 123, senha: { a: 1 } } }), 401);
  esperarErro(await chamar("POST", "/usuarios/login", { corpo: { email: "ninguem@exemplo.com", senha: "errada" } }), 401);
});

test("login com Google sem token válido é recusado", async () => {
  const r = await chamar("POST", "/usuarios/google", { corpo: { access_token: "falso" } });
  assert.ok([400, 401].includes(r.status), `veio ${r.status}`);
});

// ---------------- PERMISSÕES ----------------
test("fabricante não pode criar pedido (403)", async () => {
  esperarErro(await chamar("POST", "/pedidos", { quem: "fabricante", corpo: formulario() }), 403);
});

test("cliente não pode mandar orçamento (403)", async () => {
  esperarErro(await chamar("POST", `/pedidos/${pedidoTeste.id}/orcamentos`, { quem: "cliente", corpo: { preco: 10, prazo_dias: 2 } }), 403);
});

test("cliente não vê nem conversa no pedido de outro cliente (403)", async () => {
  esperarErro(await chamar("GET", `/pedidos/${pedidoTeste.id}`, { quem: "outroCliente" }), 403);
  esperarErro(await chamar("GET", `/pedidos/${pedidoTeste.id}/mensagens`, { quem: "outroCliente" }), 403);
  esperarErro(await chamar("POST", `/pedidos/${pedidoTeste.id}/mensagens`, { quem: "outroCliente", corpo: { texto: "oi" } }), 403);
});

test("cliente não pode excluir pedido de outro cliente (404)", async () => {
  esperarErro(await chamar("DELETE", `/pedidos/${pedidoTeste.id}`, { quem: "outroCliente" }), 404);
});

test("fabricante comum não pode excluir pedido (404)", async () => {
  esperarErro(await chamar("DELETE", `/pedidos/${pedidoTeste.id}`, { quem: "fabricante" }), 404);
});

test("fabricante comum não vê a lista de todos os pedidos (só o dono)", async () => {
  const r = await chamar("GET", "/pedidos?todos=1", { quem: "fabricante" });
  assert.strictEqual(r.status, 200);
  assert.ok(r.dados.every((p) => ["aberto", "com_orcamento"].includes(p.status) || p.fabricante_id),
    "fabricante comum recebeu pedidos que não deveria ver");
});

test("só o dono acessa a Equipe/convites (403 para os outros)", async () => {
  esperarErro(await chamar("GET", "/convites", { quem: "fabricante" }), 403);
  esperarErro(await chamar("GET", "/convites", { quem: "cliente" }), 403);
  esperarErro(await chamar("POST", "/convites", { quem: "fabricante", corpo: { email: "x@exemplo.com" } }), 403);
});

test("cliente não pode avançar a produção (403) nem fabricante confirmar recebimento (403)", async () => {
  esperarErro(await chamar("PATCH", `/pedidos/${pedidoTeste.id}/status`, { quem: "cliente" }), 403);
  esperarErro(await chamar("PATCH", `/pedidos/${pedidoTeste.id}/recebido`, { quem: "fabricante" }), 403);
});

test("fabricante que não foi escolhido não avança a produção (403)", async () => {
  esperarErro(await chamar("PATCH", `/pedidos/${pedidoTeste.id}/status`, { quem: "fabricante" }), 403);
});

test("cliente não confirma recebimento de pedido que não está pronto (400)", async () => {
  esperarErro(await chamar("PATCH", `/pedidos/${pedidoTeste.id}/recebido`, { quem: "cliente" }), 400);
});

// ---------------- DADOS ERRADOS NO NOVO PEDIDO ----------------
test("novo pedido sem título ou só com espaços (400)", async () => {
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ titulo: undefined }) }), 400);
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ titulo: "    " }) }), 400);
});

test("novo pedido com quantidade zero, negativa ou com letras (400)", async () => {
  for (const q of ["0", "-3", "abc", "2.5", "999999999"]) {
    esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ quantidade: q }) }), 400);
  }
});

test("novo pedido com medidas negativas ou com letras (400)", async () => {
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ largura_mm: "-10" }) }), 400);
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ altura_mm: "dez" }) }), 400);
});

test("novo pedido com data inexistente ou que já passou (400)", async () => {
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ prazo: "2026-02-31" }) }), 400);
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ prazo: "amanhã" }) }), 400);
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: formulario({ prazo: "2020-01-01" }) }), 400);
});

test("novo pedido com arquivo de tipo proibido (400)", async () => {
  const f = formulario();
  f.append("anexos", new Blob(["MZ"]), "virus.exe");
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: f }), 400);
});

test("novo pedido com mais de 5 arquivos (400)", async () => {
  const f = formulario();
  for (let i = 0; i < 6; i++) f.append("anexos", new Blob(["x"]), `foto${i}.png`);
  esperarErro(await chamar("POST", "/pedidos", { quem: "cliente", corpo: f }), 400);
});

// ---------------- ORÇAMENTO, CHAT, ENDEREÇOS ----------------
test("orçamento com preço zero, negativo, gigante, letras ou prazo quebrado (400)", async () => {
  const ruins = [{ preco: 0, prazo_dias: 3 }, { preco: -5, prazo_dias: 3 }, { preco: "abc", prazo_dias: 3 },
    { preco: 1e12, prazo_dias: 3 }, { preco: 50, prazo_dias: 2.5 }, { preco: 50, prazo_dias: 0 }, {}];
  for (const corpo of ruins) {
    esperarErro(await chamar("POST", `/pedidos/${pedidoTeste.id}/orcamentos`, { quem: "fabricante", corpo }), 400);
  }
});

test("mensagem vazia ou só com espaços (400)", async () => {
  esperarErro(await chamar("POST", `/pedidos/${pedidoTeste.id}/mensagens`, { quem: "cliente", corpo: { texto: "   " } }), 400);
  esperarErro(await chamar("POST", `/pedidos/${pedidoTeste.id}/mensagens`, { quem: "cliente", corpo: {} }), 400);
});

test("buscar mensagens com 'depois' inválido não quebra (200)", async () => {
  const r = await chamar("GET", `/pedidos/${pedidoTeste.id}/mensagens?depois=abc`, { quem: "cliente" });
  assert.strictEqual(r.status, 200);
});

test("pedido com id que não é número ou não existe (404)", async () => {
  esperarErro(await chamar("GET", "/pedidos/abc", { quem: "cliente" }), 404);
  esperarErro(await chamar("GET", "/pedidos/1.5", { quem: "cliente" }), 404);
  esperarErro(await chamar("GET", "/pedidos/999999999", { quem: "cliente" }), 404);
  esperarErro(await chamar("DELETE", "/pedidos/abc", { quem: "dono" }), 404);
});

test("aceitar orçamento que não existe (404)", async () => {
  esperarErro(await chamar("POST", "/orcamentos/999999999/aceitar", { quem: "cliente" }), 404);
  esperarErro(await chamar("POST", "/orcamentos/xyz/aceitar", { quem: "cliente" }), 404);
});

test("dono: remover cargo de fabricante com id inválido (404) e convite com e-mail inválido (400)", async () => {
  esperarErro(await chamar("POST", "/convites/fabricantes/abc/remover", { quem: "dono" }), 404);
  esperarErro(await chamar("DELETE", "/convites/abc", { quem: "dono" }), 404);
  esperarErro(await chamar("POST", "/convites", { quem: "dono", corpo: { email: "nao-e-email" } }), 400);
});

test("JSON quebrado no corpo (400)", async () => {
  esperarErro(await chamar("POST", "/usuarios/login", { corpo: "{email:", cabecalhos: { "Content-Type": "application/json" } }), 400);
});

test("endereço de API que não existe responde 404 em JSON", async () => {
  esperarErro(await chamar("GET", "/nao-existe"), 404);
});
