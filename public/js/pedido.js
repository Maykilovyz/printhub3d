// =============================================================
// Página de detalhes do pedido: ficha, anexos, orçamentos e chat.
// A mesma página mostra ações diferentes para cliente e fabricante.
// =============================================================
const eu = exigirLogin();
// Fabricante vê a página com a cor da "Oficina"
if (eu && eu.tipo === "fabricante") document.body.classList.add("tema-oficina");
const pedidoId = new URLSearchParams(location.search).get("id");
const ETAPAS = ["aberto", "com_orcamento", "aceito", "em_producao", "entregue"];
let pedido = null;

async function carregar() {
  try {
    pedido = await api("/pedidos/" + pedidoId);
    desenhar();
    iniciarChat();
  } catch (e) {
    document.querySelector("#conteudo").innerHTML = `<p class="erro-msg">${esc(e.message)}</p>`;
  }
}

function desenhar() {
  const p = pedido;
  const passo = ETAPAS.indexOf(p.status);
  const dims = p.largura_mm ? `${p.largura_mm} × ${p.profundidade_mm || "?"} × ${p.altura_mm || "?"} mm` : "Não informado";

  document.querySelector("#conteudo").innerHTML = `
  <div class="duas-colunas">
    <section class="cartao">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
        <div><span class="rotulo">Pedido #${p.id} · ${esc(p.categoria)}</span><h1 style="margin-top:4px">${esc(p.titulo)}</h1></div>
        <span class="etiqueta s-${p.status}">${NOMES_STATUS[p.status]}</span>
      </div>
      <ol class="linha-tempo">${ETAPAS.map((s, i) =>
        `<li class="${i <= passo ? "feito" : ""} ${i === passo ? "atual" : ""}">${NOMES_STATUS[s]}</li>`).join("")}</ol>
      <p>${esc(p.descricao)}</p>
      <dl class="ficha">
        <dt>Dimensões</dt><dd class="mono">${dims}</dd>
        <dt>Material</dt><dd>${esc(p.material || "—")}</dd>
        <dt>Cor</dt><dd>${esc(p.cor || "—")}</dd>
        <dt>Quantidade</dt><dd class="mono">${p.quantidade}</dd>
        <dt>Prazo</dt><dd>${data(p.prazo)}</dd>
        <dt>Cliente</dt><dd>${esc(p.cliente?.nome)}${p.cliente?.cidade ? " · " + esc(p.cliente.cidade) : ""}</dd>
      </dl>
      <div class="campo"><h3>Anexos</h3>${desenharAnexos(p.anexos)}</div>
      ${desenharAcaoFabricante()}
    </section>

    <div style="display:flex;flex-direction:column;gap:20px">
      <section class="cartao"><h2>Orçamentos</h2>${desenharOrcamentos()}</section>
      <section class="cartao"><h2>Conversa</h2>
        <div class="chat" id="chat"><p class="apagado">Nenhuma mensagem ainda. Tire suas dúvidas por aqui.</p></div>
        <form class="chat-form" id="chat-form">
          <input id="chat-texto" placeholder="Escreva uma mensagem" aria-label="Mensagem" autocomplete="off" maxlength="2000">
          <button class="botao principal">Enviar</button>
        </form>
      </section>
    </div>
  </div>`;

  ligarBotoes();
}

// Mostra o tamanho em KB ou MB, o que fizer mais sentido
function tamanho(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
}

function desenharAnexos(anexos) {
  if (!anexos.length) return `<p class="apagado">Nenhum arquivo enviado.</p>`;
  return `<ul class="anexos">${anexos.map((a) => {
    const ehImagem = /\.(jpe?g|png|webp)$/i.test(a.nome_original);
    return `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.nome_original)}</a>
      <span class="apagado mono" style="font-size:13px"> ${tamanho(a.tamanho_bytes)}</span>
      ${ehImagem ? `<img src="${esc(a.url)}" alt="${esc(a.nome_original)}">` : ""}</li>`;
  }).join("")}</ul>`;
}

