// Rotas de orçamento: fabricante envia, cliente aceita.
const express = require("express");
const supabase = require("../supabase");
const { exigirLogin, exigirTipo } = require("../autenticacao");
const { carregarPedidoSePermitido } = require("../permissoes");

const rotas = express.Router();
// Obs.: este grupo fica em "/api", então o login é exigido rota por rota
// (se fosse rotas.use, bloquearia todas as outras rotas /api também).

// POST /api/pedidos/:id/orcamentos  -> fabricante manda proposta
rotas.post("/pedidos/:id/orcamentos", exigirLogin, exigirTipo("fabricante"), async (req, res, next) => {
  try {
    const { pedido, permitido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    if (!permitido || !["aberto", "com_orcamento"].includes(pedido.status)) {
      return res.status(400).json({ erro: "Este pedido não está mais recebendo orçamentos." });
    }

    const preco = Number(req.body.preco);
    const prazo_dias = parseInt(req.body.prazo_dias, 10);
    if (!(preco > 0) || !(prazo_dias > 0)) {
      return res.status(400).json({ erro: "Informe preço e prazo maiores que zero." });
    }

    const { data, error } = await supabase
      .from("orcamentos")
      .insert({
        pedido_id: pedido.id,
        fabricante_id: req.usuario.id,
        preco,
        prazo_dias,
        observacao: req.body.observacao || null,
      })
      .select()
      .single();
    if (error && error.code === "23505") {
      return res.status(409).json({ erro: "Você já enviou um orçamento para este pedido." });
    }
    if (error) throw error;

    // Primeiro orçamento muda o status do pedido para "com_orcamento"
    if (pedido.status === "aberto") {
      await supabase.from("pedidos").update({ status: "com_orcamento" }).eq("id", pedido.id);
    }

    res.status(201).json(data);
  } catch (e) { next(e); }
});

// POST /api/orcamentos/:id/aceitar  -> cliente escolhe um orçamento
rotas.post("/orcamentos/:id/aceitar", exigirLogin, exigirTipo("cliente"), async (req, res, next) => {
  try {
    const { data: orc, error } = await supabase
      .from("orcamentos").select("*").eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!orc) return res.status(404).json({ erro: "Orçamento não encontrado." });

    const { pedido } = await carregarPedidoSePermitido(orc.pedido_id, req.usuario);
    if (!pedido || pedido.cliente_id !== req.usuario.id) {
      return res.status(403).json({ erro: "Este pedido não é seu." });
    }
    if (pedido.status !== "com_orcamento") {
      return res.status(400).json({ erro: "Este pedido já tem um orçamento aceito." });
    }

    // 1) Marca este como aceito e os outros como recusados
    await supabase.from("orcamentos").update({ status: "recusado" })
      .eq("pedido_id", pedido.id).neq("id", orc.id);
    await supabase.from("orcamentos").update({ status: "aceito" }).eq("id", orc.id);

    // 2) Pedido passa para "aceito" e guarda quem vai fabricar
    const { data: atualizado, error: e2 } = await supabase
      .from("pedidos")
      .update({ status: "aceito", fabricante_id: orc.fabricante_id })
      .eq("id", pedido.id)
      .select()
      .single();
    if (e2) throw e2;

    res.json(atualizado);
  } catch (e) { next(e); }
});

module.exports = rotas;
