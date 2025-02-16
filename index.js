const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');

const app = express();
const port = 5000;
const walletsDir = './wallets';

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: 'http://192.168.1.122:3000' }));

// Funzione per creare una connessione dinamica a Solana
const createConnection = (network) => {
    if (network === 'mainnet') {
        return new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    } else {
        return new Connection('https://api.devnet.solana.com', 'confirmed');
    }
};

// Percorso per salvare i token separati per rete
const tokensDir = (network = 'devnet') => path.join(__dirname, 'tokens', network);
if (!fs.existsSync(tokensDir('devnet'))) fs.mkdirSync(tokensDir('devnet'), { recursive: true });
if (!fs.existsSync(tokensDir('mainnet'))) fs.mkdirSync(tokensDir('mainnet'), { recursive: true });

// Funzione per salvare un wallet su file
const saveWallet = (wallet) => {
    const walletAddress = wallet.publicKey.toString();
    const filePath = `${walletsDir}/${walletAddress}.json`;
    const keyData = JSON.stringify(Array.from(wallet.secretKey));
    fs.outputFileSync(filePath, keyData);
};

// Funzione per caricare un wallet da file
const loadWallet = (name) => {
    const filePath = `${walletsDir}/${name}.json`;
    if (!fs.existsSync(filePath)) {
        throw new Error('Wallet non trovato.');
    }
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    return Keypair.fromSecretKey(secretKey);
};

// Funzione per controllare il saldo di un wallet
const checkBalance = async (connection, publicKey) => {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
};

// Endpoint per salvare le informazioni del token
app.post('/save-token', (req, res) => {
    const { walletAddress, tokenMintAddress, tokenAccount, network } = req.body;
    const filePath = path.join(tokensDir(network), `${tokenMintAddress}.json`);

    const tokenData = {
        walletAddress,
        tokenMintAddress,
        tokenAccount,
        createdAt: new Date().toISOString()
    };

    fs.writeFile(filePath, JSON.stringify(tokenData, null, 2), (err) => {
        if (err) {
            console.error('Errore durante il salvataggio del token:', err);
            res.status(500).json({ error: 'Errore durante il salvataggio del token' });
        } else {
            res.json({ success: true });
        }
    });
});

// Endpoint per ottenere la lista dei token creati
app.get('/tokens', (req, res) => {
    const network = req.query.network || 'devnet';
    fs.readdir(tokensDir(network), (err, files) => {
        if (err) {
            console.error('Errore durante il recupero dei token:', err);
            res.status(500).json({ error: 'Errore durante il recupero dei token' });
        } else {
            const tokens = files.map(file => require(path.join(tokensDir(network), file)));
            res.json(tokens);
        }
    });
});

// Endpoint per ottenere la lista aggiornata dei wallet salvati
app.get('/wallets', (req, res) => {
    try {
        const files = fs.readdirSync(walletsDir);
        const walletNames = files.map(file => file.replace('.json', ''));
        res.json(walletNames);
    } catch (err) {
        res.status(500).json({ error: 'Errore durante la lettura dei wallet' });
    }
});

// Endpoint per aggiornare il saldo del wallet selezionato
app.get('/update-balance/:walletName', async (req, res) => {
    const network = req.query.network || 'devnet';
    const connection = createConnection(network);
    try {
        const wallet = loadWallet(req.params.walletName);
        const balance = await checkBalance(connection, wallet.publicKey);
        res.json({ balance });
    } catch (err) {
        res.status(500).json({ error: 'Errore durante l\'aggiornamento del saldo' });
    }
});

// Endpoint per richiedere un Airdrop di 2 SOL (Solo Devnet)
app.post('/request-airdrop', async (req, res) => {
    const { walletName, network } = req.body;
    if (network === 'mainnet') {
        return res.status(403).json({ error: 'Airdrop non disponibile su Mainnet.' });
    }

    const connection = createConnection(network);
    try {
        const wallet = loadWallet(walletName);
        const airdropSignature = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropSignature);
        res.json({ success: true });
    } catch (err) {
        console.error('Errore durante l\'airdrop:', err);
        res.status(500).json({ error: 'Errore durante l\'airdrop' });
    }
});

// Endpoint per creare un SPL Token
app.post('/create-token', async (req, res) => {
    try {
        const { selectedWallet, network } = req.body;
        const connection = createConnection(network);
        let wallet;

        if (selectedWallet) {
            wallet = loadWallet(selectedWallet);
            const balance = await checkBalance(connection, wallet.publicKey);

            if (network === 'mainnet' && balance < 2) {
                return res.status(400).json({ error: 'Saldo insufficiente. Almeno 2 SOL necessari.' });
            }
        } else {
            wallet = Keypair.generate();
            saveWallet(wallet);

            if (network === 'devnet') {
                await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
                console.log('Airdrop richiesto. Attendi la conferma...');
            }
        }

        const mint = await createMint(connection, wallet, wallet.publicKey, null, 9);
        const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, wallet, mint, wallet.publicKey);
        await mintTo(connection, wallet, mint, tokenAccount.address, wallet.publicKey, 1000 * (10 ** 9));

        res.json({
            walletAddress: wallet.publicKey.toString(),
            tokenMintAddress: mint.toString(),
            tokenAccount: tokenAccount.address.toString()
        });
    } catch (err) {
        console.error('Errore durante la creazione del token:', err);
        res.status(500).json({ error: 'Errore durante la creazione del token' });
    }
});

// Avviare il server
app.listen(port, () => {
    console.log(`Server in ascolto su http://192.168.1.122:${port}`);
});

