import { auth, db } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';

export type ConnectionAuthStatus = 
  | 'no_operator_login'        // Operador sem login
  | 'auth_failed'              // Falha de autenticação
  | 'operator_unauthorized'    // Operador autenticado sem autorização para o restaurante
  | 'firestore_accessible'     // Firestore acessível
  | 'pending_sync'             // Alterações ainda pendentes de sincronização
  | 'connected'                // Conectado e sincronizado
  | 'offline_network';         // Sem conexão de rede

export interface SystemStatusState {
  status: ConnectionAuthStatus;
  shortMessage: string;
  detailMessage: string;
  rawErrorCode: string | null;
  currentUserEmail: string | null;
  currentUserId: string | null;
  isAnonymous: boolean;
  hasPendingSync: boolean;
  lastCheckTime: string;
}

type StatusListener = (state: SystemStatusState) => void;

let currentState: SystemStatusState = {
  status: 'no_operator_login',
  shortMessage: 'Operador sem login',
  detailMessage: 'Faça login com a conta de operador para sincronizar comandas e pedidos com o restaurante.',
  rawErrorCode: null,
  currentUserEmail: null,
  currentUserId: null,
  isAnonymous: false,
  hasPendingSync: false,
  lastCheckTime: new Date().toLocaleTimeString('pt-BR')
};

const listeners = new Set<StatusListener>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn({ ...currentState });
    } catch (err) {
      console.error('[STATUS LISTENER ERROR]', err);
    }
  });
}

export function subscribeSystemStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener({ ...currentState });
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentSystemStatus(): SystemStatusState {
  return { ...currentState };
}

export function updateStatus(partial: Partial<SystemStatusState>) {
  currentState = {
    ...currentState,
    ...partial,
    lastCheckTime: new Date().toLocaleTimeString('pt-BR')
  };
  notifyListeners();
}

/**
 * Atualiza o indicador de pendência de sincronização local
 */
export function setPendingSyncFlag(hasPending: boolean) {
  if (currentState.hasPendingSync === hasPending) return;

  if (hasPending && (currentState.status === 'connected' || currentState.status === 'firestore_accessible')) {
    updateStatus({
      hasPendingSync: true,
      status: 'pending_sync',
      shortMessage: 'Alterações pendentes',
      detailMessage: 'Há pedidos salvos neste computador aguardando sincronização com a nuvem.'
    });
  } else if (!hasPending && currentState.status === 'pending_sync') {
    updateStatus({
      hasPendingSync: false,
      status: 'connected',
      shortMessage: 'Conectado e sincronizado',
      detailMessage: 'Todas as comandas locais estão sincronizadas com o Cloud Firestore.'
    });
  } else {
    updateStatus({ hasPendingSync: hasPending });
  }
}

let isProbing = false;

/**
 * Testa o acesso efetivo ao Firestore e valida a autorização real do operador no restaurante.
 * Não utiliza autenticação anônima como atalho e não mascara erros.
 */
export async function probeConnection(): Promise<SystemStatusState> {
  if (isProbing) return currentState;
  isProbing = true;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateStatus({
      status: 'offline_network',
      shortMessage: 'Sem conexão de rede',
      detailMessage: 'O dispositivo não possui acesso à internet ou o navegador está offline.',
      rawErrorCode: 'NETWORK_OFFLINE'
    });
    isProbing = false;
    return currentState;
  }

  const currentUser = auth.currentUser;

  if (!currentUser) {
    updateStatus({
      status: 'no_operator_login',
      shortMessage: 'Operador sem login',
      detailMessage: 'Nenhum operador logado. Acesse com seu e-mail de operador para habilitar a sincronização.',
      rawErrorCode: null,
      currentUserEmail: null,
      currentUserId: null,
      isAnonymous: false
    });
    isProbing = false;
    return currentState;
  }

  try {
    // Prova de leitura direta do servidor para o restaurante específico
    await getDocFromServer(doc(db, 'restaurants', 'umai-sushi'));

    if (currentState.hasPendingSync) {
      updateStatus({
        status: 'pending_sync',
        shortMessage: 'Alterações pendentes',
        detailMessage: 'Operador autorizado, mas há pedidos aguardando confirmação de sincronização.',
        rawErrorCode: null,
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.uid,
        isAnonymous: currentUser.isAnonymous
      });
    } else {
      updateStatus({
        status: 'connected',
        shortMessage: 'Conectado e sincronizado',
        detailMessage: `Operador autorizado (${currentUser.email}) e banco de dados sincronizado.`,
        rawErrorCode: null,
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.uid,
        isAnonymous: currentUser.isAnonymous
      });
    }
  } catch (err: any) {
    const errorMsg = String(err?.message || '');
    const errorCode = String(err?.code || '');

    console.warn(`[DIAGNOSTICO FIREBASE] Codigo: "${errorCode}" | Msg: "${errorMsg}"`);

    if (
      errorCode === 'permission-denied' || 
      errorMsg.includes('permission-denied') || 
      errorMsg.includes('Missing or insufficient permissions')
    ) {
      updateStatus({
        status: 'operator_unauthorized',
        shortMessage: 'Operador sem autorização',
        detailMessage: `O operador ${currentUser.email} está autenticado, mas as regras de segurança rejeitaram o acesso ao restaurante "umai-sushi".`,
        rawErrorCode: errorCode || 'permission-denied',
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.uid,
        isAnonymous: currentUser.isAnonymous
      });
    } else if (
      errorCode === 'unavailable' || 
      errorMsg.includes('the client is offline') || 
      errorMsg.includes('Could not reach Cloud Firestore backend')
    ) {
      updateStatus({
        status: 'offline_network',
        shortMessage: 'Sem conexão de rede',
        detailMessage: 'Falha ao contatar os servidores do Cloud Firestore. Verifique a internet.',
        rawErrorCode: errorCode || 'unavailable'
      });
    } else {
      updateStatus({
        status: 'firestore_accessible',
        shortMessage: 'Firestore acessível',
        detailMessage: `Operador conectado (${currentUser.email}). Status: ${errorMsg}`,
        rawErrorCode: errorCode || null,
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.uid
      });
    }
  } finally {
    isProbing = false;
  }

  return currentState;
}

