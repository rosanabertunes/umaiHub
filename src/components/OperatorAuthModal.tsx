import React, { useState } from 'react';
import { 
  X, ShieldCheck, ShieldAlert, KeyRound, WifiOff, 
  ServerCrash, CheckCircle2, Lock, LogOut, RefreshCw, AlertCircle
} from 'lucide-react';
import { 
  SystemStatusState, 
  loginOperator, 
  logoutOperator, 
  probeConnection 
} from '../services/authService';

interface OperatorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SystemStatusState;
}

export const OperatorAuthModal: React.FC<OperatorAuthModalProps> = ({
  isOpen,
  onClose,
  status
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginError('Informe e-mail e senha do operador.');
      return;
    }

    setIsSubmitting(true);
    setLoginError(null);
    setLoginSuccess(null);

    const res = await loginOperator(email, password);
    setIsSubmitting(false);

    if (res.success) {
      setLoginSuccess('Operador autenticado com sucesso!');
      setPassword('');
      setTimeout(() => {
        setLoginSuccess(null);
        onClose();
      }, 1200);
    } else {
      setLoginError(res.error || 'Falha na autenticação.');
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    await logoutOperator();
    setIsSubmitting(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    await probeConnection();
    setIsTesting(false);
  };

  const getStatusBadge = () => {
    switch (status.status) {
      case 'connected':
        return {
          icon: <CheckCircle2 className="text-emerald-400" size={18} />,
          badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          title: 'Conectado e Sincronizado'
        };
      case 'pending_sync':
        return {
          icon: <RefreshCw className="text-amber-400 animate-spin" size={18} />,
          badge: 'bg-amber-950/80 text-amber-300 border-amber-800',
          title: 'Alterações Pendentes de Sincronização'
        };
      case 'firestore_accessible':
        return {
          icon: <ShieldCheck className="text-sky-400" size={18} />,
          badge: 'bg-sky-950/80 text-sky-300 border-sky-800',
          title: 'Firestore Acessível'
        };
      case 'operator_unauthorized':
        return {
          icon: <Lock className="text-rose-400" size={18} />,
          badge: 'bg-rose-950/80 text-rose-300 border-rose-800',
          title: 'Operador Não Autorizado'
        };
      case 'auth_failed':
        return {
          icon: <ShieldAlert className="text-rose-400" size={18} />,
          badge: 'bg-rose-950/80 text-rose-300 border-rose-800',
          title: 'Falha de Autenticação'
        };
      case 'offline_network':
        return {
          icon: <WifiOff className="text-zinc-400" size={18} />,
          badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          title: 'Sem Conexão de Rede'
        };
      case 'no_operator_login':
      default:
        return {
          icon: <KeyRound className="text-sky-400" size={18} />,
          badge: 'bg-sky-950/80 text-sky-300 border-sky-800',
          title: 'Operador Sem Login'
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Controle de Acesso & Conexão Cloud</h2>
              <p className="text-xs text-zinc-400">Firebase Firestore & Autenticação de Operadores</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Card de Status Atual */}
          <div className={`p-4 rounded-xl border ${statusBadge.badge}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {statusBadge.icon}
                <span className="text-xs font-bold uppercase tracking-wider">{statusBadge.title}</span>
              </div>
              <span className="text-[10px] opacity-75 font-mono">Última checagem: {status.lastCheckTime}</span>
            </div>
            <p className="text-xs mt-2 text-zinc-200">{status.detailMessage}</p>
            {status.rawErrorCode && (
              <div className="mt-2 text-[11px] font-mono bg-black/40 px-2.5 py-1 rounded border border-white/10 text-zinc-300">
                Código do erro: <span className="text-amber-300 font-bold">{status.rawErrorCode}</span>
              </div>
            )}
          </div>

          {/* Orientação quando o operador não estiver logado ou não estiver autorizado */}
          {status.status === 'operator_unauthorized' && (
            <div className="p-4 bg-rose-950/30 border border-rose-900/60 rounded-xl text-xs space-y-2 text-rose-200">
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertCircle size={16} />
                <span>Operador Não Autorizado nas Regras do Restaurante:</span>
              </div>
              <p>
                O operador está autenticado no Firebase Authentication, mas as regras de segurança do Firestore para o restaurante <strong>umai-sushi</strong> recusaram a operação (permissão insuficiente).
              </p>
              <div className="bg-black/50 p-2.5 rounded-lg text-[11px] font-mono text-zinc-300 space-y-1">
                <p>Verifique se a conta utilizada pertence à equipe de operadores autorizados no projeto <strong>ia-tatto-secret</strong>.</p>
              </div>
            </div>
          )}

          {status.status === 'no_operator_login' && (
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-300">
              <p className="leading-relaxed">
                👉 <strong>Modo Operação Local:</strong> Enquanto nenhum operador fizer login, todas as comandas, itens e fechamentos continuam sendo gravados com segurança na memória local deste computador. Faça login abaixo para sincronizar com a nuvem.
              </p>
            </div>
          )}

          {/* Dados do Operador Logado */}
          {status.currentUserEmail || status.currentUserId ? (
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-400 uppercase font-bold block">Operador Atual</span>
                  <span className="text-sm font-bold text-zinc-100">
                    {status.currentUserEmail || (status.isAnonymous ? 'Sessão Anônima' : 'Operador Conectado')}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 block mt-0.5">UID: {status.currentUserId}</span>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-rose-950 hover:text-rose-400 border border-zinc-700 hover:border-rose-800 rounded-lg text-xs font-bold transition"
                >
                  <LogOut size={14} />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          ) : (
            /* Formulário de Login de Operador */
            <form onSubmit={handleLogin} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <KeyRound size={14} className="text-rose-400" />
                  <span>Entrar com Operador Umai Sushi</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Informe as credenciais do operador para sincronização em nuvem.
                </p>
              </div>

              {loginError && (
                <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-lg text-xs text-rose-200">
                  {loginError}
                </div>
              )}

              {loginSuccess && (
                <div className="p-2.5 bg-emerald-950/80 border border-emerald-800 rounded-lg text-xs text-emerald-200">
                  {loginSuccess}
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">E-mail do Operador</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operador@umaisushi.com"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <span>Acessar como Operador</span>
                )}
              </button>
            </form>
          )}

          {/* Botão de Retestar Conexão */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Banco: <code className="text-zinc-300">ai-studio-0e2830d4...</code></span>
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs font-bold text-zinc-200 transition"
            >
              <RefreshCw size={14} className={isTesting ? 'animate-spin text-rose-400' : ''} />
              <span>Testar Conexão</span>
            </button>
          </div>
        </div>

        {/* Rodapé informativo */}
        <div className="px-5 py-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
          <p className="text-[11px] text-zinc-400">
            * As comandas continuam salvas no dispositivo mesmo se offline.
          </p>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
