const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Configurações
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DATA_PATH = path.join(__dirname, 'data', 'ads.json');
const LOG_PATH = path.join(__dirname, 'data', 'scraper.log');

// URLs do OLX Brasil para monitorar
const OLX_URLS = [
    'https://www.olx.com.br/brasil?q=iphone+14',
    'https://sp.olx.com.br/sao-paulo-e-regiao/celulares/iphone?cond=1&cond=2&pe=3000&ps=1500'
];

// Inicializa bot do Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Carrega anúncios já vistos
function carregarAnuncios() {
    try {
        if (fs.existsSync(DATA_PATH)) {
            const data = fs.readFileSync(DATA_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        log('Erro ao carregar anúncios: ' + err.message);
    }
    return [];
}

// Salva anúncios
function salvarAnuncios(anuncios) {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(anuncios, null, 2), 'utf8');
        log(`Salvo ${anuncios.length} anúncios no histórico.`);
    } catch (err) {
        log('Erro ao salvar anúncios: ' + err.message);
    }
}

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    
    // Garante que o diretório existe
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.appendFileSync(LOG_PATH, logMessage + '\n');
}

async function buscarAnuncios(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const anuncios = [];

        // Tenta múltiplos seletores (OLX muda frequentemente)
        $('li[class*="sc-"], li[class*="ad-"], .ad-item').each((i, element) => {
            const id = $(element).attr('data-lurker_listing_id') || 
                       $(element).attr('id') || 
                       `ad_${Date.now()}_${i}`;
            
            const title = $(element).find('h2, [class*="title"], .ad-title').first().text().trim();
            const price = $(element).find('[class*="price"], .ad-price').first().text().trim();
            const location = $(element).find('[class*="location"], .ad-location').first().text().trim();
            const urlAnuncio = $(element).find('a').first().attr('href');
            const image = $(element).find('img').first().attr('src') || '';

            if (title && urlAnuncio) {
                anuncios.push({
                    id,
                    title,
                    price: price || 'Preço não informado',
                    location: location || 'Localização não informada',
                    url: urlAnuncio.startsWith('http') ? urlAnuncio : `https://www.olx.com.br${urlAnuncio}`,
                    image
                });
            }
        });

        log(`Encontrados ${anuncios.length} anúncios em ${url}`);
        return anuncios;

    } catch (error) {
        log(`Erro ao buscar anúncios em ${url}: ${error.message}`);
        return [];
    }
}

async function verificarNovosAnuncios(anuncios) {
    const anunciosVistos = carregarAnuncios();
    const idsVistos = new Set(anunciosVistos.map(a => a.id));
    const novosAnuncios = [];

    for (const anuncio of anuncios) {
        if (!idsVistos.has(anuncio.id)) {
            novosAnuncios.push(anuncio);
            anunciosVistos.push(anuncio);
            await enviarNotificacao(anuncio);
        }
    }

    // Mantém apenas últimos 500 anúncios para não crescer muito
    if (anunciosVistos.length > 500) {
        anunciosVistos.splice(0, anunciosVistos.length - 500);
    }

    salvarAnuncios(anunciosVistos);
    log(`${novosAnuncios.length} novos anúncios encontrados.`);
}

async function enviarNotificacao(anuncio) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        log('Telegram não configurado, pulando notificação.');
        return;
    }

    const mensagem = `
🔔 **Novo Anúncio OLX!**

📱 **${anuncio.title}**
💰 ${anuncio.price}
📍 ${anuncio.location}

🔗 ${anuncio.url}
    `.trim();

    try {
        await bot.sendMessage(TELEGRAM_CHAT_ID, mensagem, { parse_mode: 'Markdown' });
        log(`Notificação enviada para ${anuncio.title}`);
    } catch (error) {
        log(`Erro ao enviar notificação: ${error.message}`);
    }
}

async function monitorarAnuncios() {
    log('=== Iniciando monitoramento OLX Brasil ===');
    
    for (const url of OLX_URLS) {
        log(`Monitorando: ${url}`);
        const anuncios = await buscarAnuncios(url);
        await verificarNovosAnuncios(anuncios);
    }
    
    log('=== Monitoramento concluído ===');
}

// Inicia o monitoramento
monitorarAnuncios();
