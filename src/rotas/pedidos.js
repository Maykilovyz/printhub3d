// Rotas de pedidos: criar, listar, ver detalhes e mudar status.
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const supabase = require("../supabase");
const { exigirLogin, exigirTipo } = require("../autenticacao");
const { carregarPedidoSePermitido } = require("../permissoes");

const rotas = express.Router();
rotas.use(exigirLogin); // todas as rotas de pedido exigem login

// Multer recebe os arquivos enviados pelo formulário (até 5 arquivos de 20 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
});
const EXTENSOES_OK = /\.(stl|obj|3mf|jpg|jpeg|png|webp|pdf)$/i;

// Converte texto do formulário em número inteiro (ou null se vazio)
const inteiro = (v) => (v === undefined || v === "" ? null : parseInt(v, 10));

// POST /api/pedidos  -> cliente cria um pedido (com anexos opcionais)
rotas.post("/", exigirTipo("cliente"), upload.array("anexos", 5), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.categoria || !b.titulo || !b.descricao) {
      return res.status(400).json({ erro: "Preencha categoria, título e descrição." });
    }
    const arquivoInvalido = (req.files || []).find((f) => !EXTENSOES_OK.test(f.originalname));
    if (arquivoInvalido) {
      return res.status(400).json({ erro: `Tipo de arquivo não aceito: ${arquivoInvalido.originalname}` });
    }

    // 1) Salva o pedido no banco
    const { data: pedido, error } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: req.usuario.id,
        categoria: b.categoria,
        titulo: b.titulo,
        descricao: b.descricao,
        largura_mm: inteiro(b.largura_mm),
        profundidade_mm: inteiro(b.profundidade_mm),
        altura_mm: inteiro(b.altura_mm),
        material: b.material || null,
        cor: b.cor || null,
        quantidade: inteiro(b.quantidade) || 1,
        prazo: b.prazo || null,
      })
      .select()
      .single();
    if (error) throw error;

    // 2) Envia cada arquivo para o Storage e registra na tabela anexos
    for (const arquivo of req.files || []) {
      const nomeSeguro = arquivo.originalname.replace(/[^\w.\-]/g, "_");
      const caminho = `${pedido.id}/${crypto.randomUUID()}-${nomeSeguro}`;

      const envio = await supabase.storage
        .from("anexos")
        .upload(caminho, arquivo.buffer, { contentType: arquivo.mimetype });
      if (envio.error) throw envio.error;

      const reg = await supabase.from("anexos").insert({
        pedido_id: pedido.id,
        nome_original: arquivo.originalname,
        caminho,
        tamanho_bytes: arquivo.size,
      });
      if (reg.error) throw reg.error;
    }

    res.status(201).json(pedido);
  } catch (e) { next(e); }
});

