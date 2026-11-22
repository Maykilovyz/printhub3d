# PrintHub 3D

Plataforma web que conecta **clientes** que precisam de uma peça impressa em 3D a **fabricantes** que têm impressora.
O cliente descreve a peça e anexa referências, os fabricantes enviam orçamentos, o cliente aceita um e os dois conversam pelo chat até a entrega.

Os diagramas do fluxo, da arquitetura e do banco estão em [docs/diagramas.md](docs/diagramas.md).

---

## Tecnologias

| Parte | Tecnologia | Por quê |
|---|---|---|
| Telas | HTML, CSS e JavaScript puro | Simples, sem framework para aprender |
| Servidor | Node.js + Express | Poucas linhas para criar uma API |
| Banco de dados | PostgreSQL no Supabase | Gratuito e os dados não se perdem |
| Arquivos (fotos e .stl) | Supabase Storage | Guarda arquivos fora do servidor |
| Login | bcrypt (senha) + JWT (token) | Padrão de mercado e fácil de explicar |
| Hospedagem | Render | Publica direto do GitHub, plano grátis |

## Estrutura de pastas

```
PrintHub3D/
├── server.js              ← liga o servidor e junta as rotas
├── package.json           ← lista de bibliotecas e comandos
├── .env.example           ← modelo das senhas/chaves (o .env real não vai pro GitHub)
├── src/
│   ├── supabase.js        ← conexão com o banco e o storage
│   ├── autenticacao.js    ← cria e confere o token de login
│   ├── permissoes.js      ← regra de quem pode ver cada pedido
│   └── rotas/
│       ├── usuarios.js    ← cadastro, login
│       ├── pedidos.js     ← criar/listar pedidos, upload, status
│       ├── orcamentos.js  ← enviar e aceitar orçamento
│       ├── mensagens.js   ← chat
│       ├── convites.js    ← dono convida fabricantes
│       └── app.js         ← entrega as telas em .zip para o app se atualizar
├── public/                ← tudo que o navegador recebe
│   ├── index.html         ← login com Google
│   ├── painel-cliente.html     ← painel do cliente (pedidos por etapa)
│   ├── painel-fabricante.html  ← painel do fabricante (abas + equipe)
│   ├── novo-pedido.html   ← formulário do pedido
│   ├── pedido.html        ← detalhes, orçamentos e chat
│   ├── css/estilo.css
│   └── js/ (api.js, entrar.js, pedido.js, painel-fabricante.js)
├── app-android/           ← app Android (Capacitor) que usa as páginas de public/
│   ├── capacitor.config.json  ← nome do app, id e de onde vêm as páginas
│   └── android/           ← projeto Android gerado (Gradle)
├── supabase/schema.sql    ← cria as tabelas
├── supabase/migracao-02-google-convites.sql ← login Google + convites
└── docs/diagramas.md      ← diagramas para a apresentação
```

---

## Passo 1: criar o banco no Supabase

1. Entre em https://supabase.com/dashboard e clique em **New project**.
   - Nome: `printhub3d` · Região: **South America (São Paulo)** · Plano: Free.
   - Anote a senha do banco (não vamos usar no código, mas guarde).
2. Quando o projeto terminar de criar, abra **SQL Editor → New query**.
3. Cole todo o conteúdo de [supabase/schema.sql](supabase/schema.sql) e clique em **Run**.
4. Faça o mesmo com [supabase/migracao-02-google-convites.sql](supabase/migracao-02-google-convites.sql).
5. Vá em **Project Settings → API** e copie:
   - **Project URL** (só até `.supabase.co`, sem `/rest/v1/`)
   - **publishable** (ou **anon**): chave pública, usada pelo botão do Google
   - **service_role** (ou **secret key**). Esta é secreta!

## Passo 1b: ligar o "Entrar com Google"

