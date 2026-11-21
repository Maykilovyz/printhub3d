// =============================================================
// Página de entrada: login com Google (e login de teste).
// =============================================================
const erro = document.querySelector("#erro");
const botaoGoogle = document.querySelector("#google");

// Se já estiver logado, vai direto para o painel certo
if (sessao.token()) irParaPainel(sessao.usuario());

let clienteSupabase = null;

// 1) Pega a URL e a chave PÚBLICA do Supabase no nosso servidor
async function prepararGoogle() {
  const cfg = await fetch("/api/config").then((r) => r.json());
  if (!cfg.supabaseChavePublica) {
    botaoGoogle.disabled = true;
    erro.textContent = "Login com Google ainda não configurado (falta SUPABASE_PUBLISHABLE_KEY no .env).";
    return;
  }
  // "supabase" aqui é a biblioteca carregada pelo <script> do CDN
  clienteSupabase = supabase.createClient(cfg.supabaseUrl, cfg.supabaseChavePublica, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  // 2) Voltando do Google? A biblioteca já leu o código da URL e criou a sessão.
  const { data } = await clienteSupabase.auth.getSession();
  if (data.session) await trocarPorTokenDoSite(data.session.access_token);
}

// 3) Manda o token do Google/Supabase para o nosso servidor e recebe o nosso
async function trocarPorTokenDoSite(accessToken) {
  botaoGoogle.disabled = true;
  botaoGoogle.querySelector("span").textContent = "Entrando…";
  try {
    const r = await fetch("/api/usuarios/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro);
    // Não precisamos mais da sessão do Supabase no navegador
    await clienteSupabase.auth.signOut({ scope: "local" });
    sessao.salvar(dados.token, dados.usuario);
    irParaPainel(dados.usuario);
  } catch (e) {
    erro.textContent = e.message;
    botaoGoogle.disabled = false;
    botaoGoogle.querySelector("span").textContent = "Entrar com Google";
  }
}

// Clique no botão: vai para a tela do Google
botaoGoogle.onclick = async () => {
  erro.textContent = "";
  const { error } = await clienteSupabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + "/", queryParams: { prompt: "select_account" } },
  });
  if (error) erro.textContent = "Não foi possível abrir o Google: " + error.message;
};

// Login das contas de teste (e-mail e senha)
document.querySelector("#form-teste").onsubmit = async (e) => {
  e.preventDefault();
  erro.textContent = "";
  try {
    const r = await fetch("/api/usuarios/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.querySelector("#t-email").value,
        senha: document.querySelector("#t-senha").value,
      }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro);
    sessao.salvar(dados.token, dados.usuario);
    irParaPainel(dados.usuario);
  } catch (err) { erro.textContent = err.message; }
};

prepararGoogle().catch(() => (erro.textContent = "Não foi possível carregar o login. Recarregue a página."));
