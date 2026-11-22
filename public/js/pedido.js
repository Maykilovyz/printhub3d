// =============================================================
// Página de detalhes do pedido: ficha, anexos, orçamentos e chat.
// A mesma página mostra ações diferentes para cliente e fabricante.
// =============================================================
const eu = exigirLogin();
// Fabricante vê a página com a cor da "Oficina"
if (eu && eu.tipo === "fabricante") document.body.classList.add("tema-oficina");
const pedidoId = new URLSearchParams(location.search).get("id");
const ETAPAS = ["aberto", "com_orcamento", "aceito", "em_producao", "pronto", "entregue"];
let pedido = null;
let assinatura = ""; // "resumo" do pedido, para saber se algo mudou

// O que importa para a tela. Os links dos anexos mudam a cada busca (são temporários),
// por isso não entram aqui: senão a tela seria redesenhada à toa.
const resumir = (p) => JSON.stringify([p.status, p.fabricante_id, p.anexos.length,
  p.orcamentos.map((o) => [o.id, o.status, o.preco, o.prazo_dias])]);

// Primeira vez: monta a página inteira (pedido, orçamentos e chat)
async function carregar() {
  try {
    pedido = await api("/pedidos/" + pedidoId);
    assinatura = resumir(pedido);
    montarPagina();
    iniciarChat();
    atualizarSozinho(atualizarAoVivo, 3); // depois, confere mudanças a cada 3 segundos
  } catch (e) {
    document.querySelector("#conteudo").innerHTML = `<p class="erro-msg">${esc(e.message)}</p>`;
  }
}

// Ao vivo: busca o pedido de novo e só redesenha se algo mudou.
// O chat não é redesenhado (ele tem a própria atualização) e nada que a
// pessoa esteja digitando ou confirmando é apagado.
async function atualizarAoVivo() {
  try {
    const novo = await api("/pedidos/" + pedidoId);
    if (!novo || resumir(novo) === assinatura) return;
    pedido = novo;
    assinatura = resumir(novo);
    const confirmando = document.querySelector("#confirmar-excluir:not([hidden])");
    if (!confirmando) desenharPedido();
    const formOrc = document.querySelector("#form-orcamento");
    const digitando = formOrc && [...formOrc.elements].some((c) => c.value);
    if (!digitando) desenharOrcamentosNaTela();
  } catch { /* se falhar, tenta de novo no próximo ciclo */ }
}

// Depois de uma ação da própria pessoa (aceitar, avançar...), redesenha na hora
async function recarregar() {
  pedido = await api("/pedidos/" + pedidoId);
  assinatura = resumir(pedido);
  desenharPedido();
  desenharOrcamentosNaTela();
}

function montarPagina() {
  document.querySelector("#conteudo").innerHTML = `
  <div class="duas-colunas">
    <section class="cartao" id="cartao-pedido"></section>
    <div class="coluna">
      <section class="cartao"><h2>Orçamentos</h2><div id="orcamentos"></div></section>
      <section class="cartao"><h2>Conversa</h2>
        <div class="chat" id="chat"><p class="apagado">Nenhuma mensagem ainda.</p></div>
        <form class="chat-form" id="chat-form">
          <input id="chat-texto" placeholder="Escreva uma mensagem" aria-label="Mensagem" autocomplete="off" maxlength="2000">
          <button class="botao principal">Enviar</button>
        </form>
      </section>
    </div>
  </div>`;
  desenharPedido();
  desenharOrcamentosNaTela();
}

function desenharOrcamentosNaTela() {
  document.querySelector("#orcamentos").innerHTML = desenharOrcamentos();
  ligarBotoes();
}

