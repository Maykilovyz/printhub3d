// Funções pequenas para conferir o que o usuário mandou ANTES de mexer no banco.
// Assim um dado errado vira uma mensagem clara (erro 400/404), e não "erro interno".

// Os ids do banco são números inteiros. "abc" ou "1.5" na URL não existe:
// responde 404 direto, sem nem perguntar ao banco.
// Uso: rotas.param("id", idValido("Pedido não encontrado."))
function idValido(mensagem) {
  return (req, res, next, valor) => {
    if (!/^\d{1,15}$/.test(valor)) return res.status(404).json({ erro: mensagem });
    next();
  };
}

// Lê um número inteiro opcional de um formulário.
// Vazio -> null (campo não preenchido). Texto ou fora do limite -> NaN (inválido).
function inteiroOpcional(valor, minimo, maximo) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const texto = String(valor).trim();
  if (!/^-?\d+$/.test(texto)) return NaN;
  const n = Number(texto);
  return n >= minimo && n <= maximo ? n : NaN;
}

// Confere se é uma data real no formato AAAA-MM-DD (ex.: 31/02 não existe)
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(texto + "T12:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === texto;
}

// Texto obrigatório: tira espaços das pontas e corta no tamanho máximo
const texto = (valor, maximo) => String(valor ?? "").trim().slice(0, maximo);

module.exports = { idValido, inteiroOpcional, dataValida, texto };
