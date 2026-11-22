// Rotas de convite: só o DONO (primeiro fabricante) usa.
// Ele convida um e-mail; quando essa pessoa entrar com o Google,
// vira fabricante automaticamente (ver rotas/usuarios.js).
const express = require("express");
const supabase = require("../supabase");
const { exigirLogin } = require("../autenticacao");

const rotas = express.Router();
rotas.use(exigirLogin); // montado em /api/convites, então só afeta essas rotas

// Middleware: só o dono passa (exigirLogin já trouxe "dono" atualizado do banco)
function exigirDono(req, res, next) {
  if (!req.usuario.dono) return res.status(403).json({ erro: "Só o dono da plataforma pode gerenciar fabricantes." });
  next();
}
rotas.use(exigirDono);

// GET /api/convites  -> convites enviados + fabricantes ativos
rotas.get("/", async (req, res, next) => {
  try {
    const [convites, fabricantes] = await Promise.all([
      supabase.from("convites").select("id, email, criado_em, usado_em")
        .order("criado_em", { ascending: false }),
      supabase.from("usuarios").select("id, nome, email, cidade, dono, criado_em")
        .eq("tipo", "fabricante").order("criado_em"),
    ]);
    if (convites.error) throw convites.error;
    if (fabricantes.error) throw fabricantes.error;
    res.json({ convites: convites.data, fabricantes: fabricantes.data });
  } catch (e) { next(e); }
});

// POST /api/convites  -> convida um e-mail
rotas.post("/", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erro: "Digite um e-mail válido." });
    }

    // Já é fabricante?
    const { data: existente } = await supabase
      .from("usuarios").select("tipo").eq("email", email).maybeSingle();
    if (existente?.tipo === "fabricante") {
      return res.status(409).json({ erro: "Este e-mail já é de um fabricante." });
    }

    const { data, error } = await supabase
      .from("convites").insert({ email, criado_por: req.usuario.id })
      .select("id, email, criado_em, usado_em").single();
    if (error && error.code === "23505") {
      return res.status(409).json({ erro: "Já existe um convite pendente para este e-mail." });
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { next(e); }
});

// DELETE /api/convites/:id  -> cancela um convite ainda não usado
rotas.delete("/:id", async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ erro: "Convite não encontrado ou já usado." });
    const { data, error } = await supabase
      .from("convites").delete()
      .eq("id", req.params.id).is("usado_em", null)
      .select("id");
    if (error) throw error;
    if (!data.length) return res.status(404).json({ erro: "Convite não encontrado ou já usado." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/convites/fabricantes/:id/remover  -> tira o cargo de fabricante
// Regras:
// - o dono não pode remover a si mesmo;
// - se a pessoa tem trabalhos em andamento (aceito / em produção), bloqueia,
//   para nenhum cliente ficar sem a peça;
// - orçamentos ainda pendentes dela são apagados;
// - a conta continua existindo, agora como cliente.
rotas.post("/fabricantes/:id/remover", async (req, res, next) => {
  try {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0; // "abc" vira 0 (não existe)

    const { data: alvo } = await supabase
      .from("usuarios").select("id, nome, tipo, dono").eq("id", id).maybeSingle();
    if (!alvo || alvo.tipo !== "fabricante") {
      return res.status(404).json({ erro: "Fabricante não encontrado." });
    }
    if (alvo.dono || alvo.id === req.usuario.id) {
      return res.status(400).json({ erro: "O dono não pode remover o próprio cargo." });
    }

    // 1) Tem trabalhos em andamento?
    const { count: emAndamento } = await supabase
      .from("pedidos").select("id", { count: "exact", head: true })
      .eq("fabricante_id", id).in("status", ["aceito", "em_producao", "pronto"]);
    if (emAndamento > 0) {
      return res.status(409).json({
        erro: `${alvo.nome} tem ${emAndamento} trabalho(s) em andamento. Espere a entrega antes de remover.`,
      });
    }

    // 2) Apaga os orçamentos pendentes e anota quais pedidos foram afetados
    const { data: apagados, error: e1 } = await supabase
      .from("orcamentos").delete()
      .eq("fabricante_id", id).eq("status", "pendente")
      .select("pedido_id");
    if (e1) throw e1;

    // 3) Pedido que ficou sem nenhum orçamento volta para "aberto"
    const afetados = [...new Set((apagados || []).map((o) => o.pedido_id))];
    for (const pedidoId of afetados) {
      const { count } = await supabase
        .from("orcamentos").select("id", { count: "exact", head: true }).eq("pedido_id", pedidoId);
      if (count === 0) {
        await supabase.from("pedidos").update({ status: "aberto" })
          .eq("id", pedidoId).eq("status", "com_orcamento");
      }
    }

    // 4) Vira cliente
    const { error: e2 } = await supabase.from("usuarios").update({ tipo: "cliente" }).eq("id", id);
    if (e2) throw e2;

    res.json({ ok: true, orcamentos_removidos: (apagados || []).length });
  } catch (e) { next(e); }
});

module.exports = rotas;