/**
 * Inicializa os ouvintes de autenticação e rede.
 * Não faz login anônimo automático.
 */
export function initAuthListener() {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    console.log('[REDE] Conexão reestabelecida. Revalidando acesso...');
    probeConnection();
  });

  window.addEventListener('offline', () => {
    console.log('[REDE] Conexão perdida.');
    updateStatus({
      status: 'offline_network',
      shortMessage: 'Sem conexão de rede',
      detailMessage: 'O navegador detectou perda de sinal de internet.',
      rawErrorCode: 'NAVIGATOR_OFFLINE'
    });
  });

  onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      console.log(`[AUTH] Operador autenticado: ${user.email || 'UID ' + user.uid}`);
      updateStatus({
        currentUserEmail: user.email,
        currentUserId: user.uid,
        isAnonymous: user.isAnonymous
      });
      await probeConnection();
    } else {
      console.log('[AUTH] Nenhum operador conectado.');
      updateStatus({
        status: 'no_operator_login',
        shortMessage: 'Operador sem login',
        detailMessage: 'Nenhum operador logado. Acesse com seu e-mail para sincronizar dados em nuvem.',
        rawErrorCode: null,
        currentUserEmail: null,
        currentUserId: null,
        isAnonymous: false
      });
    }
  });
}

/**
 * Login com e-mail e senha de operador autorizado
 */
export async function loginOperator(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    console.log(`[AUTH] Operador autenticado com sucesso: ${cred.user.email}`);
    await probeConnection();
    return { success: true };
  } catch (err: any) {
    const code = err?.code || '';
    const msg = err?.message || String(err);
    console.error(`[AUTH LOGIN ERRO] Codigo: "${code}" | Detalhe: ${msg}`);

    let userFriendly = 'Falha ao autenticar operador.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      userFriendly = 'E-mail ou senha de operador incorretos.';
    } else if (code === 'auth/network-request-failed') {
      userFriendly = 'Sem conexão de rede para validar as credenciais.';
    } else if (code === 'auth/admin-restricted-operation') {
      userFriendly = 'Operação restrita pelo administrador do Firebase Authentication.';
    }

    updateStatus({
      status: 'auth_failed',
      shortMessage: 'Falha de autenticação',
      detailMessage: `${userFriendly} (${code || 'erro'})`,
      rawErrorCode: code
    });

    return { success: false, error: `${userFriendly} (${code || 'erro'})` };
  }
}

/**
 * Logout do operador atual
 */
export async function logoutOperator(): Promise<void> {
  try {
    await firebaseSignOut(auth);
    console.log('[AUTH] Operador desconectado.');
    updateStatus({
      status: 'no_operator_login',
      shortMessage: 'Operador sem login',
      detailMessage: 'Operador desconectado. Faça login novamente para sincronizar dados com o restaurante.',
      rawErrorCode: null,
      currentUserEmail: null,
      currentUserId: null,
      isAnonymous: false
    });
  } catch (err: any) {
    console.error('[AUTH LOGOUT ERRO]', err);
  }
}
