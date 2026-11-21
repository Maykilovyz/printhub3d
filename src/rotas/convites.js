// Rotas de convite: só o DONO (primeiro fabricante) usa.
// Ele convida um e-mail; quando essa pessoa entrar com o Google,
// vira fabricante automaticamente (ver rotas/usuarios.js).
const express = require("express");
const supabase = require("../supabase");
const { exigirLogin } = require("../autenticacao");

const rotas = express.Router();
rotas.use(exigirLogin); // montado em /api/convites, então só afeta essas rotas

// Middleware: confere NO BANCO se quem chamou é o dono
async function exigirDono(req, res, next) {
  const { data } = await supabase.from("usuarios").select("dono").eq("id", req.usuario.id).single();
  if (!data?.dono) return res.status(403).json({ erro: "Só o dono da plataforma pode convidar fabricantes." });
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
    const { data, error } = await supabase
      .from("convites").delete()
      .eq("id", req.params.id).is("usado_em", null)
      .select("id");
    if (error) throw error;
    if (!data.length) return res.status(404).json({ erro: "Convite não encontrado ou já usado." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = rotas;
