const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Configurações
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DB_PATH = path.join(__dirname, 'data', 'ads.db');
const LOG_PATH = path.join(__dirname, 'data', 'scraper.log');

// URLs do OLX Brasil para monitorar
const OLX_URLS = [
    'https://www.olx.com.br/brasil?q=iphone+14',
    'https://sp.olx.com.br/sao-paulo-e-regiao/celulares/iphone?cond=1&cond=2&pe=3000&ps=1500',
    'https://rj.olx.com.br/rio-de-janeiro-e-regiao/imoveis/venda?pe=500000&ps=200000'
];

// Inicializa bot do Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Inicializa banco SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        log('Erro ao abrir banco de dados: ' + err.message);
    } else {
        log('Conectado ao banco de dados SQLite.');
        criarTabela();
    }
});

function criarTabela() {
    db.run(`CREATE TABLE IF NOT EXISTS ads (
        id TEXT PRIMARY KEY,
        title TEXT,
        price TEXT,
        location TEXT,
        url TEXT,
        image TEXT,
        created_at TEXT
    )`, (err) => {
        if (err) {
            log('Erro ao criar tabela: ' + err.message);
        } else {
            log('Tabela criada com sucesso.');
            monitorarAnuncios();
        }
    });
}

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_PATH, logMessage + '\n');
}

async function buscarAnuncios(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            }
        });

        const $ = cheerio.load(response.data);
        const anuncios = [];

        // Seletores podem mudar - ajustar conforme necessário
        $('li[class*="sc-"]').each((i, element) => {
            const id = $(element).attr('data-lurker_listing_id') || `ad_${Date.now()}_${i}`;
            const title = $(element).find('h2, [class*="title"]').first().text().trim();
            const price = $(element).find('[class*="price"]').first().text().trim();
            const location = $(element).find('[class*="location"]').first().text().trim();
            const url = $(element).find('a').first().attr('href');
            const image = $(element).find('img').first().attr('src') || '';

            if (title && url) {
                anuncios.push({
                    id,
                    title,
                    price: price || 'Preço não informado',
                    location: location || 'Localização não informada',
                    url: url.startsWith('http') ? url : `https://www.olx.com.br${url}`,
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
    for (const anuncio of anuncios) {
        const existe = await new Promise((resolve) => {
            db.get('SELECT id FROM ads WHERE id = ?', [anuncio.id], (err, row) => {
                resolve(!!row);
            });
        });

        if (!existe) {
            await salvarAnuncio(anuncio);
            await enviarNotificacao(anuncio);
        }
    }
}

async function salvarAnuncio(anuncio) {
    const sql = `INSERT INTO ads (id, title, price, location, url, image, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        anuncio.id,
        anuncio.title,
        anuncio.price,
        anuncio.location,
        anuncio.url,
        anuncio.image,
        new Date().toISOString()
    ], (err) => {
        if (err) {
            log(`Erro ao salvar anúncio ${anuncio.id}: ${err.message}`);
        } else {
            log(`Novo anúncio salvo: ${anuncio.title}`);
        }
    });
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
    db.close();
}

// Inicia o monitoramento
monitorarAnuncios();
