# Radar de vagas

Monólito para acompanhar vagas e avisar quando aparece uma nova. O frontend é React com Mantine (biblioteca feita para React) e o backend é Node, no mesmo processo.

## O que ele faz

- Você cria alertas com habilidades **equivalentes**. Se a vaga pede React, mas você também aceita Angular e Vue.js, as três entram no mesmo alerta. Basta o texto citar uma delas.
- Dá para exigir termos extras (todos precisam aparecer), ignorar palavras como estágio e filtrar lugar. "Remoto" também casa com remote e home office.
- A busca olha título, empresa, lugar e descrição, com fronteira de palavra: React não casa com "reactive" e Java não casa com JavaScript.
- A primeira busca memoriza as vagas que já estão no ar. O e-mail avisa só das que surgirem depois. Dá para mudar isso no alerta.
- As fontes são o portal da Gupy, Himalayas e Jobicy. Cada card abre a vaga original e mostra o nome da fonte.

O aviso é por e-mail (SMTP). WhatsApp depende de uma API de empresa, número verificado e template aprovado; SMTP funciona com uma senha de app do Gmail ou qualquer servidor de e-mail. Sem SMTP, as vagas novas continuam no painel.

## Como rodar

Requer Node 22.13 ou mais novo. O Node avisa que o SQLite embutido ainda é experimental; o app usa essa API de propósito, sem banco externo.

```bash
npm install
cp .env.example .env
npm run dev
```

Abra `http://127.0.0.1:3333`.

Para produção, no mesmo processo:

```bash
npm run build
npm start
```

## E-mail

No `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=voce@gmail.com
SMTP_PASS=senha-de-app
SMTP_FROM=voce@gmail.com
```

O endereço que **recebe** o aviso é definido em Ajustes, dentro do app. Use "Enviar e-mail de teste" para confirmar.

A busca automática mínima é de 1 hora, para não martelar as fontes. Jobicy pede no máximo uma consulta por hora; o cache respeita isso. "Buscar agora" reutiliza o cache enquanto ele estiver válido.

## Testes

```bash
npm test
npm run typecheck
```
