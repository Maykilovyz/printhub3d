// =============================================================
// Funções usadas por todas as páginas.
// "api()" conversa com o servidor e já manda o token de login.
// =============================================================

// Estamos dentro do app Android? O Capacitor cria "window.Capacitor" no app.
// No site isso não existe, então NO_APP fica false.
const NO_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// Endereço do servidor. No site é vazio: "/api/..." vai para o próprio site.
// No app as páginas ficam guardadas no celular, então precisamos do endereço
// completo do servidor publicado no Render (o mesmo banco do site).
const SERVIDOR = NO_APP ? "https://printhub3d-hqb0.onrender.com" : "";

// Elementos marcados com data-so-app só aparecem no app (ex.: botão "Tirar foto")
if (NO_APP) document.querySelectorAll("[data-so-app]").forEach((el) => (el.hidden = false));

// O token e o usuário ficam salvos no navegador (localStorage)
const sessao = {
  token: () => localStorage.getItem("token"),
  usuario: () => JSON.parse(localStorage.getItem("usuario") || "null"),
  salvar(token, usuario) {
    localStorage.setItem("token", token);
    localStorage.setItem("usuario", JSON.stringify(usuario));
  },
  sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    location.href = "/";
  },
};

// Cada tipo de conta tem o seu painel
function irParaPainel(usuario) {
  location.href = usuario && usuario.tipo === "fabricante" ? "/painel-fabricante.html" : "/painel-cliente.html";
}

// Faz uma chamada para a API. Se der erro, lança com a mensagem do servidor.
async function api(caminho, opcoes = {}) {
  const cabecalhos = { Authorization: "Bearer " + sessao.token() };
  // Se não for upload de arquivo (FormData), enviamos JSON
  if (opcoes.body && !(opcoes.body instanceof FormData)) {
    cabecalhos["Content-Type"] = "application/json";
    opcoes.body = JSON.stringify(opcoes.body);
  }
  const resposta = await fetch(SERVIDOR + "/api" + caminho, { ...opcoes, headers: cabecalhos });
  const dados = await resposta.json().catch(() => ({}));

  if (resposta.status === 401) { sessao.sair(); return; } // token vencido
  if (!resposta.ok) throw new Error(dados.erro || "Algo deu errado.");
  return dados;
}

// Páginas internas chamam isto. Se não estiver logado, volta para o login.
// Se passar o tipo ("cliente" ou "fabricante") e a conta for de outro tipo,
// manda para o painel certo.
function exigirLogin(tipo) {
  const u = sessao.usuario();
  if (!sessao.token() || !u) { location.href = "/"; return null; }
  if (tipo && u.tipo !== tipo) { irParaPainel(u); return null; }

  const nome = document.querySelector("#nome-usuario");
  if (nome) nome.textContent = u.nome;
  const papel = document.querySelector("#papel-usuario");
  if (papel) papel.textContent = u.tipo === "cliente" ? "Cliente" : (u.dono ? "Fabricante · dono" : "Fabricante");
  const foto = document.querySelector("#foto-usuario");
  if (foto && u.foto_url) { foto.src = u.foto_url; foto.hidden = false; }
  const sair = document.querySelector("#sair");
  if (sair) sair.onclick = sessao.sair;
  return u;
}

// Textos bonitos para os status
const NOMES_STATUS = {
  aberto: "Aguardando orçamentos",
  com_orcamento: "Orçamentos recebidos",
  aceito: "Orçamento aceito",
  em_producao: "Em produção",
  entregue: "Entregue",
};

// Evita que texto digitado por usuários vire HTML (segurança contra XSS)
function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const reais = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (s) => (s ? new Date(s.length === 10 ? s + "T12:00" : s).toLocaleDateString("pt-BR") : "—");

// Monta um item da lista de pedidos (usado nos dois painéis)
function itemPedido(p, extra) {
  // Só o essencial: título, status, categoria/prazo e um detalhe opcional
  return `<li><a href="/pedido.html?id=${p.id}">
    <strong>${esc(p.titulo)}</strong>
    <span class="etiqueta s-${p.status}">${NOMES_STATUS[p.status]}</span>
    <span class="sub">${esc(p.categoria)}${p.prazo ? " · até " + data(p.prazo) : ""}</span>
    <span class="lado">${extra || ""}</span>
  </a></li>`;
}

// Atualiza uma tela sozinha, sem precisar recarregar a página:
// - a cada "segundos" (só enquanto a tela está visível, para não gastar à toa)
// - e na hora em que a pessoa volta para a tela (outra aba do navegador ou app minimizado)
function atualizarSozinho(carregar, segundos = 10) {
  setInterval(() => { if (!document.hidden) carregar(); }, segundos * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
}

// Abas simples: botões com data-aba mostram a seção de mesmo id
function ligarAbas() {
  const botoes = document.querySelectorAll("[data-aba]");
  botoes.forEach((b) => (b.onclick = () => {
    botoes.forEach((x) => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll(".aba").forEach((s) => (s.hidden = s.id !== b.dataset.aba));
  }));
}
