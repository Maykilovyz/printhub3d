# PrintHub 3D: diagramas para a apresentação

> Os diagramas usam **Mermaid**. Eles aparecem desenhados no GitHub e no VS Code (extensão "Markdown Preview Mermaid").
> Para virar imagem nos slides: cole o código em https://mermaid.live e exporte PNG/SVG.

---

## 1. Fluxo do usuário (do pedido à entrega)

```mermaid
flowchart TD
    A([Cliente entra com Google]) --> B[Escolhe a categoria<br/>ex.: Arquitetura]
    B --> C[Novo pedido:<br/>descrição, dimensões,<br/>material, cor, quantidade]
    C --> D[Anexa imagens ou<br/>arquivo 3D .stl]
    D --> E[[Envia solicitação]]
    E --> F{{Status: aberto}}

    F --> G([Fabricante vê o pedido<br/>no painel])
    G --> H[Analisa a viabilidade<br/>e conversa pelo chat]
    H --> I[[Envia orçamento:<br/>preço + prazo]]
    I --> J{{Status: com_orcamento}}

    J --> K{Cliente compara<br/>orçamentos}
    K -->|Aceita um| L{{Status: aceito}}
    L --> M[Fabricante inicia produção]
    M --> N{{Status: em_producao}}
    N --> O[Fabricante marca<br/>a peça como pronta]
    O --> Q{{Status: pronto}}
    Q --> R[Cliente recebe e toca<br/>em "Recebi o pedido"]
    R --> P([Status: entregue])
```

---

## 1b. Login com Google e papéis

```mermaid
sequenceDiagram
    actor U as Usuário
    participant N as Navegador (index.html)
    participant G as Google
    participant SA as Supabase Auth
    participant S as Servidor (rotas/usuarios.js)
    participant DB as Banco

    U->>N: Clica em "Entrar com Google"
    N->>SA: signInWithOAuth(google)
    SA->>G: Pede login
    G-->>SA: Usuário confirmado
    SA-->>N: Volta para o site com a sessão
    N->>S: POST /api/usuarios/google (token do Supabase)
    S->>SA: Confere o token (getUser)
    S->>DB: Procura usuário pelo e-mail / convites pendentes
    alt e-mail é o DONO_EMAIL
        S->>DB: cria/atualiza como fabricante + dono
    else tem convite pendente
        S->>DB: cria/atualiza como fabricante e marca convite usado
    else nenhum dos dois
        S->>DB: cria como cliente
    end
    S-->>N: Token do PrintHub + tipo da conta
    N->>U: Abre painel-cliente.html ou painel-fabricante.html
```

```mermaid
flowchart LR
    D([Dono<br/>DONO_EMAIL]) -- "aba Equipe:<br/>convida e-mail" --> C[(convites)]
    C -- "convidado entra<br/>com Google" --> F([Fabricante])
    X([Qualquer outra<br/>conta Google]) --> CL([Cliente])
```

---

## 1c. Login com Google no app Android

O Google não deixa fazer login dentro de um app (WebView). No app usamos a janelinha **nativa** do Android para escolher a conta. O resto é igual ao site.

```mermaid
sequenceDiagram
    actor U as Usuário
    participant A as App (index.html)
    participant AN as Android (Credential Manager)
    participant SA as Supabase Auth
    participant S as Servidor (rotas/usuarios.js)

    U->>A: Toca em "Entrar com Google"
    A->>AN: SocialLogin.login (com nonce resumido)
    AN-->>A: idToken do Google
    A->>SA: signInWithIdToken(idToken, nonce)
    SA-->>A: Sessão do Supabase
    A->>S: POST /api/usuarios/google (igual ao site)
    S-->>A: Token do PrintHub + tipo da conta
```

---

## 2. Arquitetura do sistema

```mermaid
flowchart LR
    subgraph Navegador["Navegador do usuário"]
        HTML["Páginas HTML + CSS<br/>(pasta public)"]
        JS["JavaScript<br/>api.js / pedido.js"]
    end

    subgraph Celular["App Android (Capacitor)"]
        APPHTML["As mesmas páginas<br/>(cópia da pasta public)"]
        NATIVO["Login nativo do Google<br/>+ câmera"]
    end

    subgraph Render["Servidor no Render"]
        EXP["Express<br/>server.js"]
        AUTH["autenticacao.js<br/>(token JWT)"]
        ROTAS["Rotas da API<br/>usuarios · pedidos ·<br/>orcamentos · mensagens"]
    end

    subgraph Supabase["Supabase"]
        DB[("PostgreSQL<br/>tabelas")]
        ST[("Storage<br/>bucket 'anexos'")]
    end

    HTML --> JS
    JS -- "fetch /api/... + token" --> EXP
    EXP --> AUTH --> ROTAS
    ROTAS -- "lê e grava dados" --> DB
    ROTAS -- "envia arquivos / gera link" --> ST
    EXP -- "entrega os arquivos do site" --> HTML
    APPHTML --> NATIVO
    APPHTML -- "fetch https://...onrender.com/api + token<br/>(CORS liberado só para o app)" --> EXP
```

