# OLX Monitor Brasil 🇧🇷

Monitora anúncios da OLX Brasil e envia notificações via Telegram.

## Funcionalidades

- ✅ Monitora múltiplas URLs do OLX
- ✅ Detecta novos anúncios automaticamente
- ✅ Notifica via Telegram
- ✅ Armazena histórico em SQLite
- ✅ Roda automaticamente via GitHub Actions

## Configuração

### 1. Obter Token do Telegram

1. Crie um bot no [@BotFather](https://t.me/BotFather)
2. Envie `/newbot` e siga as instruções
3. Anote o token recebido

### 2. Obter Chat ID

1. Inicie uma conversa com seu bot
2. Acesse: `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`
3. Encontre o `chat.id` na resposta

### 3. Configurar Secrets no GitHub

1. Vá em `Settings > Secrets and variables > Actions`
2. Adicione:
   - `TELEGRAM_TOKEN`: seu token do bot
   - `TELEGRAM_CHAT_ID`: seu chat ID

### 4. Personalizar URLs

Edite o array `OLX_URLS` no `index.js` com suas buscas do OLX.

## Rodar Localmente

```bash
npm install
TELEGRAM_TOKEN=xxx TELEGRAM_CHAT_ID=xxx node index.js
```

## GitHub Actions

O workflow roda automaticamente a cada 15 minutos.

## Estrutura
