// Rotas do chat dentro de um pedido.
// O navegador pergunta a cada poucos segundos se há mensagens novas
// (técnica chamada "polling", simples e fácil de explicar).
const express = require("express");
const supabase = require("../supabase");
const { exigirLogin } = require("../autenticacao");
const { carregarPedidoSePermitido } = require("../permissoes");

const { idValido } = require("../validar");

const rotas = express.Router();
// Login exigido rota por rota, porque este grupo fica em "/api".
rotas.param("id", idValido("Pedido não encontrado."));

// GET /api/pedidos/:id/mensagens?depois=ID  -> lista mensagens (só as novas, se passar "depois")
rotas.get("/pedidos/:id/mensagens", exigirLogin, async (req, res, next) => {
  try {
    const { pedido, permitido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    if (!permitido) return res.status(403).json({ erro: "Você não tem acesso a este chat." });

    let consulta = supabase
      .from("mensagens")
      .select("id, texto, criado_em, autor_id, autor:usuarios(nome, tipo)")
      .eq("pedido_id", pedido.id)
      .order("id");
    // "depois" só vale se for um número; qualquer outra coisa é ignorada
    if (/^\d+$/.test(req.query.depois || "")) consulta = consulta.gt("id", Number(req.query.depois));

    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// POST /api/pedidos/:id/mensagens  -> envia uma mensagem
rotas.post("/pedidos/:id/mensagens", exigirLogin, async (req, res, next) => {
  try {
    const texto = (req.body.texto || "").trim();
    if (!texto) return res.status(400).json({ erro: "Escreva uma mensagem." });

    const { pedido, permitido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    if (!permitido) return res.status(403).json({ erro: "Você não tem acesso a este chat." });

    const { data, error } = await supabase
      .from("mensagens")
      .insert({ pedido_id: pedido.id, autor_id: req.usuario.id, texto: texto.slice(0, 2000) })
      .select("id, texto, criado_em, autor_id, autor:usuarios(nome, tipo)")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { next(e); }
});

module.exports = rotas;
