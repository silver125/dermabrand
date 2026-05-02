require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '0e22bdfa13msh0e3e0fcbe1c11fdp128553jsn968d0eb71654';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-20251.p.rapidapi.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── GET /api/profile?username=xxx ─────────────────────────────────────────────
app.get('/api/profile', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username obrigatório' });

  try {
    const response = await fetch(
      `https://instagram120.p.rapidapi.com/api/instagram/profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'instagram120.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
        body: JSON.stringify({ username })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `RapidAPI erro ${response.status}`, detail: text });
    }

    const data = await response.json();
    
    // A API instagram120 devolve os dados dentro de 'result'
    let user = data?.result || data?.data?.user || data?.user || data?.data || data;

    if (!user || (!user.username && !user.full_name)) {
      return res.status(404).json({ error: 'Perfil não encontrado ou privado.' });
    }

    // Normalizar a contagem de seguidores para o frontend (que espera follower_count)
    if (user.edge_followed_by && typeof user.edge_followed_by.count !== 'undefined') {
      user.follower_count = user.edge_followed_by.count;
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

  const prompt = `Você é um especialista em branding premium para saúde, posicionamento digital e comunicação ética para diferentes perfis do ecossistema médico no Brasil.

Sua primeira tarefa é identificar, pelos dados informados, se o perfil representa um profissional de saúde, uma clínica, uma agência de marketing médico, uma consultoria, um serviço B2B para médicos ou outra especialidade/segmento. Nunca assuma dermatologia, médica ou dermatologista por padrão.

Sua análise deve ser técnica, especializada e orientada ao objetivo adequado ao tipo de perfil: atração de pacientes particulares quando for perfil assistencial, fortalecimento institucional quando for clínica, ou geração de autoridade e demanda B2B quando for marketing médico, consultoria ou serviço para profissionais de saúde.

Analise os dados abaixo com rigor profissional e gere um diagnóstico estratégico completo, adaptado à especialidade, ao segmento e ao público-alvo identificados.

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

ESTRUTURA DA RESPOSTA (exatamente 7 seções):

1. NOTAS DO DIAGNÓSTICO
Retorne obrigatoriamente as três notas uma única vez, somente nesta seção, sempre no formato exato abaixo:
Score de Autoridade: X/10
Score de Bio e Posicionamento: X/10
Score de Conteúdo e Engajamento: X/10

Logo após as três notas, explique em 2 a 4 frases a base dos scores. Deixe claro que são estimativas estratégicas de branding digital, baseadas nos dados do perfil e nos sinais informados, não métricas oficiais do Instagram. Justifique objetivamente os principais fatores que elevaram ou reduziram cada nota.

Critérios das notas:
- Score de Autoridade: percepção de expertise, confiança, diferenciação no segmento, prova de competência, consistência de imagem e presença premium.
- Score de Bio e Posicionamento: clareza da área de atuação, público-alvo, promessa de valor, diferenciais reais, credibilidade, localização quando relevante, coerência de linguagem e CTA sóbrio.
- Score de Conteúdo e Engajamento: consistência editorial, qualidade percebida, adequação à comunicação em saúde, conexão com o público correto, frequência, sinais de engajamento e potencial de conversão.

---

2. POSICIONAMENTO E AUTORIDADE
Avalie se o perfil transmite autoridade compatível com seu segmento, clareza de atuação, credibilidade profissional e posicionamento premium. Se for agência, consultoria ou marketing médico, avalie autoridade estratégica, prova de método, clareza de público-alvo e diferenciação B2B; se for profissional assistencial ou clínica, avalie autoridade técnica, confiança, especialidade e percepção de atendimento qualificado.
Diga o nível: (Baixo / Médio / Alto)
Explique de forma direta e concisa.
Não inclua notas numéricas nesta seção; as notas devem aparecer apenas em “1. NOTAS DO DIAGNÓSTICO”.

---

3. ANÁLISE DA BIO (Especializada)
Avalie como especialista em branding para saúde:
- **Tipo de perfil**: identifique se é profissional assistencial, clínica, agência de marketing médico, consultoria, serviço B2B ou outro segmento.
- **Posicionamento**: o perfil deixa claro o diferencial e para quem ele existe?
- **Linguagem**: usa termos adequados ao público correto — pacientes, médicos, clínicas, gestores ou outro decisor — ou é genérica?
- **Credibilidade**: transmite expertise, método, prova de competência e confiança?
- **CTA**: tem chamada clara, sóbria e compatível com o segmento?
- **Oportunidades**: o que está faltando para converter melhor dentro daquele contexto?

Sugira uma BIO otimizada (máx 150 caracteres) com tom técnico, sóbrio e premium, adaptada ao tipo de perfil identificado. Para profissionais e clínicas, pode transmitir especialidade, método, autoridade clínica e clareza de atendimento. Para marketing médico, consultorias e serviços B2B, deve transmitir método, posicionamento estratégico, público atendido e credibilidade de mercado, sem fingir ser profissional de saúde. Não use emojis, símbolos decorativos, promessas de resultado, frases como “transformando pele”, “resultados que falam”, “dermatologia de excelência”, “agende sua avaliação” ou qualquer chamada comercial genérica.

---

4. ANÁLISE DE CONTEÚDO
Avalie:
- Qualidade percebida
- Clareza da comunicação
- Adequação ao público-alvo correto, como paciente, médico, clínica, gestor ou decisor B2B
- Variedade de conteúdo

Identifique:
- O que está faltando
- O que está excessivo
- O que deve ser priorizado

---

5. ENGAJAMENTO E PERFORMANCE
Com base nos dados:
- O engajamento está bom, médio ou baixo?
- O conteúdo gera conexão com o público-alvo correto ou apenas informação genérica?
- Existe potencial de crescimento?
- Taxa de engajamento estimada

---

6. ERROS E GARGALOS
Liste os principais erros estratégicos que estão impedindo o crescimento ou a conversão. Seja específico e acionável.

---

7. PLANO DE MELHORIA (EXECUTIVO)
Apresente um plano conciso e acionável:
- **Ações Imediatas** (próximas 2 semanas): 2-3 mudanças de impacto rápido
- **Conteúdo Estratégico**: Tipos específicos a priorizar
- **Frequência Recomendada**: Postagens por semana
- **Diferencial Competitivo**: Como se destacar
- **Métrica de Sucesso**: Como medir melhoria

Seja direto e evite recomendações genéricas.

---

REGRAS:
- Linguagem sofisticada, técnica, sóbria e compatível com a credibilidade exigida no mercado de saúde.
- Nunca use emojis, ícones decorativos, símbolos chamativos ou linguagem de influenciador.
- Evitar clichês, generalizações, promessas de resultado, frases promocionais e ofertas de serviços.
- Foco em diagnóstico estratégico, não em vendas.
- Pensar como especialista em branding premium para saúde, respeitando a seriedade da comunicação no setor.
- Seja conciso e acionável.
- Use dados para sustentar cada recomendação.
- Não mencione consultas gratuitas, avaliações, agendamentos, descontos, ofertas ou chamadas comerciais agressivas.
- A análise de BIO deve ser profunda, especializada e crítica; explique exatamente por que a bio atual transmite ou não autoridade.
- A sugestão de bio deve ser adequada ao tipo de perfil identificado. Se for marketing médico, agência, consultoria ou serviço B2B, não escreva como se fosse médica, médico, dermatologista ou clínica assistencial. Se for profissional ou clínica, respeite a especialidade informada. Em todos os casos, sem emoji, sem sensacionalismo, sem promessas e sem termos genéricos como “transformando vidas”, “resultados que falam”, “excelência” ou “inovação e cuidado” quando não houver evidência.
- As três notas devem ser realistas, rigorosas e justificáveis; evite notas infladas sem evidência e explique os critérios usados de forma compreensível para o usuário final.
- Não repita notas numéricas fora da seção “1. NOTAS DO DIAGNÓSTICO”. Em “Posicionamento e Autoridade” e nas demais seções, escreva apenas análise qualitativa.
- Nunca use visualização circular, gráfico ou termos técnicos de interface no texto; apenas entregue os scores no formato solicitado`;

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
        temperature: 0.7,
        max_tokens: 2000,
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
