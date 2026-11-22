// Rotas de orçamento: fabricante envia, cliente aceita.
const express = require("express");
const supabase = require("../supabase");
const { exigirLogin, exigirTipo } = require("../autenticacao");
const { carregarPedidoSePermitido } = require("../permissoes");
const { idValido, texto } = require("../validar");

const rotas = express.Router();
rotas.param("id", idValido("Não encontrado.")); // id que não é número -> 404
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
    const prazo_dias = Number(req.body.prazo_dias);
    // Preço: maior que zero e cabe no banco (até R$ 99.999.999,99). Prazo: dias inteiros.
    if (!(preco > 0) || preco > 99999999.99 || !Number.isInteger(prazo_dias) || prazo_dias < 1 || prazo_dias > 3650) {
      return res.status(400).json({ erro: "Informe um preço maior que zero e um prazo em dias inteiros (1 a 3650)." });
    }

    const { data, error } = await supabase
      .from("orcamentos")
      .insert({
        pedido_id: pedido.id,
        fabricante_id: req.usuario.id,
        preco: Math.round(preco * 100) / 100,
        prazo_dias,
        observacao: texto(req.body.observacao, 1000) || null,
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