function desenharPedido() {
  const p = pedido;
  const passo = ETAPAS.indexOf(p.status);
  const dims = p.largura_mm ? `${p.largura_mm} × ${p.profundidade_mm || "?"} × ${p.altura_mm || "?"} mm` : "";

  // Ficha: só mostra o que foi preenchido
  const ficha = [
    ["Medidas", dims],
    ["Material", p.material],
    ["Cor", p.cor],
    ["Quantidade", p.quantidade > 1 ? p.quantidade + " un." : ""],
    ["Prazo", p.prazo ? data(p.prazo) : ""],
  ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");

  document.querySelector("#cartao-pedido").innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
          <span class="rotulo">${esc(p.categoria)}</span>
          <span class="etiqueta s-${p.status}">${NOMES_STATUS[p.status] || p.status}</span>
        </div>
        <h1>${esc(p.titulo)}</h1>
        <span class="apagado" style="font-size:14px">${esc(p.cliente?.nome)}${p.cliente?.cidade ? " · " + esc(p.cliente.cidade) : ""}</span>
      </div>
      <ol class="linha-tempo" aria-label="Etapa ${passo + 1} de ${ETAPAS.length}">${ETAPAS.map((s, i) =>
        `<li class="${i <= passo ? "feito" : ""}" title="${NOMES_STATUS[s]}">${NOMES_STATUS[s]}</li>`).join("")}</ol>
      <p class="descricao">${esc(p.descricao)}</p>
      ${ficha ? `<dl class="ficha">${ficha}</dl>` : ""}
      ${p.anexos.length ? `<div class="campo"><h3>Arquivos</h3>${desenharAnexos(p.anexos)}</div>` : ""}
      ${desenharAcaoFabricante()}
      ${desenharAcaoCliente()}`;

  ligarBotoes();
}

// Mostra o tamanho em KB ou MB, o que fizer mais sentido
function tamanho(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
}

function desenharAnexos(anexos) {
  return `<ul class="anexos">${anexos.map((a) => {
    const ehImagem = /\.(jpe?g|png|webp)$/i.test(a.nome_original);
    return `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">
      ${ehImagem ? `<img src="${esc(a.url)}" alt="">` : ""}
      <span>${esc(a.nome_original)}</span>
      <span class="apagado mono" style="font-size:12px;font-weight:400">${tamanho(a.tamanho_bytes)}</span></a></li>`;
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
          <p class="apagado" style="font-size:14px">${o.prazo_dias} dias${o.fabricante?.cidade ? " · " + esc(o.fabricante.cidade) : ""}</p>
          ${o.observacao ? `<p style="font-size:14px;margin-top:6px">${esc(o.observacao)}</p>` : ""}</div>
        <div class="lado">
          <span class="preco">${reais(o.preco)}</span>
          ${ehCliente && pedido.status === "com_orcamento"
            ? `<button class="botao principal pequeno" data-aceitar="${o.id}">Aceitar</button>`
            : `<span class="etiqueta s-${o.status}">${{ pendente: "Pendente", aceito: "Aceito", recusado: "Recusado" }[o.status]}</span>`}
        </div>
      </div>`).join("")
    : `<p class="apagado">${ehCliente ? "Aguardando os fabricantes." : "Envie o seu abaixo."}</p>`;

  // Formulário de orçamento (só para fabricante que ainda não orçou)
  if (podeOrcar) {
    html += `
    <form id="form-orcamento" style="display:flex;flex-direction:column;gap:12px">
      <div class="grade" style="grid-template-columns:1fr 1fr">
        <div class="campo"><label for="o-preco">Preço (R$)</label><input id="o-preco" type="number" min="1" step="0.01" required class="mono"></div>
        <div class="campo"><label for="o-prazo">Prazo (dias)</label><input id="o-prazo" type="number" min="1" required class="mono"></div>
      </div>
      <div class="campo"><label for="o-obs">Observação <span class="apagado" style="font-weight:400">(opcional)</span></label>
        <textarea id="o-obs" style="min-height:80px" placeholder="Ex.: sugiro PLA cinza."></textarea></div>
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
  if (pedido.status === "em_producao") return `<div class="acoes"><button class="botao principal" id="avancar">Marcar peça como pronta</button></div>`;
  if (pedido.status === "pronto") return `<p class="apagado">Peça pronta. Esperando o cliente confirmar que recebeu.</p>`;
  return "";
}

// Cliente dono confirma o recebimento, ou exclui o pedido se ninguém estiver trabalhando nele
function desenharAcaoCliente() {
  if (eu.tipo === "cliente" && pedido.status === "pronto") {
    return `<div class="acoes"><button class="botao principal" id="recebido">Recebi o pedido</button></div>`;
  }
  const podeExcluir = ["aberto", "com_orcamento", "entregue"].includes(pedido.status);
  if (eu.tipo !== "cliente" || !podeExcluir) return "";
  return `<div class="acoes" id="acoes-excluir">
    <button type="button" class="botao fantasma" id="excluir">Excluir pedido</button>
    <span class="confirmar" id="confirmar-excluir" hidden>
      <span class="apagado">Apagar pedido, arquivos e conversa?</span>
      <button type="button" class="botao pequeno" id="cancelar-excluir">Cancelar</button>
      <button type="button" class="botao pequeno perigo" id="sim-excluir">Excluir</button>
    </span>
  </div>
  <p class="erro-msg" id="erro-excluir" role="alert"></p>`;
}

function ligarBotoes() {
  // Cliente exclui o pedido: 1º clique pede confirmação, 2º apaga
  const excluir = document.querySelector("#excluir");
  if (excluir) {
    const caixa = document.querySelector("#confirmar-excluir");
    excluir.onclick = () => { excluir.hidden = true; caixa.hidden = false; };
    document.querySelector("#cancelar-excluir").onclick = () => { caixa.hidden = true; excluir.hidden = false; };
    document.querySelector("#sim-excluir").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await api("/pedidos/" + pedidoId, { method: "DELETE" });
        clearInterval(timerChat);
        location.href = "/painel-cliente.html";
      } catch (err) {
        document.querySelector("#erro-excluir").textContent = err.message;
        e.target.disabled = false;
      }
    };
  }

  // Cliente aceita um orçamento
  document.querySelectorAll("[data-aceitar]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api(`/orcamentos/${b.dataset.aceitar}/aceitar`, { method: "POST" }); recarregar(); }
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
      formOrc.reset();
      recarregar();
    } catch (err) { document.querySelector("#o-erro").textContent = err.message; }
  };

  // Fabricante avança a produção
  const avancar = document.querySelector("#avancar");
  if (avancar) avancar.onclick = async () => {
    avancar.disabled = true;
    try { await api(`/pedidos/${pedidoId}/status`, { method: "PATCH" }); recarregar(); }
    catch (e) { alert(e.message); avancar.disabled = false; }
  };

  // Cliente confirma que recebeu a peça
  const recebido = document.querySelector("#recebido");
  if (recebido) recebido.onclick = async () => {
    recebido.disabled = true;
    try { await api(`/pedidos/${pedidoId}/recebido`, { method: "PATCH" }); recarregar(); }
    catch (e) { alert(e.message); recebido.disabled = false; }
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