function desenharOrcamentos() {
  const lista = pedido.orcamentos;
  const ehCliente = eu.tipo === "cliente";
  const podeOrcar = !ehCliente && ["aberto", "com_orcamento"].includes(pedido.status) && !lista.length;

  let html = lista.length
    ? lista.map((o) => `
      <div class="orcamento ${o.status === "aceito" ? "aceito" : ""}">
        <div><h3>${esc(o.fabricante?.nome)}</h3>
          <p class="apagado" style="font-size:13px">${esc(o.fabricante?.cidade || "")} · entrega em ${o.prazo_dias} dias</p>
          ${o.observacao ? `<p style="font-size:14px;margin-top:4px">${esc(o.observacao)}</p>` : ""}</div>
        <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <span class="preco mono">${reais(o.preco)}</span>
          ${ehCliente && pedido.status === "com_orcamento"
            ? `<button class="botao principal pequeno" data-aceitar="${o.id}">Aceitar</button>`
            : `<span class="etiqueta s-${o.status}">${{ pendente: "Pendente", aceito: "Aceito", recusado: "Recusado" }[o.status]}</span>`}
        </div>
      </div>`).join("")
    : `<p class="apagado">${ehCliente ? "Os fabricantes ainda estão analisando seu pedido." : "Você ainda não enviou orçamento."}</p>`;

  // Formulário de orçamento (só para fabricante que ainda não orçou)
  if (podeOrcar) {
    html += `
    <form id="form-orcamento" style="display:flex;flex-direction:column;gap:12px">
      <div class="grade" style="grid-template-columns:1fr 1fr">
        <div class="campo"><label for="o-preco">Preço (R$)</label><input id="o-preco" type="number" min="1" step="0.01" required class="mono"></div>
        <div class="campo"><label for="o-prazo">Prazo (dias)</label><input id="o-prazo" type="number" min="1" required class="mono"></div>
      </div>
      <div class="campo"><label for="o-obs">Observações</label>
        <textarea id="o-obs" style="min-height:70px" placeholder="Ex.: sugiro PLA cinza, camada de 0,12 mm."></textarea></div>
      <p class="erro-msg" id="o-erro"></p>
      <button class="botao principal">Enviar orçamento</button>
    </form>`;
  }
  return html;
}

// Fabricante escolhido pode avançar o status da produção
function desenharAcaoFabricante() {
  if (eu.tipo !== "fabricante" || pedido.fabricante_id !== eu.id) return "";
  if (pedido.status === "aceito") return `<div class="acoes"><button class="botao principal" id="avancar">Iniciar produção</button></div>`;
  if (pedido.status === "em_producao") return `<div class="acoes"><button class="botao principal" id="avancar">Marcar como entregue</button></div>`;
  return "";
}

function ligarBotoes() {
  // Cliente aceita um orçamento
  document.querySelectorAll("[data-aceitar]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api(`/orcamentos/${b.dataset.aceitar}/aceitar`, { method: "POST" }); carregar(); }
    catch (e) { alert(e.message); b.disabled = false; }
  }));

  // Fabricante envia orçamento
  const formOrc = document.querySelector("#form-orcamento");
  if (formOrc) formOrc.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/pedidos/${pedidoId}/orcamentos`, {
        method: "POST",
        body: {
          preco: document.querySelector("#o-preco").value,
          prazo_dias: document.querySelector("#o-prazo").value,
          observacao: document.querySelector("#o-obs").value,
        },
      });
      carregar();
    } catch (err) { document.querySelector("#o-erro").textContent = err.message; }
  };

  // Fabricante avança a produção
  const avancar = document.querySelector("#avancar");
  if (avancar) avancar.onclick = async () => {
    avancar.disabled = true;
    try { await api(`/pedidos/${pedidoId}/status`, { method: "PATCH" }); carregar(); }
    catch (e) { alert(e.message); avancar.disabled = false; }
  };
}

// ---------------- CHAT ----------------
let ultimaMensagem = 0;
let timerChat = null;

function iniciarChat() {
  ultimaMensagem = 0;
  clearInterval(timerChat);
  buscarMensagens();
  timerChat = setInterval(buscarMensagens, 3000); // pergunta ao servidor a cada 3 segundos

  document.querySelector("#chat-form").onsubmit = async (e) => {
    e.preventDefault();
    const campo = document.querySelector("#chat-texto");
    const texto = campo.value.trim();
    if (!texto) return;
    campo.value = "";
    try {
      await api(`/pedidos/${pedidoId}/mensagens`, { method: "POST", body: { texto } });
      buscarMensagens();
    } catch (err) { alert(err.message); campo.value = texto; }
  };
}

async function buscarMensagens() {
  try {
    const novas = await api(`/pedidos/${pedidoId}/mensagens?depois=${ultimaMensagem}`);
    if (!novas || !novas.length) return;
    const chat = document.querySelector("#chat");
    if (ultimaMensagem === 0) chat.innerHTML = ""; // remove o texto "nenhuma mensagem"
    novas.forEach((m) => {
      chat.insertAdjacentHTML("beforeend",
        `<div class="msg ${m.autor_id === eu.id ? "minha" : ""}">
          <small>${esc(m.autor?.nome)} · ${new Date(m.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
          ${esc(m.texto)}</div>`);
      ultimaMensagem = m.id;
    });
    chat.scrollTop = chat.scrollHeight;
  } catch { /* se falhar, tenta de novo no próximo ciclo */ }
}

if (eu) carregar();