// GET /api/pedidos  -> lista do painel
//   cliente: os pedidos dele
//   fabricante: pedidos abertos + os que ele está produzindo
rotas.get("/", async (req, res, next) => {
  try {
    let consulta = supabase
      .from("pedidos")
      .select("id, titulo, categoria, status, criado_em, prazo, quantidade, fabricante_id, orcamentos(count)")
      .order("criado_em", { ascending: false });

    if (req.usuario.tipo === "cliente") {
      consulta = consulta.eq("cliente_id", req.usuario.id);
    } else if (req.usuario.dono && req.query.todos) {
      // Dono da plataforma pedindo ?todos=1: todos os pedidos, sem filtro (aba "Todos")
    } else {
      consulta = consulta.or(
        `status.in.(aberto,com_orcamento),fabricante_id.eq.${req.usuario.id}`
      );
    }

    const { data, error } = await consulta;
    if (error) throw error;

    // Para o fabricante, marca em quais pedidos ele já mandou orçamento
    if (req.usuario.tipo === "fabricante" && data.length) {
      const { data: meus } = await supabase
        .from("orcamentos")
        .select("pedido_id")
        .eq("fabricante_id", req.usuario.id);
      const jaOrcados = new Set((meus || []).map((o) => o.pedido_id));
      data.forEach((p) => (p.ja_orcei = jaOrcados.has(p.id)));
    }

    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/pedidos/:id  -> detalhes completos de um pedido
rotas.get("/:id", async (req, res, next) => {
  try {
    const { pedido, permitido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    if (!permitido) return res.status(403).json({ erro: "Você não tem acesso a este pedido." });

    // Nome do cliente
    const { data: cliente } = await supabase
      .from("usuarios").select("nome, cidade").eq("id", pedido.cliente_id).single();

    // Anexos com link temporário (1 hora) para baixar do Storage privado
    const { data: anexos } = await supabase
      .from("anexos").select("*").eq("pedido_id", pedido.id);
    for (const a of anexos || []) {
      const { data } = await supabase.storage.from("anexos").createSignedUrl(a.caminho, 3600);
      a.url = data ? data.signedUrl : null;
    }

    // Orçamentos: o cliente vê todos; o fabricante vê só o dele
    let consultaOrc = supabase
      .from("orcamentos")
      .select("*, fabricante:usuarios!orcamentos_fabricante_id_fkey(nome, cidade)")
      .eq("pedido_id", pedido.id)
      .order("preco");
    if (req.usuario.tipo === "fabricante") {
      consultaOrc = consultaOrc.eq("fabricante_id", req.usuario.id);
    }
    const { data: orcamentos, error } = await consultaOrc;
    if (error) throw error;

    res.json({ ...pedido, cliente, anexos: anexos || [], orcamentos });
  } catch (e) { next(e); }
});

// DELETE /api/pedidos/:id  -> exclui um pedido
// - Cliente: só o próprio e só quando ninguém está trabalhando nele
//   (aberto, com orçamentos ainda não aceitos, ou já entregue).
// - Dono da plataforma: qualquer pedido, em qualquer etapa.
const PODE_EXCLUIR = ["aberto", "com_orcamento", "entregue"];
rotas.delete("/:id", async (req, res, next) => {
  try {
    const { pedido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    const ehDonoDaPlataforma = !!req.usuario.dono;
    const ehClienteDoPedido = req.usuario.tipo === "cliente" && pedido?.cliente_id === req.usuario.id;
    if (!pedido || !(ehDonoDaPlataforma || ehClienteDoPedido)) {
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }
    if (!ehDonoDaPlataforma && !PODE_EXCLUIR.includes(pedido.status)) {
      return res.status(409).json({ erro: "Este pedido está com um fabricante. Converse com ele pelo chat antes de excluir." });
    }

    // 1) Apaga os arquivos do Storage (o banco não apaga arquivos sozinho)
    const { data: anexos } = await supabase.from("anexos").select("caminho").eq("pedido_id", pedido.id);
    if (anexos?.length) {
      const { error } = await supabase.storage.from("anexos").remove(anexos.map((a) => a.caminho));
      if (error) throw error;
    }

    // 2) Apaga o pedido. Anexos, orçamentos e mensagens saem junto (on delete cascade)
    const { error } = await supabase.from("pedidos").delete().eq("id", pedido.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PATCH /api/pedidos/:id/status  -> fabricante escolhido avança a produção
//   aceito -> em_producao -> pronto (peça feita)
// Quem marca "entregue" é o cliente, confirmando que recebeu (rota /recebido abaixo).
const PROXIMO = { aceito: "em_producao", em_producao: "pronto" };
rotas.patch("/:id/status", exigirTipo("fabricante"), async (req, res, next) => {
  try {
    const { pedido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    if (pedido.fabricante_id !== req.usuario.id) {
      return res.status(403).json({ erro: "Só o fabricante escolhido pode mudar o status." });
    }
    const novo = PROXIMO[pedido.status];
    if (!novo) return res.status(400).json({ erro: "Este pedido não pode avançar mais." });

    const { data, error } = await supabase
      .from("pedidos").update({ status: novo }).eq("id", pedido.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// PATCH /api/pedidos/:id/recebido  -> cliente confirma que recebeu a peça
//   pronto -> entregue
rotas.patch("/:id/recebido", exigirTipo("cliente"), async (req, res, next) => {
  try {
    const { pedido } = await carregarPedidoSePermitido(req.params.id, req.usuario);
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    if (pedido.cliente_id !== req.usuario.id) {
      return res.status(403).json({ erro: "Este pedido não é seu." });
    }
    if (pedido.status !== "pronto") {
      return res.status(400).json({ erro: "O fabricante ainda não marcou a peça como pronta." });
    }

    const { data, error } = await supabase
      .from("pedidos").update({ status: "entregue" }).eq("id", pedido.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = rotas;