**O app e o site usam o mesmo servidor e o mesmo banco.** A diferença é que no app as páginas já estão dentro do celular (vêm no .apk), então só os dados passam pela internet. Por isso um pedido criado no app aparece no site e vice-versa.

**Ao vivo:** as telas (painéis, pedido e chat) perguntam ao servidor a cada 3 segundos se algo mudou e só redesenham o que mudou. Funciona igual no site e no app.

**Explicando em uma frase:** o navegador nunca fala direto com o banco. Ele sempre pede ao servidor, e o servidor confere quem é a pessoa (token) e o que ela pode fazer antes de mexer no banco.

---

## 3. Banco de dados (tabelas e ligações)

```mermaid
erDiagram
    USUARIOS ||--o{ PEDIDOS : "cliente faz"
    USUARIOS ||--o{ ORCAMENTOS : "fabricante envia"
    USUARIOS ||--o{ MENSAGENS : "escreve"
    USUARIOS ||--o{ CONVITES : "dono convida"
    PEDIDOS ||--o{ ANEXOS : "tem"
    PEDIDOS ||--o{ ORCAMENTOS : "recebe"
    PEDIDOS ||--o{ MENSAGENS : "tem chat"

    USUARIOS {
        bigint id PK
        text nome
        text email UK
        text senha_hash
        text tipo "cliente ou fabricante"
        text cidade
        uuid auth_id "id no Google/Supabase Auth"
        boolean dono "pode convidar"
    }
    CONVITES {
        bigint id PK
        text email
        bigint criado_por FK
        bigint usado_por FK
        timestamptz usado_em
    }
    PEDIDOS {
        bigint id PK
        bigint cliente_id FK
        bigint fabricante_id FK "quem foi escolhido"
        text categoria
        text titulo
        text descricao
        int largura_mm
        int profundidade_mm
        int altura_mm
        text material
        text cor
        int quantidade
        date prazo
        text status
    }
    ANEXOS {
        bigint id PK
        bigint pedido_id FK
        text nome_original
        text caminho "no Storage"
        bigint tamanho_bytes
    }
    ORCAMENTOS {
        bigint id PK
        bigint pedido_id FK
        bigint fabricante_id FK
        numeric preco
        int prazo_dias
        text observacao
        text status "pendente, aceito, recusado"
    }
    MENSAGENS {
        bigint id PK
        bigint pedido_id FK
        bigint autor_id FK
        text texto
    }
```

---

## 4. O que acontece quando o cliente clica em "Enviar solicitação"

```mermaid
sequenceDiagram
    actor C as Cliente
    participant N as Navegador (novo-pedido.html)
    participant S as Servidor (rotas/pedidos.js)
    participant DB as Banco (PostgreSQL)
    participant ST as Storage

    C->>N: Preenche o formulário e clica em Enviar
    N->>S: POST /api/pedidos (FormData + token)
    S->>S: Confere o token e se é cliente
    S->>DB: INSERT em pedidos
    DB-->>S: pedido criado (id)
    loop para cada arquivo
        S->>ST: upload do arquivo
        S->>DB: INSERT em anexos
    end
    S-->>N: 201 Created + dados do pedido
    N->>C: Abre a página do pedido
```

---

## 5. Rotas da API

| Método | Rota | Quem usa | O que faz |
|---|---|---|---|
| GET | `/api/config` | Todos | URL e chave pública do Supabase (para o botão do Google) |
| POST | `/api/usuarios/google` | Todos | Troca o login do Google pelo token do site e define o papel |
| POST | `/api/usuarios/login` | Contas de teste | Login por e-mail e senha (sem cadastro novo) |
| GET | `/api/usuarios/eu` | Logado | Dados de quem está logado |
| PATCH | `/api/usuarios/eu` | Logado | Atualiza a cidade |
| GET | `/api/convites` | Dono | Convites e fabricantes ativos |
| POST | `/api/convites` | Dono | Convida um e-mail para ser fabricante |
| DELETE | `/api/convites/:id` | Dono | Cancela convite pendente |
| GET | `/api/pedidos` | Logado | Cliente: os pedidos dele. Fabricante: pedidos abertos e os dele |
| POST | `/api/pedidos` | Cliente | Cria pedido com anexos |
| GET | `/api/pedidos/:id` | Logado | Detalhes, anexos e orçamentos |
| PATCH | `/api/pedidos/:id/status` | Fabricante escolhido | Avança para "em produção" e depois "pronto" |
| PATCH | `/api/pedidos/:id/recebido` | Cliente dono | Confirma que recebeu: "pronto" vira "entregue" |
| GET | `/api/app/versao` e `/api/app/pacote.zip` | Qualquer um | Atualização do app Android pelo ar |
| POST | `/api/pedidos/:id/orcamentos` | Fabricante | Envia orçamento |
| POST | `/api/orcamentos/:id/aceitar` | Cliente dono | Aceita um orçamento e recusa os outros |
| GET | `/api/pedidos/:id/mensagens` | Participantes | Lê o chat (`?depois=ID` traz só as novas) |
| POST | `/api/pedidos/:id/mensagens` | Participantes | Envia mensagem no chat |
