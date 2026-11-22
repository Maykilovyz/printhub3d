// =============================================================
// Painel do fabricante: pedidos para orçar, orçamentos enviados,
// trabalhos em produção e (só para o dono) convites de equipe.
// =============================================================
const eu = exigirLogin("fabricante");

function preencher(id, pedidos, vazio, extra) {
  document.querySelector("#n-" + id).textContent = pedidos.length || "";
  document.querySelector("#lista-" + id).innerHTML = pedidos.length
    ? pedidos.map((p) => itemPedido(p, extra(p))).join("")
    : `<li class="vazio">${vazio}</li>`;
}

// Pedidos que já estavam na tela. Serve para destacar os que chegarem depois.
let idsConhecidos = null;

async function carregarPedidos() {
  try {
    const pedidos = await api("/pedidos");
    const abertos = (p) => ["aberto", "com_orcamento"].includes(p.status);

    // Separa a mesma lista em três abas
    preencher("disponiveis", pedidos.filter((p) => abertos(p) && !p.ja_orcei),
      "Nenhum pedido novo agora.",
      (p) => { const n = p.orcamentos?.[0]?.count ?? 0; return n ? `${n} orçamento${n > 1 ? "s" : ""}` : ""; });
    preencher("orcados", pedidos.filter((p) => abertos(p) && p.ja_orcei),
      "Nenhum orçamento esperando resposta.", () => "");
    preencher("trabalhos", pedidos.filter((p) => p.fabricante_id === eu.id),
      "Orçamentos aceitos aparecem aqui.", () => "");

    // Pedido que não estava na tela antes ganha o destaque "novo"
    if (idsConhecidos) {
      pedidos.filter((p) => !idsConhecidos.has(p.id)).forEach((p) =>
        document.querySelectorAll(`a[href="/pedido.html?id=${p.id}"]`).forEach((a) => a.parentElement.classList.add("novo")));
    }
    idsConhecidos = new Set(pedidos.map((p) => p.id));
  } catch (e) {
    document.querySelector("#lista-disponiveis").innerHTML = `<li class="vazio">${esc(e.message)}</li>`;
  }
}

// Pede a cidade se ainda não tiver
async function verificarCidade() {
  const perfil = await api("/usuarios/eu");
  // Se o cargo de fabricante foi removido, atualiza a sessão e vai para o painel de cliente
  if (perfil.tipo !== "fabricante") {
    sessao.salvar(sessao.token(), { ...sessao.usuario(), tipo: perfil.tipo, dono: perfil.dono });
    return irParaPainel(perfil);
  }
  const form = document.querySelector("#form-cidade");
  form.hidden = !!perfil.cidade;
  form.onsubmit = async (e) => {
    e.preventDefault();
    await api("/usuarios/eu", { method: "PATCH", body: { cidade: document.querySelector("#cidade").value } });
    form.hidden = true;
  };
}

// ---------- EQUIPE (só dono) ----------
async function carregarEquipe() {
  const { convites, fabricantes } = await api("/convites");
  document.querySelector("#lista-convites").innerHTML = convites.length
    ? convites.map((c) => `<li><span>${esc(c.email)}</span>${c.usado_em
        ? `<span class="etiqueta s-entregue">Aceito</span>`
        : `<span class="linha-acoes"><span class="etiqueta s-aberto">Pendente</span><button type="button" class="botao pequeno" data-cancelar="${c.id}">Cancelar</button></span>`}</li>`).join("")
    : `<li class="apagado">Nenhum convite enviado.</li>`;
  document.querySelector("#lista-fabricantes").innerHTML = fabricantes.map((f) =>
    `<li data-fab="${f.id}"><span><strong>${esc(f.nome)}</strong><br><span class="apagado" style="font-size:13px">${esc(f.email)}${f.cidade ? " · " + esc(f.cidade) : ""}</span></span>
      ${f.dono
        ? `<span class="etiqueta s-com_orcamento">Dono</span>`
        : `<span class="linha-acoes">
             <button type="button" class="botao pequeno" data-remover="${f.id}">Remover</button>
             <span class="confirmar" hidden>
               <span class="apagado">Virar cliente?</span>
               <button type="button" class="botao pequeno perigo" data-confirmar="${f.id}">Remover</button>
               <button type="button" class="botao pequeno" data-voltar>Cancelar</button>
             </span>
           </span>`}
      </li>`).join("");

  // Remover cargo: 1º clique mostra a confirmação, 2º clique remove de verdade
  document.querySelectorAll("[data-remover]").forEach((b) => (b.onclick = () => {
    b.hidden = true;
    b.nextElementSibling.hidden = false;
  }));
  document.querySelectorAll("[data-voltar]").forEach((b) => (b.onclick = () => {
    const caixa = b.closest(".confirmar");
    caixa.hidden = true;
    caixa.previousElementSibling.hidden = false;
  }));
  document.querySelectorAll("[data-confirmar]").forEach((b) => (b.onclick = async () => {
    const erro = document.querySelector("#equipe-erro");
    erro.textContent = "";
    b.disabled = true;
    try {
      await api(`/convites/fabricantes/${b.dataset.confirmar}/remover`, { method: "POST" });
      carregarEquipe();
    } catch (e) {
      erro.textContent = e.message;
      b.disabled = false;
    }
  }));

  document.querySelectorAll("[data-cancelar]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api("/convites/" + b.dataset.cancelar, { method: "DELETE" }); carregarEquipe(); }
    catch (e) { document.querySelector("#convite-erro").textContent = e.message; b.disabled = false; }
  }));
}

document.querySelector("#form-convite").onsubmit = async (e) => {
  e.preventDefault();
  const campo = document.querySelector("#convite-email");
  const erro = document.querySelector("#convite-erro");
  erro.textContent = "";
  try {
    await api("/convites", { method: "POST", body: { email: campo.value } });
    campo.value = "";
    carregarEquipe();
  } catch (err) { erro.textContent = err.message; }
};

if (eu) {
  ligarAbas();
  carregarPedidos();
  atualizarSozinho(carregarPedidos, 3); // pedidos novos aparecem sem recarregar a página
  verificarCidade().catch(() => {});
  if (eu.dono) {
    document.querySelector("#btn-equipe").hidden = false;
    carregarEquipe().catch(() => {});
  }
}