**No Google Cloud** (https://console.cloud.google.com):
1. Crie um projeto (ex.: `printhub3d`).
2. **APIs e serviços → Tela de consentimento OAuth**: tipo **Externo**, nome do app `PrintHub 3D`, seu e-mail de suporte. Salve.
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - **URIs de redirecionamento autorizados**: `https://SEU-PROJETO.supabase.co/auth/v1/callback`
4. Copie o **ID do cliente** e a **Chave secreta do cliente**.

**No Supabase:**
1. **Authentication → Sign In / Providers → Google**: ative, cole o ID e a chave secreta do cliente e salve.
2. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (depois troque pelo link do Render)
   - **Redirect URLs**: adicione `http://localhost:3000/**` e, depois de publicar, `https://SEU-SITE.onrender.com/**`

**Quem vira fabricante:**
- O e-mail em `DONO_EMAIL` (no `.env`) é o **dono**: ao entrar com o Google, vira fabricante e ganha a aba **Equipe**.
- Na aba Equipe, o dono convida outros e-mails. Quando o convidado entra com o Google, a conta já abre como fabricante.
- Qualquer outra pessoa que entra com o Google vira **cliente**. Não existe cadastro por e-mail e senha.

## Passo 2: rodar no seu computador

```bash
cp .env.example .env
```

Abra o arquivo `.env` e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DONO_EMAIL` e um texto aleatório em `JWT_SECRET`. Depois:

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:3000. Para testar o fluxo inteiro, entre com o Google do dono (fabricante) e, numa janela anônima, com outro Google (cliente). As contas de teste antigas continuam entrando pelo link "Entrar com conta de teste".

## Passo 3: publicar na internet (GitHub + Render)

1. Crie um repositório **vazio** no GitHub chamado `printhub3d`.
2. Na pasta do projeto:
   ```bash
   git init
   ```
   ```bash
   git add . && git commit -m "PrintHub 3D"
   ```
   ```bash
   git branch -M main && git remote add origin https://github.com/SEU-USUARIO/printhub3d.git && git push -u origin main
   ```
3. Em https://render.com: **New → Web Service → conecte o repositório**.
   - Runtime: **Node** · Build command: `npm install` · Start command: `npm start` · Plano: **Free**.
   - Em **Environment Variables**, adicione `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_WEB_CLIENT_ID`, `DONO_EMAIL` e `JWT_SECRET` (os mesmos valores do `.env`).
   - Depois de publicar, coloque o link do Render em **Site URL** e **Redirect URLs** do Supabase (Passo 1b).
4. Clique em **Create Web Service**. Em uns 3 minutos o Render mostra o link `https://printhub3d-xxxx.onrender.com`.

> **Dica para o dia da apresentação:** no plano grátis o Render "dorme" depois de 15 minutos sem uso, e a primeira abertura demora uns 50 segundos. Abra o link uns 2 minutos antes de apresentar.

---

## App Android

O app fica na pasta `app-android/` e é feito com **Capacitor**: ele coloca as mesmas páginas da pasta `public/` dentro de um app Android. As páginas ficam no celular e os dados vêm da **mesma API do Render** (`https://printhub3d-hqb0.onrender.com/api`), então app e site usam o mesmo banco: um pedido criado no app aparece no site e vice-versa.

O que muda no código para o app funcionar:
- `public/js/api.js`: descobre se está no app (`NO_APP`) e, se estiver, usa o endereço completo do servidor (`SERVIDOR`).
- `server.js`: libera o CORS só para a origem do app (`https://localhost`).
- `public/js/entrar.js`: no app, o "Entrar com Google" usa o login nativo do Android (plugin `@capgo/capacitor-social-login`), porque o Google bloqueia login dentro de app.
- `public/novo-pedido.html`: no app aparece o campo "Ou tire uma foto agora", que abre a câmera.

### Configurar o login com Google do app (uma vez)

1. Gere o APK uma vez (abaixo) e pegue a impressão digital **SHA-1** da chave de debug:
   ```bash
   ~/Android/jdk/bin/keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1
   ```
2. **Google Cloud → Credenciais → Criar credenciais → ID do cliente OAuth**, tipo **Android**:
   nome do pacote `com.printhub3d.app` e o SHA-1 do passo 1. (Esse ID não vai no código: ele só autoriza o app.)
3. Copie o **ID do cliente "Aplicativo da Web"** (o que já existe, do Passo 1b) para a variável `GOOGLE_WEB_CLIENT_ID` no `.env` e no Render.
4. Nada muda no Supabase: o provedor Google já aceita tokens desse mesmo ID da Web.

### Gerar o APK de debug

Precisa de **Java 21** e do **Android SDK**. Neste computador eles estão em `~/Android/jdk` e `~/Android/Sdk`. Em cada terminal novo:
```bash
export JAVA_HOME=~/Android/jdk ANDROID_HOME=~/Android/Sdk
```
Depois:
```bash
cd app-android && npm install && npm run apk
```
O APK sai na pasta `app-android/apks/`, com número e data no nome (ex.: `PrintHub3D-v3-22-11-14h05.apk`): o de número maior é o mais novo. Mande para o celular (cabo, Drive, WhatsApp) e instale (o Android pede para permitir "instalar apps desconhecidos").

### Atualização sem reinstalar

Mudanças nas telas (pasta `public/`) chegam ao app **sozinhas**, sem instalar outro APK:

1. Quando o servidor liga, `src/rotas/app.js` junta a pasta `public/` num `.zip` e calcula a versão (um resumo/hash do conteúdo).
2. Ao abrir, o app pergunta `GET /api/app/versao`. Se a versão for diferente da dele, baixa o `.zip` (plugin `@capgo/capacitor-updater`).
3. A versão nova entra na próxima vez que o app for minimizado ou aberto de novo.
4. Segurança contra erro: se a versão nova não abrir direito em 10 segundos, o app volta sozinho para a anterior.

Ou seja: entrou na `main`, o Render publica, e na próxima abertura o app já se atualiza.

### Ícone do app

O ícone (um polvo minimalista no degradê azul → roxo) está desenhado em `app-android/icone/polvo.svg`. Para mudar: edite o SVG e rode `python3 gerar-icones.py` dentro de `app-android/icone`. Ele usa o Chrome para gerar todos os tamanhos que o Android pede. Depois gere um APK novo.

Só é preciso gerar e instalar um **APK novo** quando mudar algo do lado Android: plugin novo, permissão, ícone, nome do app.

> O app conversa com o servidor do Render. Se o Render estiver "dormindo", o primeiro login no app demora uns 50 segundos.

---

## Segurança (pontos bons para citar na banca)

- **Login com Google**: o site não guarda senhas; o servidor confere o login com o Supabase antes de criar a sessão.
- **Contas limitadas**: cada conta é presa a um Google; fabricante só entra por convite do dono.
- **Senhas** das contas de teste são salvas como hash com bcrypt, nunca em texto puro.
- **Token JWT** identifica o usuário em toda chamada; rotas protegidas recusam quem não tem token.
- **RLS ligado** no banco sem regras públicas: só o servidor, com a chave secreta, acessa os dados.
- **Permissões por papel:** só cliente cria pedido; só fabricante orça; só o dono aceita orçamento.
- **Storage privado:** arquivos são abertos por links temporários de 1 hora.
- **Proteção contra XSS:** todo texto digitado passa pela função `esc()` antes de aparecer na tela.
- A chave secreta fica no `.env`, que está no `.gitignore` e nunca vai para o GitHub.
