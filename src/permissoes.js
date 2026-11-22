// Regras de quem pode ver o quê em um pedido.
// Ficam num arquivo só para pedidos, orçamentos e chat usarem a mesma regra.
const supabase = require("./supabase");

// Busca o pedido e diz se o usuário pode vê-lo.
// - O cliente dono sempre pode.
// - Fabricantes podem ver pedidos ainda abertos (para orçar)
//   e, depois do aceite, só o fabricante escolhido.
// - O dono da plataforma (DONO_EMAIL) vê todos, para poder administrar e excluir.
async function carregarPedidoSePermitido(pedidoId, usuario) {
  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) throw error;
  if (!pedido) return { pedido: null, permitido: false };

  const ehDono = pedido.cliente_id === usuario.id;
  const aindaAberto = ["aberto", "com_orcamento"].includes(pedido.status);
  const ehFabricanteEscolhido = pedido.fabricante_id === usuario.id;
  const ehFabricante = usuario.tipo === "fabricante";

  const ehDonoDaPlataforma = !!usuario.dono;

  const permitido = ehDono || ehFabricanteEscolhido || (ehFabricante && aindaAberto) || ehDonoDaPlataforma;
  return { pedido, permitido };
}

module.exports = { carregarPedidoSePermitido };
