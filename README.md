# Dermabrand 🩺

Plataforma de análise estratégica de perfis médicos no Instagram.

## Stack

- **Backend**: Node.js + Express
- **Scraper**: RapidAPI (instagram-scraper-20251)
- **IA**: Anthropic Claude (análise estratégica)
- **Deploy**: Vercel (recomendado) ou qualquer Node.js host

---

## Configuração local

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e preencha:

```env
RAPIDAPI_KEY=sua_chave_rapidapi
RAPIDAPI_HOST=instagram-scraper-20251.p.rapidapi.com
ANTHROPIC_API_KEY=sua_chave_anthropic
PORT=3000
```

### 3. Rode localmente

```bash
npm start
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## Deploy na Vercel

### Opção A — Via CLI

```bash
npm install -g vercel
vercel
```

Durante o setup, configure as variáveis de ambiente quando solicitado.

### Opção B — Via GitHub

1. Suba o projeto para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Em **Settings → Environment Variables**, adicione:
   - `RAPIDAPI_KEY`
   - `RAPIDAPI_HOST`
   - `ANTHROPIC_API_KEY`
4. Clique em **Deploy**

---

## Estrutura do projeto

```
dermabrand/
├── server.js          # Backend Express (API routes)
├── package.json
├── vercel.json        # Config de deploy Vercel
├── .env.example       # Variáveis de ambiente
└── public/
    └── index.html     # Frontend completo
```

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/profile?username=xxx` | Busca dados do perfil via RapidAPI |
| POST | `/api/analyze` | Gera análise estratégica via Claude |

---

## Chave Anthropic

Obtenha sua chave em: [console.anthropic.com](https://console.anthropic.com)
