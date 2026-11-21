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

async function carregarPedidos() {
  try {
    const pedidos = await api("/pedidos");
    const abertos = (p) => ["aberto", "com_orcamento"].includes(p.status);

    // Separa a mesma lista em três abas
    preencher("disponiveis", pedidos.filter((p) => abertos(p) && !p.ja_orcei),
      "Nenhum pedido novo para orçar agora.",
      (p) => { const n = p.orcamentos?.[0]?.count ?? 0; return n ? `${n} concorrente${n > 1 ? "s" : ""}` : "Seja o primeiro"; });
    preencher("orcados", pedidos.filter((p) => abertos(p) && p.ja_orcei),
      "Você não tem orçamentos esperando resposta.", () => "Aguardando o cliente");
    preencher("trabalhos", pedidos.filter((p) => p.fabricante_id === eu.id),
      "Quando um cliente aceitar seu orçamento, o trabalho aparece aqui.",
      (p) => (p.status === "entregue" ? "Concluído" : "Abra para atualizar"));
  } catch (e) {
    document.querySelector("#lista-disponiveis").innerHTML = `<li class="vazio">${esc(e.message)}</li>`;
  }
}

// Pede a cidade se ainda não tiver
async function verificarCidade() {
  const perfil = await api("/usuarios/eu");
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
    `<li><span><strong>${esc(f.nome)}</strong><br><span class="apagado" style="font-size:13px">${esc(f.email)}${f.cidade ? " · " + esc(f.cidade) : ""}</span></span>
      ${f.dono ? `<span class="etiqueta s-com_orcamento">Dono</span>` : ""}</li>`).join("");

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
  verificarCidade().catch(() => {});
  if (eu.dono) {
    document.querySelector("#btn-equipe").hidden = false;
    carregarEquipe().catch(() => {});
  }
}
