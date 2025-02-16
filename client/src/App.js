import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';

const App = () => {
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState('');
  const [balance, setBalance] = useState(0);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [network, setNetwork] = useState('devnet');  // Stato per la rete

  // Funzione per ottenere la lista aggiornata dei wallet salvati
  const fetchWallets = async () => {
    try {
      const response = await axios.get('http://192.168.1.122:5000/wallets');
      setWallets(response.data);
    } catch (error) {
      console.error('Errore durante il recupero dei wallet:', error);
    }
  };

  // Funzione per ottenere il saldo del wallet selezionato
  const fetchBalance = async (walletName) => {
    try {
      const response = await axios.get(`http://192.168.1.122:5000/update-balance/${walletName}?network=${network}`);
      setBalance(response.data.balance);
    } catch (error) {
      console.error('Errore durante il controllo del saldo:', error);
    }
  };

  // Funzione per richiedere un Airdrop
  const requestAirdrop = async () => {
    setAirdropLoading(true);
    setError('');
    try {
      await axios.post('http://192.168.1.122:5000/request-airdrop', {
        walletName: selectedWallet,
        network
      });
      await fetchBalance(selectedWallet);
    } catch (error) {
      console.error('Errore durante l\'airdrop:', error);
      if (error.response?.status === 429) {
        window.open('https://solfaucet.com/', '_blank');
      } else {
        setError(error.response?.data?.error || 'Errore durante l\'airdrop');
      }
    } finally {
      setAirdropLoading(false);
    }
  };

  // Funzione per salvare le informazioni del token
  const saveToken = async (data) => {
    try {
      await axios.post('http://192.168.1.122:5000/save-token', data);
    } catch (error) {
      console.error('Errore durante il salvataggio del token:', error);
    }
  };

  // Funzione per creare un token SPL
  const createToken = async () => {
    setLoading(true);
    setError('');
    setTokenInfo(null);

    try {
      const response = await axios.post('http://192.168.1.122:5000/create-token', {
        selectedWallet,
        network
      });

      setTokenInfo(response.data);
      await saveToken(response.data);  // Salva le informazioni del token
      await fetchTokens();  // Aggiorna la lista dei token creati
      await fetchWallets(); // Aggiorna la lista dei wallet

    } catch (error) {
      console.error('Errore durante la creazione del token:', error);
      setError(error.response?.data?.error || 'Errore durante la creazione del token');
    } finally {
      setLoading(false);
    }
  };

  // Funzione per ottenere la lista dei token creati
  const fetchTokens = async () => {
    try {
      const response = await axios.get(`http://192.168.1.122:5000/tokens?network=${network}`);
      setTokens(response.data);
    } catch (error) {
      console.error('Errore durante il recupero dei token:', error);
    }
  };

  // Recupera i wallet e i token all'avvio
  useEffect(() => {
    fetchWallets();
    fetchTokens();
  }, [network]); // Aggiorna quando cambia la rete

  // Controlla il saldo quando cambia il wallet selezionato
  useEffect(() => {
    if (selectedWallet) {
      fetchBalance(selectedWallet);
    } else {
      setBalance(0);
    }
  }, [selectedWallet, network]);

  return (
      <div className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-4xl mx-auto grid gap-6 grid-cols-1 lg:grid-cols-2">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Impostazioni Rete</h2>
            <select
                className="w-full mb-4 p-2 border rounded-lg"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
            >
              <option value="devnet">Devnet</option>
              <option value="mainnet">Mainnet</option>
            </select>

            <h2 className="text-xl font-bold mb-4">Wallets</h2>
            <select
                className="w-full mb-4 p-2 border rounded-lg"
                value={selectedWallet}
                onChange={(e) => setSelectedWallet(e.target.value)}
            >
              <option value="">Seleziona Wallet</option>
              {wallets.map((wallet, index) => (
                  <option key={index} value={wallet}>{wallet}</option>
              ))}
            </select>

            <div className="text-gray-600 mb-4">Saldo: {balance} SOL</div>
            <button
                onClick={() => fetchBalance(selectedWallet)}
                className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600"
            >
              <RefreshCw className="inline-block mr-2" /> Aggiorna Saldo
            </button>

            {network === 'devnet' && (
                <button
                    onClick={requestAirdrop}
                    disabled={airdropLoading || !selectedWallet}
                    className="w-full mt-4 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
                >
                  {airdropLoading ? 'Richiesta Airdrop...' : 'Richiedi Airdrop'}
                </button>
            )}

            <button
                onClick={createToken}
                disabled={loading || (network === 'mainnet' && balance < 2)}
                className="w-full mt-4 bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600"
            >
              {loading ? 'Creazione in corso...' : 'Crea Token'}
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Tokens Creati</h2>
            <ul>
              {tokens.map((token, index) => (
                  <li key={index} className="mb-2">
                    <strong>Mint:</strong> {token.tokenMintAddress}
                    <button
                        onClick={() => window.open(`https://solscan.io/token/${token.tokenMintAddress}?cluster=${network}`, '_blank')}
                        className="ml-2 text-blue-500 underline"
                    >
                      Verifica su Solscan
                    </button>
                  </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
  );
};

export default App;
