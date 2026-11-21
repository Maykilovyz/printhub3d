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
// Se o token estiver certo, coloca o usuário em req.usuario e deixa passar.
function exigirLogin(req, res, next) {
  const cabecalho = req.headers.authorization || "";
  const token = cabecalho.replace("Bearer ", "");
  try {
    req.usuario = jwt.verify(token, SEGREDO);
    next();
  } catch {
    res.status(401).json({ erro: "Faça login para continuar." });
  }
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
