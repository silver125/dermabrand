require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-20251.p.rapidapi.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── GET /api/profile?username=xxx ─────────────────────────────────────────────
app.get('/api/profile', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username obrigatório' });

  try {
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/userinfo/?username_or_id=${username}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `RapidAPI erro ${response.status}`, detail: text });
    }

    const data = await response.json();
    const user = data?.data?.user || data?.user || data?.data || data;

    if (!user || (!user.username && !user.full_name)) {
      return res.status(404).json({ error: 'Perfil não encontrado ou privado.' });
    }

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar perfil', detail: err.message });
  }
});

// ── POST /api/analyze ─────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { profile, contentTypes } = req.body;
  if (!profile) return res.status(400).json({ error: 'Dados do perfil obrigatórios' });

  const {
    full_name, username, specialty, city, biography,
    follower_count, likes, comments, frequency,
    captions, observations
  } = profile;

  const prompt = `Você é um especialista em marketing médico premium, com foco em dermatologistas e clínicas de alto padrão no Brasil.

Sua função é analisar um perfil de Instagram médico de forma estratégica, técnica e orientada à conversão de pacientes particulares.

Analise os dados abaixo e gere um relatório completo, objetivo e sofisticado.

DADOS DO PERFIL:
- Nome: ${full_name || 'Não informado'}
- @username: @${username || 'Não informado'}
- Especialidade: ${specialty || 'Não informada'}
- Cidade: ${city || 'Não informada'}
- Bio: ${biography || 'Não informada'}
- Número de seguidores: ${follower_count || 'Não informado'}
- Média de curtidas: ${likes || 'Não informada'}
- Média de comentários: ${comments || 'Não informada'}
- Frequência de posts: ${frequency || 'Não informada'}
- Tipos de conteúdo (ex: reels, antes/depois, educativo, lifestyle): ${contentTypes && contentTypes.length > 0 ? contentTypes.join(', ') : 'Não informado'}
- Exemplos de legendas: ${captions || 'Não informado'}
- Observações gerais: ${observations || 'Nenhuma'}

---

ESTRUTURA DA RESPOSTA:

1. POSICIONAMENTO E AUTORIDADE
Avalie se o perfil transmite autoridade médica, clareza de especialidade e posicionamento premium.
Diga o nível: (Baixo / Médio / Alto)
Explique de forma direta.

---

2. ANÁLISE DA BIO
- Está estratégica ou genérica?
- Tem clareza do público?
- Tem chamada para ação (CTA)?
Sugira uma BIO otimizada pronta para uso.

---

3. ANÁLISE DE CONTEÚDO
Avalie:
- Qualidade percebida
- Clareza da comunicação
- Foco em paciente vs técnico
- Variedade de conteúdo

Identifique:
- O que está faltando
- O que está excessivo
- O que deve ser priorizado

---

4. ENGAJAMENTO E PERFORMANCE
Com base nos dados:
- O engajamento está bom, médio ou baixo?
- O conteúdo gera conexão ou apenas informação?
- Existe potencial de crescimento?

---

5. ERROS E GARGALOS
Liste os principais erros estratégicos que estão impedindo o crescimento ou a conversão.

---

6. PLANO DE MELHORIA (PRÁTICO)
Crie um plano direto com ações como:
- Frequência ideal de postagem
- Tipos de conteúdo recomendados
- Ajustes de linguagem
- Estratégias para atrair pacientes particulares

---

7. IDEIAS DE CONTEÚDO (PRONTO PARA USO)
Sugira 5 ideias de posts no estilo premium, com:
- Gancho
- Tema
- Objetivo (atrair, educar ou converter)

---

REGRAS:
- Linguagem sofisticada, mas clara
- Evitar clichês e generalizações
- Foco em resultado (atração de pacientes e autoridade)
- Pensar como uma agência premium (Dermabrand)`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    if (!text) return res.status(500).json({ error: 'IA não retornou análise', detail: data });

    return res.json({ ok: true, report: text });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar análise', detail: err.message });
  }
});

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dermabrand rodando em http://localhost:${PORT}`));
}

module.exports = app;
