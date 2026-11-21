// Funções de login: criar o "token" e conferir se ele é válido.
// O token (JWT) é como um crachá: o servidor entrega no login,
// e o navegador mostra esse crachá em toda chamada seguinte.
const jwt = require("jsonwebtoken");

const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) {
  console.error("Falta JWT_SECRET no arquivo .env");
  process.exit(1);
}

// Cria um token com id, nome e tipo do usuário. Vale por 7 dias.
function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo, dono: !!usuario.dono },
    SEGREDO,
    { expiresIn: "7d" }
  );
}

// "Middleware": roda antes das rotas protegidas.
// 1) Confere se o token é válido (assinatura e validade).
// 2) Busca o papel ATUAL no banco. Assim, se o dono tirar o cargo de
//    fabricante de alguém, isso vale na hora, mesmo com o token antigo.
async function exigirLogin(req, res, next) {
  const cabecalho = req.headers.authorization || "";
  const token = cabecalho.replace("Bearer ", "");
  let dados;
  try {
    dados = jwt.verify(token, SEGREDO);
  } catch {
    return res.status(401).json({ erro: "Faça login para continuar." });
  }
  try {
    const supabase = require("./supabase");
    const { data: atual } = await supabase
      .from("usuarios").select("id, nome, tipo, dono").eq("id", dados.id).maybeSingle();
    if (!atual) return res.status(401).json({ erro: "Conta não encontrada. Faça login de novo." });
    req.usuario = { ...dados, tipo: atual.tipo, dono: atual.dono, nome: atual.nome };
    next();
  } catch (e) { next(e); }
}

// Só deixa passar usuários de um tipo (ex.: só fabricantes enviam orçamento)
function exigirTipo(tipo) {
  return (req, res, next) => {
    if (req.usuario.tipo !== tipo) {
      return res.status(403).json({ erro: `Apenas contas de ${tipo} podem fazer isso.` });
    }
    next();
  };
}

module.exports = { gerarToken, exigirLogin, exigirTipo };
