// Rotas de conta: login com Google, login de teste por e-mail e "quem sou eu".
//
// Como funciona o login com Google:
// 1. O navegador manda a pessoa para o Google (via Supabase Auth).
// 2. O Google devolve a pessoa para o site já logada no Supabase.
// 3. O navegador envia o "token do Supabase" para POST /api/usuarios/google.
// 4. Aqui conferimos esse token com o Supabase, achamos (ou criamos) o usuário
//    na NOSSA tabela e devolvemos o NOSSO token. Daí em diante tudo é igual.
const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../supabase");
const { gerarToken, exigirLogin } = require("../autenticacao");

const rotas = express.Router();
const CAMPOS = "id, nome, email, tipo, cidade, foto_url, dono";

// E-mail do dono da plataforma (o primeiro fabricante). Fica no .env.
const DONO_EMAIL = (process.env.DONO_EMAIL || "").toLowerCase().trim();

// POST /api/usuarios/google  -> troca o token do Google/Supabase pelo nosso
rotas.post("/google", async (req, res, next) => {
  try {
    // 1) Confere com o Supabase se o token é verdadeiro
    const { data, error } = await supabase.auth.getUser(req.body.access_token);
    if (error || !data.user) {
      return res.status(401).json({ erro: "Não foi possível confirmar seu login com o Google. Tente de novo." });
    }
    const g = data.user;
    const email = g.email.toLowerCase();
    const nome = g.user_metadata?.full_name || g.user_metadata?.name || email.split("@")[0];
    const foto = g.user_metadata?.avatar_url || null;

    // 2) Procura o usuário pelo id do Google ou pelo e-mail
    let { data: usuario } = await supabase
      .from("usuarios").select("*")
      .or(`auth_id.eq.${g.id},email.eq.${email}`)
      .limit(1).maybeSingle();

    // 3) Existe convite pendente para este e-mail?
    const { data: convite } = await supabase
      .from("convites").select("id")
      .ilike("email", email).is("usado_em", null)
      .maybeSingle();

    const ehDono = DONO_EMAIL && email === DONO_EMAIL;
    // Regra: vira fabricante quem é o dono ou quem foi convidado. O resto é cliente.
    const virarFabricante = ehDono || !!convite;

    if (!usuario) {
      // Primeira vez: cria a conta
      const novo = await supabase.from("usuarios").insert({
        nome, email, auth_id: g.id, foto_url: foto,
        tipo: virarFabricante ? "fabricante" : "cliente",
        dono: !!ehDono,
      }).select("*").single();
      if (novo.error) throw novo.error;
      usuario = novo.data;
    } else {
      // Já existe: atualiza foto/id e, se tiver convite, promove a fabricante
      const mudancas = { auth_id: g.id, foto_url: foto };
      if (virarFabricante) mudancas.tipo = "fabricante";
      if (ehDono) mudancas.dono = true;
      const atual = await supabase.from("usuarios").update(mudancas)
        .eq("id", usuario.id).select("*").single();
      if (atual.error) throw atual.error;
      usuario = atual.data;
    }

    // 4) Marca o convite como usado
    if (convite && usuario.tipo === "fabricante") {
      await supabase.from("convites")
        .update({ usado_por: usuario.id, usado_em: new Date().toISOString() })
        .eq("id", convite.id);
    }

    delete usuario.senha_hash;
    res.json({ token: gerarToken(usuario), usuario });
  } catch (e) { next(e); }
});

// POST /api/usuarios/login  -> login por e-mail e senha.
// Só serve para as contas de teste criadas antes do Google.
// Não existe mais cadastro por e-mail: contas novas só pelo Google.
rotas.post("/login", async (req, res, next) => {
  try {
    // String(): se mandarem um número ou objeto no lugar do texto, não quebra
    const email = String(req.body.email ?? "").trim();
    const senha = String(req.body.senha ?? "");
    if (!email || !senha) {
      return res.status(400).json({ erro: "Informe e-mail e senha." });
    }

    const { data: usuario, error } = await supabase
      .from("usuarios").select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    if (error) throw error;

    // Contas Google não têm senha_hash, então nunca entram por aqui
    const confere = usuario?.senha_hash && (await bcrypt.compare(senha, usuario.senha_hash));
    if (!confere) {
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }

    delete usuario.senha_hash;
    res.json({ token: gerarToken(usuario), usuario });
  } catch (e) { next(e); }
});

// GET /api/usuarios/eu  -> dados de quem está logado
rotas.get("/eu", exigirLogin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("usuarios").select(CAMPOS).eq("id", req.usuario.id).single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// PATCH /api/usuarios/eu  -> atualiza a cidade (o Google não informa)
rotas.patch("/eu", exigirLogin, async (req, res, next) => {
  try {
    const cidade = String(req.body.cidade || "").trim().slice(0, 80) || null;
    const { data, error } = await supabase
      .from("usuarios").update({ cidade }).eq("id", req.usuario.id).select(CAMPOS).single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = rotas;
