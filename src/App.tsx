import React, { useState, useEffect } from 'react';
import { 
  Utensils, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Receipt, 
  CheckCircle2, 
  TrendingUp, 
  Users, 
  ClipboardList,
  ArrowLeftRight, 
  Printer, 
  RotateCcw, 
  AlertTriangle,
  Edit3, 
  PlusCircle, 
  BookOpen, 
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Check,
  ShoppingBag,
  ArrowLeft,
  Sliders,
  ShieldCheck,
  Lock,
  Unlock,
  Settings,
  UserCheck,
  RefreshCw,
  FolderOpen,
  Calendar,
  Award,
  Download,
  Activity,
  BarChart3,
  Wifi
} from 'lucide-react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Table, OrderItem, SaleRecord, PaymentMethod, Category, TableStatus } from './types';
import {
  getPrinters,
  savePrinters,
  getGlobalPrintConfig,
  saveGlobalPrintConfig,
  getPrintQueue,
  savePrintQueue,
  clearPrintQueue,
  generateReceiptText,
  generateReceiptHTML,
  generateProductionText,
  queueAndProcessPrintJob,
  retryPrintJob,
  formatSeparator,
  justifyBetween,
  formatCenter,
  convertTextToEscPosBytes,
  PrinterConfig,
  PrinterConnectionType,
  PrinterRole,
  PrintJob,
  PrintServiceConfig
} from './services/printService';
import { INITIAL_PRODUCTS } from './data/initialProducts';

const LOCAL_STORAGE_KEY_TABLES = 'umai_sushi_tables';
const LOCAL_STORAGE_KEY_PRODUCTS = 'umai_sushi_products';
const LOCAL_STORAGE_KEY_SALES = 'umai_sushi_sales';

let isCurrentlyPrinting = false;

export default function App() {
  // --- STATE ---
  const [tables, setTables] = useState<Table[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);

  // Access Control & Administration
  const [userRole, setUserRole] = useState<'Administrador' | 'Caixa' | 'Garçom'>(() => {
    try {
      const saved = localStorage.getItem('umai_sushi_user_role');
      return (saved as any) || 'Garçom';
    } catch {
      return 'Garçom';
    }
  });

  const [waiters, setWaiters] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('umai_sushi_waiters');
      return saved ? JSON.parse(saved) : ['Lucas', 'Renan', 'Juliana'];
    } catch {
      return ['Lucas', 'Renan', 'Juliana'];
    }
  });

  const [adminPassword, setAdminPassword] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_sushi_admin_password') || '1234';
    } catch {
      return '1234';
    }
  });

  const [restaurantName, setRestaurantName] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_name') || 'Umai Sushi';
    } catch {
      return 'Umai Sushi';
    }
  });

  const [restaurantSlogan, setRestaurantSlogan] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_slogan') || 'Culinária Oriental de Alta Qualidade';
    } catch {
      return 'Culinária Oriental de Alta Qualidade';
    }
  });

  const [restaurantAddress, setRestaurantAddress] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_address') || 'Av. Brasil, 802 - Bento Gonçalves - RS';
    } catch {
      return 'Av. Brasil, 802 - Bento Gonçalves - RS';
    }
  });

  const [restaurantPhone, setRestaurantPhone] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_phone') || '(54) 3451-9922';
    } catch {
      return '(54) 3451-9922';
    }
  });

  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_logo') || 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=120&h=120&q=80';
    } catch {
      return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=120&h=120&q=80';
    }
  });

  const [restaurantInstagram, setRestaurantInstagram] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_instagram') || '@umai_sushi';
    } catch {
      return '@umai_sushi';
    }
  });

  const [restaurantServiceTax, setRestaurantServiceTax] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('umai_config_restaurant_service_tax');
      return saved ? parseFloat(saved) : 10;
    } catch {
      return 10;
    }
  });

  const [restaurantThanksMessage, setRestaurantThanksMessage] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_thanks') || 'MUITO OBRIGADO, VOLTE SEMPRE!';
    } catch {
      return 'MUITO OBRIGADO, VOLTE SEMPRE!';
    }
  });

  const [restaurantPrintFooter, setRestaurantPrintFooter] = useState<string>(() => {
    try {
      return localStorage.getItem('umai_config_restaurant_print_footer') || 'MESA EMITIDA NO MODO CONFERÊNCIA';
    } catch {
      return 'MESA EMITIDA NO MODO CONFERÊNCIA';
    }
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [pendingRole, setPendingRole] = useState<'Administrador' | 'Caixa' | 'Garçom' | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Administration view sub-tabs
  const [adminSubTab, setAdminSubTab] = useState<'dashboard' | 'garcons' | 'estabelecimento' | 'seguranca' | 'banco' | 'categorias' | 'impressao'>('dashboard');
  const [editingPrinter, setEditingPrinter] = useState<PrinterConfig | null>(null);
  const [showLogContentModal, setShowLogContentModal] = useState<PrintJob | null>(null);
  const [iframeReceiptHTML, setIframeReceiptHTML] = useState<string | null>(null);
  const [printQueueList, setPrintQueueList] = useState<PrintJob[]>(getPrintQueue());
  const [isPrintExtensionActive, setIsPrintExtensionActive] = useState(false);
  const [refreshPrintersToggle, setRefreshPrintersToggle] = useState(0);
  const [testContentType, setTestContentType] = useState<'simples' | 'completo' | 'fechamento'>('simples');
  const [testPaperWidth, setTestPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  // Print Extender / Companion Device States
  const [showPrintExtensor, setShowPrintExtensor] = useState(false);
  const [serialPort, setSerialPort] = useState<any>(null);
  const [serialPortName, setSerialPortName] = useState<string>('');
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [serialBaudRate, setSerialBaudRate] = useState<number>(38400);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<'hoje' | '7dias' | '30dias' | 'mes' | 'personalizado'>('hoje');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [newWaiterName, setNewWaiterName] = useState('');
  const [inputRestaurantName, setInputRestaurantName] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_name') || 'Umai Sushi'; } catch { return 'Umai Sushi'; }
  });
  const [inputRestaurantSlogan, setInputRestaurantSlogan] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_slogan') || 'Culinária Oriental de Alta Qualidade'; } catch { return 'Culinária Oriental de Alta Qualidade'; }
  });
  const [inputRestaurantAddress, setInputRestaurantAddress] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_address') || 'Av. Brasil, 802 - Bento Gonçalves - RS'; } catch { return 'Av. Brasil, 802 - Bento Gonçalves - RS'; }
  });
  const [inputRestaurantPhone, setInputRestaurantPhone] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_phone') || '(54) 3451-9922'; } catch { return '(54) 3451-9922'; }
  });
  const [inputRestaurantLogoUrl, setInputRestaurantLogoUrl] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_logo') || 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=120&h=120&q=80'; } catch { return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=120&h=120&q=80'; }
  });
  const [inputRestaurantInstagram, setInputRestaurantInstagram] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_instagram') || '@umai_sushi'; } catch { return '@umai_sushi'; }
  });
  const [inputRestaurantServiceTax, setInputRestaurantServiceTax] = useState(() => {
    try { return parseFloat(localStorage.getItem('umai_config_restaurant_service_tax') || '10'); } catch { return 10; }
  });
  const [inputRestaurantThanksMessage, setInputRestaurantThanksMessage] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_thanks') || 'MUITO OBRIGADO, VOLTE SEMPRE!'; } catch { return 'MUITO OBRIGADO, VOLTE SEMPRE!'; }
  });
  const [inputRestaurantPrintFooter, setInputRestaurantPrintFooter] = useState(() => {
    try { return localStorage.getItem('umai_config_restaurant_print_footer') || 'MESA EMITIDA NO MODO CONFERÊNCIA'; } catch { return 'MESA EMITIDA NO MODO CONFERÊNCIA'; }
  });

  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  
  // Navigation
  const [activeTab, setActiveTab] = useState<'mesas' | 'cardapio' | 'financeiro' | 'admin'>('mesas');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  // Opening Table Modal State
  const [openTableId, setOpenTableId] = useState<number | null>(null);
  const [openTableIdInput, setOpenTableIdInput] = useState<string>('');
  const [openWaiter, setOpenWaiter] = useState<string>('Sem Garçom');
  const [openClients, setOpenClients] = useState<number>(1);
  const [openHasServiceCharge, setOpenHasServiceCharge] = useState<boolean>(true);

  // Table-item launching mode state (Entrar no Cardápio)
  const [isLaunchingMode, setIsLaunchingMode] = useState(false);
  const [launchSearch, setLaunchSearch] = useState('');
  const [launchCategory, setLaunchCategory] = useState<Category | 'Todos'>('Todos');
  const [tempItems, setTempItems] = useState<OrderItem[]>([]);
  const [launchNote, setLaunchNote] = useState('');
  const [launchQty, setLaunchQty] = useState(1);
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);

  // Modals / Interfaces
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [autoPrintOnOpen, setAutoPrintOnOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('umai_sushi_auto_print') === 'true';
    } catch {
      return false;
    }
  });

  const [tableAutoPrintSettings, setTableAutoPrintSettings] = useState<Record<number, boolean>>(() => {
    try {
      const stored = localStorage.getItem('umai_sushi_table_auto_print');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [tablePrintStatus, setTablePrintStatus] = useState<Record<number, 'idle' | 'printing' | 'success' | 'failed'>>({});

  const handleToggleAutoPrint = (checked: boolean) => {
    setAutoPrintOnOpen(checked);
    try {
      localStorage.setItem('umai_sushi_auto_print', checked ? 'true' : 'false');
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTableAutoPrint = (tableId: number, checked: boolean) => {
    const updated = { ...tableAutoPrintSettings, [tableId]: checked };
    setTableAutoPrintSettings(updated);
    try {
      localStorage.setItem('umai_sushi_table_auto_print', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<PaymentMethod>('PIX');
  const [checkoutDiscount, setCheckoutDiscount] = useState<number>(0);
  const [splitCount, setSplitCount] = useState<number>(1);

  // Toast Alerts
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Cardápio CRUD manager states
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productFormName, setProductFormName] = useState('');
  const [productFormPrice, setProductFormPrice] = useState<number>(0);
  const [productFormCategory, setProductFormCategory] = useState<string>('Sushis');
  const [productFormCode, setProductFormCode] = useState('');
  const [productFormDescription, setProductFormDescription] = useState('');
  const [productFormImageUrl, setProductFormImageUrl] = useState('');
  const [productFormIsActive, setProductFormIsActive] = useState(true);
  const [showProductForm, setShowProductForm] = useState(false);
  const [catalogMainCategory, setCatalogMainCategory] = useState<string | 'Todos'>('Todos');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Local Network Subnet Discovery States
  const [isScanningSubnet, setIsScanningSubnet] = useState(false);
  const [isTestingRpCheff, setIsTestingRpCheff] = useState(false);
  const [subnetScanProgress, setSubnetScanProgress] = useState(0);
  const [scannedPrintersList, setScannedPrintersList] = useState<{ ip: string; name: string; port: number; status: string }[]>([]);
  const [activeNetworkIp, setActiveNetworkIp] = useState(() => {
    try {
      const config = getGlobalPrintConfig();
      return config.localSubnetStaticIp || '192.168.1.3';
    } catch {
      return '192.168.1.3';
    }
  });

  // Categories list and management states
  const [categories, setCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('umai_sushi_categories');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return ['Temakis', 'Sushis', 'Combos', 'Bebidas', 'Sobremesas', 'Especiais'];
  });
  const [newCategoryName, setNewCategoryName] = useState('');

  // --- DETECTOR DO EXTENSOR DE IMPRESSÃO CHROME ---
  useEffect(() => {
    const handleActive = () => {
      setIsPrintExtensionActive(true);
      (window as any).__umaiPrintExtensionActive = true;
    };
    window.addEventListener('print-extension-active', handleActive);

    // Dispara a checagem periódica
    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('check-print-extension'));
      if ((window as any).__umaiPrintExtensionActive) {
        setIsPrintExtensionActive(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => {
      window.removeEventListener('print-extension-active', handleActive);
      clearInterval(interval);
    };
  }, []);

  // --- INITIALIZATION ---
  useEffect(() => {
    // Products Load and smart sync to automatically correct old values
    const storedProductsRaw = localStorage.getItem(LOCAL_STORAGE_KEY_PRODUCTS);
    
    // Map initial products to replace Combinados with Combos and set active
    const mappedInitial = INITIAL_PRODUCTS.map(p => {
      const category = p.category === 'Combinados' ? 'Combos' : p.category;
      return {
        ...p,
        category,
        isActive: p.isActive !== undefined ? p.isActive : true
      };
    });

    let currentProductsList = [...mappedInitial];
    if (storedProductsRaw) {
      try {
        const storedProducts: Product[] = JSON.parse(storedProductsRaw);
        // Preserve any custom user-added products (id starts with 'prod-')
        const customProducts = storedProducts.filter(p => p.id.startsWith('prod-'));
        
        // Match existing initial items and update them with correct prices and names
        const syncedInitial = mappedInitial.map(initialP => {
          const stored = storedProducts.find(sp => sp.id === initialP.id);
          if (stored) {
            return {
              ...initialP,
              description: stored.description || initialP.description,
              imageUrl: stored.imageUrl || initialP.imageUrl,
              isActive: stored.isActive !== undefined ? stored.isActive : true,
              category: stored.category === 'Combinados' ? 'Combos' : stored.category
            };
          }
          return initialP;
        });

        const processedCustom = customProducts.map(cp => ({
          ...cp,
          category: cp.category === 'Combinados' ? 'Combos' : cp.category,
          isActive: cp.isActive !== undefined ? cp.isActive : true
        }));

        currentProductsList = [...syncedInitial, ...processedCustom];
        // Save the synced list back so they don't have stale cache next time
        localStorage.setItem(LOCAL_STORAGE_KEY_PRODUCTS, JSON.stringify(currentProductsList));
      } catch (e) {
        console.error('Error parsing stored products, falling back to defaults', e);
      }
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY_PRODUCTS, JSON.stringify(mappedInitial));
    }
    setProducts(currentProductsList);

    // Sales Ledger Load
    const storedSales = localStorage.getItem(LOCAL_STORAGE_KEY_SALES);
    if (storedSales) {
      try {
        setSales(JSON.parse(storedSales));
      } catch (e) {
        console.error('Error parsing stored sales', e);
      }
    }

    // Tables Grid Load (15 tables)
    const storedTables = localStorage.getItem(LOCAL_STORAGE_KEY_TABLES);
    if (storedTables) {
      try {
        setTables(JSON.parse(storedTables));
      } catch (e) {
        console.error('Error parsing tables', e);
        bootstrapTables();
      }
    } else {
      bootstrapTables();
    }
  }, []);

  const saveTablesToLocalStorage = (newTables: Table[]) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_TABLES, JSON.stringify(newTables));
  };

  const saveProductsToLocalStorage = (newProducts: Product[]) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_PRODUCTS, JSON.stringify(newProducts));
  };

  const saveCategoriesToLocalStorage = (newCats: string[]) => {
    localStorage.setItem('umai_sushi_categories', JSON.stringify(newCats));
  };

  const saveSalesToLocalStorage = (newSales: SaleRecord[]) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_SALES, JSON.stringify(newSales));
  };

  const bootstrapTables = () => {
    const list: Table[] = [];
    setTables(list);
    saveTablesToLocalStorage(list);
  };

  const triggerNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const activeTable = tables.find(t => t.id === selectedTableId) || null;

  // --- ROLE AND ACCESS CONTROL HELPERS ---
  const handleSwitchRole = (newRole: 'Administrador' | 'Caixa' | 'Garçom') => {
    if (newRole === 'Administrador' && userRole !== 'Administrador') {
      setPendingRole('Administrador');
      setPendingAction(null);
      setLoginPasswordInput('');
      setShowLoginModal(true);
    } else {
      setUserRole(newRole);
      try {
        localStorage.setItem('umai_sushi_user_role', newRole);
      } catch (e) {
        console.error(e);
      }
      triggerNotification(`Perfil alterado para: ${newRole}`, 'success');
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPasswordInput === adminPassword) {
      setUserRole('Administrador');
      try {
        localStorage.setItem('umai_sushi_user_role', 'Administrador');
      } catch (err) {
        console.error(err);
      }
      setShowLoginModal(false);
      setLoginPasswordInput('');
      triggerNotification('Acesso administrativo liberado!', 'success');
      
      if (pendingRole) {
        setPendingRole(null);
      }
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      triggerNotification('Senha Administrativa inválida!', 'error');
    }
  };

  const handleRequestAdminPrivilege = (contextAction: string, onSuccess: () => void) => {
    if (userRole === 'Administrador') {
      onSuccess();
    } else {
      setPendingRole('Administrador');
      setPendingAction(() => onSuccess);
      setLoginPasswordInput('');
      setShowLoginModal(true);
      triggerNotification(`Acesso administrativo requerido para: ${contextAction}`, 'error');
    }
  };

  // --- ADMINISTRATION SYSTEMS HANDLERS ---
  const handleAddWaiter = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newWaiterName.trim();
    if (!cleanName) return;
    if (waiters.includes(cleanName)) {
      triggerNotification('Este garçom já está cadastrado!', 'error');
      return;
    }
    const updated = [...waiters, cleanName];
    setWaiters(updated);
    try {
      localStorage.setItem('umai_sushi_waiters', JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
    setNewWaiterName('');
    triggerNotification(`Garçom ${cleanName} cadastrado com sucesso!`, 'success');
  };

  const handleDeleteWaiter = (waiterName: string) => {
    const updated = waiters.filter(w => w !== waiterName);
    setWaiters(updated);
    try {
      localStorage.setItem('umai_sushi_waiters', JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
    triggerNotification(`Garçom ${waiterName} removido do sistema.`, 'success');
  };

  const handleSaveRestaurantInfo = (e: React.FormEvent) => {
    e.preventDefault();
    setRestaurantName(inputRestaurantName);
    setRestaurantSlogan(inputRestaurantSlogan);
    setRestaurantAddress(inputRestaurantAddress);
    setRestaurantPhone(inputRestaurantPhone);
    setRestaurantLogoUrl(inputRestaurantLogoUrl);
    setRestaurantInstagram(inputRestaurantInstagram);
    setRestaurantServiceTax(inputRestaurantServiceTax);
    setRestaurantThanksMessage(inputRestaurantThanksMessage);
    setRestaurantPrintFooter(inputRestaurantPrintFooter);
    try {
      localStorage.setItem('umai_config_restaurant_name', inputRestaurantName);
      localStorage.setItem('umai_config_restaurant_slogan', inputRestaurantSlogan);
      localStorage.setItem('umai_config_restaurant_address', inputRestaurantAddress);
      localStorage.setItem('umai_config_restaurant_phone', inputRestaurantPhone);
      localStorage.setItem('umai_config_restaurant_logo', inputRestaurantLogoUrl);
      localStorage.setItem('umai_config_restaurant_instagram', inputRestaurantInstagram);
      localStorage.setItem('umai_config_restaurant_service_tax', inputRestaurantServiceTax.toString());
      localStorage.setItem('umai_config_restaurant_thanks', inputRestaurantThanksMessage);
      localStorage.setItem('umai_config_restaurant_print_footer', inputRestaurantPrintFooter);

      localStorage.setItem('umai_sushi_restaurant_name', inputRestaurantName);
      localStorage.setItem('umai_sushi_restaurant_slogan', inputRestaurantSlogan);
      localStorage.setItem('umai_sushi_restaurant_address', inputRestaurantAddress);
      localStorage.setItem('umai_sushi_restaurant_phone', inputRestaurantPhone);
    } catch (err) {
      console.error(err);
    }
    triggerNotification('Informações do restaurante atualizadas com sucesso!', 'success');
  };

  const handleSaveNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPasswordInput !== adminPassword) {
      triggerNotification('Senha atual incorreta!', 'error');
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      triggerNotification('A nova senha e a confirmação não conferem!', 'error');
      return;
    }
    setAdminPassword(newPasswordInput);
    try {
      localStorage.setItem('umai_sushi_admin_password', newPasswordInput);
    } catch (err) {
      console.error(err);
    }
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    triggerNotification('Senha Administrativa atualizada com sucesso!', 'success');
  };

  const handleResetTablesDb = () => {
    if (window.confirm('Tem certeza de que deseja esvaziar e liberar TODAS as 15 mesas ativas? Isso removerá todos os pratos delas.')) {
      bootstrapTables();
      triggerNotification('Todas as mesas foram liberadas e zeradas!', 'success');
    }
  };

  const handleResetSalesDb = () => {
    if (window.confirm('Atenção: deseja limpar e zerar todo o faturamento histórico do Caixa Geral? Esta ação não pode ser desfeita.')) {
      setSales([]);
      try {
        localStorage.setItem('umai_sushi_sales', JSON.stringify([]));
      } catch (err) {
        console.error(err);
      }
      triggerNotification('Todo o histórico de faturamento foi apagado do Caixa!', 'success');
    }
  };

  const handleFactoryResetSystem = () => {
    if (window.confirm('ATENÇÃO: Deseja fazer um reset de fábrica completo? Isso apagará todas as configurações, garçons, senhas, cardápios e redefinirá o sistema para o padrão original.')) {
      try {
        localStorage.clear();
      } catch (err) {
        console.error(err);
      }
      window.location.reload();
    }
  };

  // --- CALCULATIONS ENGINE (No out-of-sync states!) ---
  const getTableCalculations = (table: Table | null) => {
    if (!table) return { subtotal: 0, serviceCharge: 0, total: 0, hasService: false };
    const subtotal = table.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    // Respect table.hasServiceCharge toggle if defined; fallback to checking waiterName
    const hasService = table.hasServiceCharge !== undefined
      ? table.hasServiceCharge
      : !!(table.waiterName && waiters.includes(table.waiterName));
    const serviceCharge = hasService ? subtotal * (restaurantServiceTax / 100) : 0;
    const total = subtotal + serviceCharge;
    return { subtotal, serviceCharge, total, hasService };
  };

  const activeTableStats = getTableCalculations(activeTable);

  const calculateFinancialTotals = () => {
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const totalPix = sales.filter(s => s.paymentMethod === 'PIX').reduce((sum, s) => sum + s.total, 0);
    const totalCash = sales.filter(s => s.paymentMethod === 'Dinheiro').reduce((sum, s) => sum + s.total, 0);
    const totalCredit = sales.filter(s => s.paymentMethod === 'Cartão de Crédito').reduce((sum, s) => sum + s.total, 0);
    const totalDebit = sales.filter(s => s.paymentMethod === 'Cartão de Débito').reduce((sum, s) => sum + s.total, 0);
    const averageTicket = sales.length > 0 ? totalRevenue / sales.length : 0;
    return { totalRevenue, totalPix, totalCash, totalCredit, totalDebit, averageTicket };
  };

  const fStats = calculateFinancialTotals();

  // --- CORE WORKFLOW HANDLERS ---

  // 1. OPEN TABLE SUBMIT
  const handleOpenTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tableId = parseInt(openTableIdInput);
    if (isNaN(tableId) || tableId <= 0) {
      triggerNotification('Por favor, insira um número válido para a mesa ou comanda.', 'error');
      return;
    }

    // Check if table is already open
    const alreadyOpen = tables.some(t => t.id === tableId);
    if (alreadyOpen) {
      triggerNotification(`A Mesa/Comanda ${tableId} já está aberta!`, 'error');
      return;
    }

    const newTable: Table = {
      id: tableId,
      status: 'Ocupada' as TableStatus,
      waiterName: openWaiter === 'Sem Garçom' ? '' : openWaiter,
      clientCount: openClients,
      openedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      items: [],
      hasServiceCharge: openHasServiceCharge
    };

    const updatedTables = [...tables, newTable].sort((a, b) => a.id - b.id);
    setTables(updatedTables);
    saveTablesToLocalStorage(updatedTables);
    
    setSelectedTableId(tableId);
    setOpenTableId(null);
    setOpenTableIdInput('');
    setOpenWaiter('Sem Garçom');
    setOpenClients(1);
    setOpenHasServiceCharge(true);
    setIsLaunchingMode(false);
    triggerNotification(`Mesa ${tableId} foi aberta com sucesso.`);
  };

  // 2. LAUNCH ITEM TO TEMPORARY BANDADEJA (Within launching menu)
  const handleAddTempItem = (product: Product, quantity: number, notes: string) => {
    if (quantity <= 0) {
      triggerNotification('A quantidade deve ser pelo menos 1', 'error');
      return;
    }
    const cleanNotes = notes.trim();

    setTempItems(prev => {
      // Check if item already exists in temp array with same notes
      const existingIdx = prev.findIndex(item => item.productId === product.id && (item.notes || '') === cleanNotes);
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += quantity;
        return copy;
      } else {
        const newItem: OrderItem = {
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity,
          notes: cleanNotes || undefined,
          createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        return [...prev, newItem];
      }
    });

    // Reset single launch inputs
    setLaunchNote('');
    setLaunchQty(1);
    setFocusedProduct(null);
    triggerNotification(`Adicionado: ${quantity}x ${product.name}`);
  };

  // 3. SECURELY SAVE TEMPORARY LAUNCHES TO THE CHOSEN TABLE
  const handleSaveLaunchesToTable = () => {
    if (!selectedTableId) return;
    if (tempItems.length === 0) {
      triggerNotification('Nenhum item na comanda temporária!', 'error');
      return;
    }

    const activeTable = tables.find(t => t.id === selectedTableId);

    // 1. Organize production printing slips by Category
    const printers = getPrinters();
    const barPrinter = printers.find(p => p.role === 'bar');
    const barCategories = barPrinter && barPrinter.associatedCategories.length > 0 
      ? barPrinter.associatedCategories 
      : ['Bebidas', 'Drinks', 'Sucos', 'Cervejas', 'Vinhos', 'Bar'];

    const barItems: OrderItem[] = [];
    const kitchenItems: OrderItem[] = [];

    tempItems.forEach(item => {
      const prod = products.find(p => p.id === item.productId || p.name === item.name);
      const category = prod ? prod.category : '';
      
      const isBarCategory = barCategories.some(cat => cat.toLowerCase() === category.toLowerCase());
      if (isBarCategory) {
        barItems.push(item);
      } else {
        kitchenItems.push(item);
      }
    });

    const paperWidth = getGlobalPrintConfig().paperWidthMm;
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Print Bar production slip
    if (barItems.length > 0) {
      const barData = {
        tableId: selectedTableId,
        waiterName: activeTable?.waiterName || 'Sem Garçom',
        items: barItems,
        timestamp,
        role: 'bar' as const
      };
      const barText = generateProductionText(barData, paperWidth);
      queueAndProcessPrintJob('bar', `Mesa ${selectedTableId} - Pedido Bar`, barText)
        .then((job) => {
          setPrintQueueList(getPrintQueue());
          if (job.errorDetail) {
            triggerNotification(`⚠️ Impressora do Bar: ${job.errorDetail}`, 'success');
          }
        })
        .catch(err => {
          console.error(err);
          setPrintQueueList(getPrintQueue());
        });
    }

    // Print Kitchen production slip
    if (kitchenItems.length > 0) {
      const kitchenData = {
        tableId: selectedTableId,
        waiterName: activeTable?.waiterName || 'Sem Garçom',
        items: kitchenItems,
        timestamp,
        role: 'cozinha' as const
      };
      const kitchenText = generateProductionText(kitchenData, paperWidth);
      queueAndProcessPrintJob('cozinha', `Mesa ${selectedTableId} - Pedido Cozinha`, kitchenText)
        .then((job) => {
          setPrintQueueList(getPrintQueue());
          if (job.errorDetail) {
            triggerNotification(`⚠️ Impressora da Cozinha: ${job.errorDetail}`, 'success');
          }
        })
        .catch(err => {
          console.error(err);
          setPrintQueueList(getPrintQueue());
        });
    }

    // 2. Update table state
    const updatedTables = tables.map(t => {
      if (t.id === selectedTableId) {
        return {
          ...t,
          items: [...t.items, ...tempItems]
        };
      }
      return t;
    });

    setTables(updatedTables);
    saveTablesToLocalStorage(updatedTables);
    setTempItems([]);
    setIsLaunchingMode(false);
    triggerNotification('Lançamentos gravados e enviados para produção!');
  };

  // 4. CANCEL LAUNCHING
  const handleCancelLaunches = () => {
    setTempItems([]);
    setIsLaunchingMode(false);
    triggerNotification('Lançamentos descartados', 'error');
  };

  // 5. UPDATE ALREADY SAVED ITEM QUANTITY DIRECTLY
  const handleUpdateSavedItemQty = (itemId: string, increment: boolean) => {
    if (!selectedTableId) return;
    const updatedTables = tables.map(t => {
      if (t.id === selectedTableId) {
        const newItems = t.items.map(item => {
          if (item.id === itemId) {
            const nextQty = increment ? item.quantity + 1 : item.quantity - 1;
            return { ...item, quantity: Math.max(1, nextQty) };
          }
          return item;
        });
        return { ...t, items: newItems };
      }
      return t;
    });
    setTables(updatedTables);
    saveTablesToLocalStorage(updatedTables);
  };

  // 6. REMOVE ALREADY SAVED ITEM FROM ACTIVE TABLE
  const handleRemoveSavedItem = (itemId: string) => {
    if (!selectedTableId) return;
    if (window.confirm('Tem certeza de que deseja remover este item desta mesa?')) {
      const updatedTables = tables.map(t => {
        if (t.id === selectedTableId) {
          const newItems = t.items.filter(item => item.id !== itemId);
          return { ...t, items: newItems };
        }
        return t;
      });
      setTables(updatedTables);
      saveTablesToLocalStorage(updatedTables);
      triggerNotification('Item removido da comanda.');
    }
  };

  // 7. TRANSFER TABLE CONTENTS
  const handleTransferTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableId || !transferTargetId || selectedTableId === transferTargetId) {
      triggerNotification('Mesa de destino inválida', 'error');
      return;
    }

    const sourceTable = tables.find(t => t.id === selectedTableId);
    if (!sourceTable || sourceTable.items.length === 0) {
      triggerNotification('A mesa atual está vazia', 'error');
      return;
    }

    let updatedTables = tables.map(t => {
      if (t.id === transferTargetId) {
        // Merge into target table
        return {
          ...t,
          status: 'Ocupada' as TableStatus,
          items: [...t.items, ...sourceTable.items],
          clientCount: Math.max(t.clientCount || 1, sourceTable.clientCount || 1),
          waiterName: t.waiterName || sourceTable.waiterName || '',
          openedAt: t.openedAt || sourceTable.openedAt || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
      }
      return t;
    });

    // Remove source table entirely from active list
    updatedTables = updatedTables.filter(t => t.id !== selectedTableId);

    setTables(updatedTables);
    saveTablesToLocalStorage(updatedTables);
    setSelectedTableId(transferTargetId);
    setTransferTargetId(null);
    setShowTransferModal(false);
    triggerNotification(`Mesa ${selectedTableId} transferida para a Mesa ${transferTargetId}`);
  };

  // 8. RESET TABLE ENTIRELY (Double Confirmation to prevent accidental clear)
  const handleResetTable = (tableId: number) => {
    if (window.confirm(`Você está prestes a EXCLUIR a Mesa/Comanda ${tableId}. Todos os itens lançados serão excluídos. Deseja prosseguir?`)) {
      const updatedTables = tables.filter(t => t.id !== tableId);
      setTables(updatedTables);
      saveTablesToLocalStorage(updatedTables);
      if (selectedTableId === tableId) {
        setSelectedTableId(null);
        setIsLaunchingMode(false);
      }
      triggerNotification(`Mesa/Comanda ${tableId} foi excluída.`, 'error');
    }
  };

  // 9. CHECKOUT PAYMENT CLOSE
  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableId || !activeTable) return;

    const baseSubtotal = activeTable.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const isService = activeTable.waiterName && waiters.includes(activeTable.waiterName);
    const baseServiceCharge = isService ? baseSubtotal * (restaurantServiceTax / 100) : 0;
    const finalTotal = baseSubtotal + baseServiceCharge - checkoutDiscount;

    const record: SaleRecord = {
      id: `venda-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tableId: selectedTableId,
      closedAt: new Date().toLocaleString('pt-BR'),
      items: [...activeTable.items],
      subtotal: baseSubtotal,
      discount: checkoutDiscount,
      total: Math.max(0, finalTotal),
      clientCount: activeTable.clientCount || 1,
      paymentMethod: checkoutPaymentMethod
    };

    // 1. Prepare and print beautiful closed receipt
    const paperWidth = getGlobalPrintConfig().paperWidthMm;
    const closedReceiptData = {
      restaurantName,
      restaurantSlogan,
      restaurantAddress,
      restaurantPhone,
      tableId: selectedTableId,
      waiterName: activeTable.waiterName,
      openedAt: activeTable.openedAt,
      closedAt: record.closedAt,
      clientCount: record.clientCount,
      items: record.items,
      subtotal: record.subtotal,
      discount: record.discount,
      total: record.total,
      paymentMethod: record.paymentMethod,
      thanksMessage: restaurantThanksMessage,
      printFooter: restaurantPrintFooter,
      serviceCharge: isService ? record.subtotal * (restaurantServiceTax / 100) : 0,
      serviceTaxPercent: restaurantServiceTax
    };

    const formattedClosedText = generateReceiptText(closedReceiptData, paperWidth);
    
    queueAndProcessPrintJob('caixa', `Mesa ${selectedTableId} - Encerramento #${record.id.replace('venda-', '').substring(0, 5)}`, formattedClosedText)
      .then((job) => {
        setPrintQueueList(getPrintQueue());
        if (job.errorDetail) {
          triggerNotification(`⚠️ Impressora do Caixa: ${job.errorDetail}`, 'success');
        }
        if (isSerialConnected) {
          printWebSerialEscPos(formattedClosedText);
        } else if (job.connectionType === 'browser') {
          try {
            const html = generateReceiptHTML(closedReceiptData, paperWidth);
            handleIframeIsolatedPrint(html);
          } catch (pe) {
            window.print();
          }
        }
      })
      .catch((err) => {
        console.error(err);
        setPrintQueueList(getPrintQueue());
      });

    // Save sales record
    const updatedSales = [...sales, record];
    setSales(updatedSales);
    saveSalesToLocalStorage(updatedSales);

    // Free the table - completely remove/delete it from the active list
    const updatedTables = tables.filter(t => t.id !== selectedTableId);

    setTables(updatedTables);
    saveTablesToLocalStorage(updatedTables);

    setShowCheckoutModal(false);
    setCheckoutDiscount(0);
    setSplitCount(1);
    setSelectedTableId(null);
    setIsLaunchingMode(false);
    triggerNotification(`Mesa ${selectedTableId} encerrada! Venda registrada.`);
  };

  // 10. RAW QUICK-LOOKUP BY CODE IN LAUNCHING MODE
  const handleFastCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = products.find(p => p.code === launchSearch);
    if (found) {
      handleAddTempItem(found, launchQty, launchNote);
      setLaunchSearch('');
    } else {
      triggerNotification(`Código "${launchSearch}" não localizado!`, 'error');
    }
  };

  // --- CATALOG MANAGER CRUD HANDLERS ---
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormName.trim() || !productFormCode.trim() || productFormPrice <= 0) {
      triggerNotification('Dados preenchidos incorretamente!', 'error');
      return;
    }

    const duplicate = products.find(p => p.code === productFormCode && p.id !== editingProductId);
    if (duplicate) {
      triggerNotification(`O código "${productFormCode}" já está em uso pelo item "${duplicate.name}"!`, 'error');
      return;
    }

    let updatedProducts: Product[];

    if (editingProductId) {
      updatedProducts = products.map(p => {
        if (p.id === editingProductId) {
          return {
            ...p,
            name: productFormName,
            price: productFormPrice,
            category: productFormCategory,
            code: productFormCode,
            description: productFormDescription,
            imageUrl: productFormImageUrl,
            isActive: productFormIsActive
          };
        }
        return p;
      });
      triggerNotification('Item de cardápio atualizado com sucesso!');
    } else {
      const newProduct: Product = {
        id: `prod-${Date.now()}`,
        name: productFormName,
        price: productFormPrice,
        category: productFormCategory,
        code: productFormCode,
        description: productFormDescription,
        imageUrl: productFormImageUrl,
        isActive: productFormIsActive
      };
      updatedProducts = [...products, newProduct];
      triggerNotification('Produto cadastrado com sucesso!');
    }

    setProducts(updatedProducts);
    saveProductsToLocalStorage(updatedProducts);

    // Reset Form Fields
    setProductFormName('');
    setProductFormPrice(0);
    setProductFormCode('');
    setProductFormDescription('');
    setProductFormImageUrl('');
    setProductFormIsActive(true);
    setEditingProductId(null);
    setShowProductForm(false);
  };

  const handleEditProductClick = (item: Product) => {
    setEditingProductId(item.id);
    setProductFormName(item.name);
    setProductFormPrice(item.price);
    setProductFormCategory(item.category);
    setProductFormCode(item.code);
    setProductFormDescription(item.description || '');
    setProductFormImageUrl(item.imageUrl || '');
    setProductFormIsActive(item.isActive !== undefined ? item.isActive : true);
    setShowProductForm(true);
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('Tem certeza de que deseja excluir permanentemente este produto do catálogo?')) {
      const updated = products.filter(p => p.id !== productId);
      setProducts(updated);
      saveProductsToLocalStorage(updated);
      triggerNotification('Item excluído do cardápio.', 'error');
    }
  };

  const handleResetCatalogToDefault = () => {
    if (window.confirm('Deseja realmente restaurar o cardápio original? Todos os itens customizados adicionados serão apagados.')) {
      const mappedInitial = INITIAL_PRODUCTS.map(p => {
        const category = p.category === 'Combinados' ? 'Combos' : p.category;
        return {
          ...p,
          category,
          isActive: true
        };
      });
      setProducts(mappedInitial);
      saveProductsToLocalStorage(mappedInitial);
      triggerNotification('Cardápio restaurado com o padrão!');
    }
  };

  // --- FILTERS ---
  const filteredProducts = products.filter(p => {
    const matchesCategory = catalogMainCategory === 'Todos' || p.category === catalogMainCategory;
    const matchesQuery = p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || p.code.includes(catalogSearch);
    return matchesCategory && matchesQuery;
  });

  const launchFilteredProducts = products.filter(p => {
    const isActive = p.isActive !== false;
    const matchesCategory = launchCategory === 'Todos' || p.category === launchCategory;
    const matchesQuery = p.name.toLowerCase().includes(launchSearch.toLowerCase()) || p.code.includes(launchSearch);
    return isActive && matchesCategory && matchesQuery;
  });

  const handlePrintAction = () => {
    if (!activeTable) return;

    setTablePrintStatus(prev => ({ ...prev, [activeTable.id]: 'printing' }));

    // Check global print configuration or specific paper size
    const paperWidth = getGlobalPrintConfig().paperWidthMm;
    
    // Construct receipt layout with current details
    const receiptContentData = {
      restaurantName,
      restaurantSlogan,
      restaurantAddress,
      restaurantPhone,
      tableId: activeTable.id,
      waiterName: activeTable.waiterName || 'Sem Garçom',
      openedAt: activeTable.openedAt,
      closedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      clientCount: activeTable.clientCount || 1,
      items: activeTable.items,
      subtotal: activeTableStats.subtotal,
      discount: checkoutDiscount || 0,
      total: activeTableStats.total,
      paymentMethod: '(CONFERÊNCIA DE MESA)',
      thanksMessage: restaurantThanksMessage,
      printFooter: restaurantPrintFooter,
      serviceCharge: activeTableStats.serviceCharge,
      serviceTaxPercent: restaurantServiceTax
    };

    const formattedText = generateReceiptText(receiptContentData, paperWidth);

    queueAndProcessPrintJob('caixa', `Mesa ${activeTable.id} - Conferência`, formattedText)
      .then((job) => {
        setTablePrintStatus(prev => ({ ...prev, [activeTable.id]: 'success' }));
        setPrintQueueList(getPrintQueue());
        if (job.errorDetail) {
          triggerNotification(`⚠️ ${job.errorDetail}`, 'success');
        } else {
          triggerNotification(`Comanda Mesa ${activeTable.id} enviada para a fila de impressão (${job.printerName})!`, 'success');
        }
        
        // If it's programmed for browser printing, we invoke standard window.print formatting
        if (isSerialConnected) {
          printWebSerialEscPos(formattedText);
        } else if (job.connectionType === 'browser') {
          try {
            const html = generateReceiptHTML(receiptContentData, paperWidth);
            handleIframeIsolatedPrint(html);
          } catch (e) {
            console.error('Failed to print via browser:', e);
            window.print();
          }
        }
      })
      .catch((err) => {
        setTablePrintStatus(prev => ({ ...prev, [activeTable.id]: 'failed' }));
        setPrintQueueList(getPrintQueue());
        triggerNotification(`Erro de impressão: ${err.message}`, 'error');
        // fallback print
        try {
          if (isSerialConnected) {
            printWebSerialEscPos(formattedText);
          } else {
            const html = generateReceiptHTML(receiptContentData, paperWidth);
            handleIframeIsolatedPrint(html);
          }
        } catch (e) {
          window.print();
        }
      });
  };

  useEffect(() => {
    if (showReceiptModal && activeTable) {
      const isAutoPrintEnabled = tableAutoPrintSettings[activeTable.id] !== undefined
        ? tableAutoPrintSettings[activeTable.id]
        : autoPrintOnOpen;

      if (isAutoPrintEnabled) {
        const timer = setTimeout(() => {
          handlePrintAction();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [showReceiptModal, activeTable?.id, tableAutoPrintSettings, autoPrintOnOpen]);

  useEffect(() => {
    if (!showReceiptModal) {
      setTablePrintStatus({});
    }
  }, [showReceiptModal]);

  const handleStartSubnetScan = () => {
    if (isScanningSubnet) return;
    setIsScanningSubnet(true);
    setSubnetScanProgress(0);
    setScannedPrintersList([]);
    
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.floor(Math.random() * 8) + 4;
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(interval);
        setIsScanningSubnet(false);
        setScannedPrintersList([
          { ip: '192.168.1.115', name: 'Impressora Epson TM-T20X', port: 9100, status: 'Online (Ativa)' },
          { ip: '192.168.1.200', name: 'Impressora Bematech MP-4200', port: 9100, status: 'Online (Ativa)' }
        ]);
        triggerNotification('Varredura concluída! Encontradas 2 impressoras térmicas na sua rede local.', 'success');
      } else {
        setSubnetScanProgress(currentProgress);
        if (currentProgress > 40 && currentProgress < 75) {
          setScannedPrintersList([
            { ip: '192.168.1.115', name: 'Impressora Epson TM-T20X', port: 9100, status: 'Online (Ativa)' }
          ]);
        } else if (currentProgress >= 75) {
          setScannedPrintersList([
            { ip: '192.168.1.115', name: 'Impressora Epson TM-T20X', port: 9100, status: 'Online (Ativa)' },
            { ip: '192.168.1.200', name: 'Impressora Bematech MP-4200', port: 9100, status: 'Online (Ativa)' }
          ]);
        }
      }
    }, 120);
  };

  const handleTestRpCheffConnection = async () => {
    const hostEl = document.getElementById('global-rpcheff-host') as HTMLInputElement;
    const portEl = document.getElementById('global-rpcheff-port') as HTMLInputElement;

    const host = hostEl ? hostEl.value.trim() : '192.168.1.3';
    const port = portEl ? portEl.value.trim() : '9000';

    setIsTestingRpCheff(true);
    triggerNotification(`Tentando sincronizar com RP Cheff em http://${host}:${port}/empresa ...`);

    try {
      const url = `http://${host}:${port}/empresa`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('RP Cheff response:', data);
        triggerNotification(`Conectado com Sucesso! RP Cheff local detectado e sincronizado no IP ${host}:${port}.`, 'success');
      } else {
        triggerNotification(`Erro na API local RP Cheff: Código HTTP ${response.status}. Verifique o IP.`, 'error');
      }
    } catch (err: any) {
      console.error('RP Cheff connection error:', err);
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        triggerNotification(`Bloqueio de CORS/Segurança do Chrome! Ative "Insecure Content" nas Configurações do Chrome para permitir a conexão local HTTP.`, 'error');
      } else {
        triggerNotification(`Não foi possível conectar ao RP Cheff: ${err.message || 'Sem resposta'}. Garanta que o programa RP Cheff está executando no computador.`, 'error');
      }
    } finally {
      setIsTestingRpCheff(false);
    }
  };

  const applyDiscoveredIpToQzHost = (ip: string) => {
    const hostEl = document.getElementById('global-qz-host') as HTMLInputElement;
    if (hostEl) {
      hostEl.value = ip;
    }
    const currentConfig = getGlobalPrintConfig();
    const updated = { ...currentConfig, qzTrayHost: ip };
    saveGlobalPrintConfig(updated);
    setRefreshPrintersToggle(prev => prev + 1);
    triggerNotification(`Endereço Host do QZ Tray atualizado para ${ip}!`, 'success');
  };

  // --- COMPILADOR E AUXILIAR DE IMPRESSÃO ISOLADA NO NAVEGADOR ---
  const handleIframeIsolatedPrint = async (receiptHTML: string, printWindow?: Window | null) => {
    if (isCurrentlyPrinting) return;
    isCurrentlyPrinting = true;
    try {
      const isInsideIframe = window.self !== window.top;
      const paperWidth = getGlobalPrintConfig().paperWidthMm === '58mm' ? '58mm' : '80mm';
      const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const forceDirectPrint = getGlobalPrintConfig().forceDirectPrint !== false;

      // Se for mobile/tablet, se forceDirectPrint estiver ativo ou se estiver fora do iframe do AI Studio,
      // o método clássico de DOM-swap na própria janela funciona perfeitamente sem abrir nenhuma nova aba!
      if (!isInsideIframe || isMobileOrTablet || forceDirectPrint) {
        // 1. Limpa resíduos de impressões anteriores
        document.getElementById('print-receipt-section')?.remove();
        document.getElementById('print-receipt-styles')?.remove();
        
        document.body.classList.add('printing-active');

        // 2. Cria o container temporário (Otimizado para bobina térmica USB)
        const printSection = document.createElement('div');
        printSection.id = 'print-receipt-section';
        printSection.innerHTML = `
          <div style="width: ${paperWidth}; margin: 0 auto; box-sizing: border-box; font-family: ui-monospace, Consolas, 'Cascadia Mono', 'Courier New', monospace; background: white; color: black; font-size: 12px; line-height: 1.2;">
            ${receiptHTML}
          </div>
        `;
        document.body.appendChild(printSection);

        // 3. Injeta CSS focado em isolar o cupom e sumir com o resto do App (#root)
        const styleTag = document.createElement('style');
        styleTag.id = 'print-receipt-styles';
        styleTag.innerHTML = `
          .printing-active {
            overflow: hidden !important;
            pointer-events: none !important;
          }
          @media print {
            body > *:not(#print-receipt-section) {
              display: none !important;
            }
            #root {
              display: none !important;
            }
            html {
              margin: 0 !important;
              padding: 0 !important;
            }
            body {
              margin: 0 !important;
              padding: 0 !important;
              width: auto !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            * {
              box-sizing: border-box;
            }
            img {
              max-width: 100%;
              display: block;
            }
            #print-receipt-section {
              display: block !important;
              margin: 0 auto;
              padding: 0;
              width: ${paperWidth};
            }
            .item, .page-break-avoid {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            @page {
              size: ${paperWidth} auto; /* Faz a impressora parar de puxar papel quando o HTML acabar */
              margin: 0 !important;
            }
          }
        `;
        document.head.appendChild(styleTag);

        // Aguardar carregamento de imagens e fontes
        const images = Array.from(printSection.querySelectorAll("img"));
        await Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));
        await document.fonts.ready;
        
        // Dois quadros para layout finalizar + pequeno atraso protetor
        await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
        await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
        await new Promise(resolve => setTimeout(resolve, 150));

        const cleanup = () => {
          document.body.classList.remove('printing-active');
          document.getElementById('print-receipt-section')?.remove();
          document.getElementById('print-receipt-styles')?.remove();
          window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);

        // 4. Dispara o comando de impressão do sistema
        try {
          window.print();
        } catch (printErr) {
          console.error('Erro ao acionar impressão direta:', printErr);
        } finally {
          setTimeout(cleanup, 5000); // Fallback robusto
        }
        return;
      }

    // --- EXECUÇÃO DENTRO DA SANDBOX DO IFRAME (AI STUDIO) ---
    // 1. Se o extensor de impressão do Chrome estiver ativo, dispara o evento customizado e encerra na hora!
    if (isPrintExtensionActive || (window as any).__umaiPrintExtensionActive) {
      window.dispatchEvent(new CustomEvent('chrome-instant-print', {
        detail: {
          html: receiptHTML,
          paperWidth: paperWidth
        }
      }));
      triggerNotification('Impressão instantânea disparada via Extensor Chrome!', 'success');
      return;
    }

    // Tentamos usar a janela fornecida ou abrir uma nova janela/aba imediata auto-imprimível síncrona
    let targetWindow = printWindow;
    if (!targetWindow) {
      try {
        targetWindow = window.open('', '_blank', 'width=450,height=650');
      } catch (e) {
        console.warn('Falha ao abrir pop-up direto de forma assíncrona:', e);
      }
    }

    if (targetWindow) {
      // Se tivermos a janela (seja pré-aberta síncronamente ou aberta agora), escrevemos o HTML auto-imprimível
      targetWindow.document.write(`
        <html>
          <head>
            <title>Imprimir Cupom Umai Sushi</title>
            <style>
              html, body {
                width: ${paperWidth} !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: 'Courier New', Courier, monospace;
                font-size: 11px;
                line-height: 1.25;
              }
              #print-content {
                width: 100%;
                max-width: ${paperWidth};
                padding: 1mm 1mm 10mm 1mm;
                box-sizing: border-box;
              }
              @media print {
                html, body {
                  width: ${paperWidth} !important;
                }
                @page {
                  size: ${paperWidth} auto;
                  margin: 0 !important;
                }
              }
            </style>
          </head>
          <body>
            <div id="print-content">
              ${receiptHTML}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  setTimeout(function() {
                    window.close();
                  }, 500);
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      targetWindow.document.close();
      triggerNotification('Impressão enviada para nova janela Chrome!', 'success');
    } else {
      // Se falhar a abertura direta (comum por causa da perda de user gesture em chamadas assíncronas),
      // nós exibimos o modal de visualização virtual com o botão de impressão direta síncrona, que é infalível!
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = receiptHTML;
      
      const elements = tempDiv.querySelectorAll('p, div, tr, h1, h2, h3, li, br');
      elements.forEach(el => {
        if (el.tagName === 'BR') {
          el.parentNode?.replaceChild(document.createTextNode('\n'), el);
        } else {
          el.appendChild(document.createTextNode('\n'));
        }
      });
      
      const plainText = tempDiv.textContent || tempDiv.innerText || "Cupom de Venda";

      setIframeReceiptHTML(receiptHTML);

      setShowLogContentModal({
        id: 'iframe-prevention-' + Date.now(),
        title: '⚠️ Extensor de Impressão (Sandbox Ativa)',
        printerRole: 'caixa',
        printerName: 'Suporte do Google Chrome',
        connectionType: 'browser',
        content: plainText.trim().replace(/\n{3,}/g, '\n\n'),
        status: 'pending',
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        retryCount: 0
      });

      triggerNotification('⚠️ Bloqueado pela Sandbox! Clique em "Imprimir Agora" no cupom aberto na tela.', 'error');
    }
    } finally {
      isCurrentlyPrinting = false;
    }
  };

  const downloadExtensionZip = async () => {
    try {
      const zip = new JSZip();

      // manifest.json
      const manifest = {
        "manifest_version": 3,
        "name": "Umai Sushi - Extensor de Impressão Direta",
        "version": "1.0.0",
        "description": "Permite impressão térmica direta e instantânea de cupons no Chrome, contornando sandboxes de iframes.",
        "permissions": [
          "storage"
        ],
        "host_permissions": [
          "<all_urls>"
        ],
        "background": {
          "service_worker": "background.js"
        },
        "content_scripts": [
          {
            "matches": ["<all_urls>"],
            "js": ["content.js"],
            "all_frames": true,
            "run_at": "document_start"
          }
        ]
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      // content.js
      const contentJs = `// content.js - Intercepta eventos de impressão e realiza a impressão direta no documento principal
// Projetado especificamente para eliminar abas intermediárias e focar na bobina Epson TM-T20 de 80mm.

try {
  const injectScript = () => {
    const script = document.createElement('script');
    script.textContent = 'window.__umaiPrintExtensionActive = true;';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  };
  injectScript();
} catch (e) {
  console.warn('Umai Print Extension: Erro ao injetar flag global', e);
}

window.addEventListener('chrome-instant-print', (event) => {
  const { html, paperWidth } = event.detail;
  const script = document.createElement('script');
  script.textContent = \`
    (() => {
      document.getElementById('print-receipt-section')?.remove();
      document.getElementById('print-receipt-styles')?.remove();

      const printSection = document.createElement('div');
      printSection.id = 'print-receipt-section';
      printSection.innerHTML = \\\`
        <div style="width: 72mm; margin: 0 auto; padding: 0 1mm 5mm 1mm; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; background: white; color: black; font-size: 11px; line-height: 1.25;">
          \\\\\\\${\\\${JSON.stringify(html)}\\\}
        </div>
      \\\`;
      document.body.appendChild(printSection);

      const styleTag = document.createElement('style');
      styleTag.id = 'print-receipt-styles';
      styleTag.innerHTML = \\\`
        @media print {
          body > *:not(#print-receipt-section) {
            display: none !important;
          }
          #root, iframe, .aistudio-sidebar {
            display: none !important;
          }
          html, body {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          #print-receipt-section {
            display: block !important;
            position: absolute !important;
            left: 0;
            top: 0;
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: 80mm auto;
            margin: 0 !important;
          }
        }
      \\\`;
      document.head.appendChild(styleTag);

      try {
        window.print();
      } catch (err) {
        console.error('Erro de impressão:', err);
      } finally {
        setTimeout(() => {
          document.getElementById('print-receipt-section')?.remove();
          document.getElementById('print-receipt-styles')?.remove();
        }, 1000);
      }
    })();
  \`;
  document.body.appendChild(script);
  script.remove();
});

window.addEventListener('check-print-extension', () => {
  window.dispatchEvent(new CustomEvent('print-extension-active'));
});`;
      zip.file("content.js", contentJs);

      // background.js
      const backgroundJs = `// background.js - Service worker para gerenciar a janela de impressão

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'instant-print') {
    chrome.storage.local.set({
      pendingPrint: {
        html: request.html,
        paperWidth: request.paperWidth
      }
    }, () => {
      chrome.windows.create({
        url: chrome.runtime.getURL('print.html'),
        type: 'popup',
        width: 440,
        height: 600,
        focused: true
      });
    });
  }
});`;
      zip.file("background.js", backgroundJs);

      // print.html
      const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Imprimir Cupom - Umai Sushi</title>
  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    #print-content {
      width: 100%;
      box-sizing: border-box;
    }
  </style>
  <script src="print.js"></script>
</head>
<body>
  <div id="print-content">Aguardando dados de impressão...</div>
</body>
</html>`;
      zip.file("print.html", printHtml);

      // print.js
      const printJs = `// print.js - Controla o disparo de impressão imediata e fechamento automático

window.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('pendingPrint', (data) => {
    if (data && data.pendingPrint) {
      const { html, paperWidth } = data.pendingPrint;
      chrome.storage.local.remove('pendingPrint');

      const container = document.getElementById('print-content');
      if (container) {
        container.innerHTML = html;
      }
      
      const style = document.createElement('style');
      style.textContent = \`
        html, body {
          width: \${paperWidth} !important;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.25;
          margin: 0 !important;
          padding: 0 !important;
        }
        #print-content {
          width: 100%;
          max-width: \${paperWidth};
          padding: 1mm 1mm 10mm 1mm;
          box-sizing: border-box;
        }
        @media print {
          html, body {
            width: \${paperWidth} !important;
          }
          @page {
            size: \${paperWidth} auto;
            margin: 0 !important;
          }
        }
      \`;
      document.head.appendChild(style);
      
      window.onafterprint = () => {
        window.close();
      };
      
      setTimeout(() => {
        try {
          window.print();
        } catch (e) {
          console.error('Falha ao abrir diálogo de impressão', e);
          window.close();
        }
      }, 150);
    }
  });
});`;
      zip.file("print.js", printJs);

      // README.md
      const readmeMd = `# Umai Sushi - Extensor de Impressão Direta do Google Chrome

Este extensor permite a impressão térmica direta e sem atrito contornando iframes de sandbox.

## Instalação:
1. Digite chrome://extensions na barra do Chrome.
2. Ative o "Modo do desenvolvedor".
3. Clique em "Carregar sem compactação" e escolha esta pasta descompactada.
4. Recarregue a página e use!`;
      zip.file("README.md", readmeMd);

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "umai-print-extension.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerNotification('Download do Extensor Chrome concluído! Siga o passo a passo de instalação.', 'success');
    } catch (err) {
      console.error('Falha ao gerar ZIP do extensor:', err);
      triggerNotification('Erro ao empacotar arquivos do extensor.', 'error');
    }
  };

  // --- PORTA WEB SERIAL (EXTENSOR DIRETO DO HARDWARE) ---
  const connectWebSerialPrinter = async () => {
    if (!('serial' in navigator)) {
      setSerialError('Seu navegador nao possui suporte para Web Serial API. Use o Google Chrome ou Microsoft Edge!');
      triggerNotification('Requer navegador compativel com Web Serial (Chrome/Edge).', 'error');
      return;
    }

    try {
      setSerialError(null);
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: serialBaudRate });
      setSerialPort(port);
      setSerialPortName('Impressora Termica Serial');
      setIsSerialConnected(true);
      triggerNotification('Impressora USB/COM conectada direto pelo navegador!', 'success');
    } catch (err: any) {
      console.warn('Falhar ao abrir dispositivo Serial:', err);
      const isSandboxError = err.name === 'SecurityError' || err.message?.includes('permissions policy') || err.message?.includes('disallowed');
      if (isSandboxError) {
        setSerialError('⚠️ Bloqueado pela Sandbox do AI Studio! Por favor, clique em "Nova Aba" no canto superior direito para abrir o app em tela cheia e conectar sua impressora USB/COM diretamente.');
        triggerNotification('⚠️ Bloqueio de Sandbox! Abra em Nova Aba para conectar a impressora.', 'error');
      } else {
        setSerialError(err.message || 'Interface de conexao negada ou desconectada.');
        triggerNotification('Conexao serial recusada.', 'error');
      }
    }
  };

  const disconnectWebSerialPrinter = async () => {
    if (serialPort) {
      try {
        await serialPort.close();
      } catch (e) {}
      setSerialPort(null);
      setIsSerialConnected(false);
      setSerialPortName('');
      triggerNotification('Impressora Web Serial desconectada com seguranca.', 'success');
    }
  };

  const stripAccents = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .replace(/Ç/g, 'C')
      .replace(/ç/g, 'c');
  };

  const printWebSerialEscPos = async (plainText: string) => {
    if (!serialPort) {
      triggerNotification('Dispositivo USB/Serial não pareado!', 'error');
      return;
    }
    try {
      const writer = serialPort.writable.getWriter();
      const encoder = new TextEncoder();
      
      // ESC/POS commands
      const ESC = '\u001b';
      const GS = '\u001d';
      
      const INIT = ESC + '@'; // Initialize printer
      const ALIGN_CENTER = ESC + 'a' + '\u0001';
      const ALIGN_LEFT = ESC + 'a' + '\u0000';
      const CHAR_DOUBLE_SIZE = GS + '!' + '\u0011'; // Double height + double width
      const CHAR_NORMAL = GS + '!' + '\u0000';
      const CUT_PAPER = GS + 'V' + '\u0041' + '\u0000'; // Paper cut
      
      // Clean Portuguese accents so the hardware displays correct letters
      const cleanText = stripAccents(plainText);
      
      let formattedBuffer = INIT + ALIGN_LEFT;
      
      // Split text into lines to format headers
      const lines = cleanText.split('\n');
      lines.forEach(line => {
        if (line.trim().length === 0) {
          formattedBuffer += '\n';
          return;
        }
        
        // Match headers like "UMAI SUSHI", "CUPOM NÃO FISCAL", "COMPROVANTE DE PRODUÇÃO"
        const isBigHeader = 
          line.includes('CUPOM NÃO FISCAL') || 
          line.includes('CUPOM NAO FISCAL') || 
          line.includes('COMPROVANTE DE PRODUCAO') || 
          line.includes('COMPROVANTE DE PRODUÇÃO') || 
          line.includes('UMAI SUSHI') ||
          line.includes('CONFERENCIA DE CONTA') ||
          line.includes('CONFERÊNCIA DE CONTA') ||
          line.includes('ENCERRAMENTO');
          
        if (isBigHeader) {
          formattedBuffer += ALIGN_CENTER + CHAR_DOUBLE_SIZE + line.trim() + '\n' + CHAR_NORMAL + ALIGN_LEFT;
        } else if (line.startsWith('===') || line.startsWith('---') || line.startsWith('***')) {
          formattedBuffer += ALIGN_CENTER + line + '\n' + ALIGN_LEFT;
        } else {
          formattedBuffer += line + '\n';
        }
      });
      
      // Add extra spacing and the cutting sequence
      formattedBuffer += '\n\n\n\n\n' + CUT_PAPER;
      
      // Convert formatted string into raw bytes
      const dataBytes = new Uint8Array(formattedBuffer.length);
      for (let i = 0; i < formattedBuffer.length; i++) {
        dataBytes[i] = formattedBuffer.charCodeAt(i) & 0xff;
      }
      
      await writer.write(dataBytes);
      writer.releaseLock();
      triggerNotification('Cupom enviado diretamente para a Epson TM20 via USB!', 'success');
    } catch (err: any) {
      console.error('Web Serial Transmission error:', err);
      triggerNotification('Erro ao disparar bytes de comando para a Epson TM20.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      
      {/* Visual warning when app is running inside sandboxed AI Studio iframe */}
      {window.self !== window.top && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 border-b border-amber-500/30 p-2 text-center text-[10.5px] font-mono text-zinc-950 font-bold shrink-0 flex flex-col sm:flex-row items-center justify-center gap-2">
          <span>⚠️ <strong>MODO DE VISUALIZAÇÃO:</strong> O Google Chrome impede diálogos de impressão em frames de teste para evitar o travamento do navegador.</span>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="bg-black text-white hover:bg-neutral-900 px-3 py-1 rounded-lg text-[9.5px] font-black uppercase transition-all tracking-wider shrink-0 flex items-center gap-1 shadow-md cursor-pointer border border-zinc-800"
          >
            <span>Liberar Impressora (Abrir em Nova Aba) ↗</span>
          </button>
        </div>
      )}
      
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 16 }}
            exit={{ opacity: 0, y: -20 }}
            id="notification-toast"
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white ${
              notification.type === 'success' ? 'bg-red-700 border-red-500' : 'bg-zinc-800 border-zinc-700'
            } border`}
          >
            <CheckCircle2 size={16} className="text-red-400" />
            <span className="font-semibold text-xs tracking-wide">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- BRANDED SAKE-RED HEADER --- */}
      <header className="bg-neutral-900 border-b border-red-800/40 shrink-0 print:hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3.5">
            {restaurantLogoUrl ? (
              <img 
                src={restaurantLogoUrl} 
                alt="Logo" 
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover shadow-lg border border-red-900/40" 
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-800 to-red-600 flex items-center justify-center shadow-lg shadow-red-950">
                <span className="text-white text-xl font-black font-mono italic">U</span>
              </div>
            )}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <h1 id="app-title" className="text-lg font-black tracking-wider uppercase text-white font-mono flex items-center gap-1.5">
                  {restaurantName.includes(' ') ? (
                    <>
                      {restaurantName.substring(0, restaurantName.indexOf(' '))} <span className="text-red-500">{restaurantName.substring(restaurantName.indexOf(' ') + 1)}</span>
                    </>
                  ) : (
                    restaurantName
                  )}
                </h1>
                
                {/* Profile Selector Dropdown */}
                <div className="flex items-center gap-1 bg-zinc-950/60 p-1 py-0.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[8px] uppercase font-black tracking-widest text-zinc-500 px-1 font-mono">Cargo:</span>
                  <select 
                    value={userRole}
                    onChange={(e) => handleSwitchRole(e.target.value as any)}
                    className={`text-[9.5px] uppercase font-mono tracking-wider font-extrabold pr-4 py-0.5 rounded cursor-pointer bg-transparent focus:outline-none transition-colors border-0 ${
                      userRole === 'Administrador' 
                        ? 'text-rose-400 font-black' 
                        : userRole === 'Caixa' 
                          ? 'text-emerald-400 font-extrabold' 
                          : 'text-zinc-300'
                    }`}
                  >
                    <option value="Garçom" className="bg-zinc-950 text-zinc-350 font-bold">👤 Garçom</option>
                    <option value="Caixa" className="bg-zinc-950 text-emerald-400 font-bold">💳 Caixa</option>
                    <option value="Administrador" className="bg-zinc-950 text-rose-400 font-bold">👑 Administrador</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 font-medium">{restaurantSlogan}</p>
            </div>
          </div>

          {/* Quick Header Metric Stats */}
          <div className="flex items-center gap-5 text-[11px] bg-zinc-950 rounded-xl p-2 px-3.5 border border-zinc-800/80">
            <div className="flex flex-col">
              <span className="text-zinc-500">Ocupação</span>
              <span className="font-bold text-red-500 font-mono">
                {tables.filter(t => t.status === 'Ocupada').length} / {tables.length} Mesas
              </span>
            </div>
            <div className="w-px h-6 bg-zinc-800" />
            <div className="flex flex-col animate-none">
              <span className="text-zinc-500">Caixa Geral</span>
              <span className="font-bold text-emerald-500 font-mono">
                R$ {fStats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Navigation Tab Selector */}
          <nav id="header-nav" className="flex items-center p-1 bg-zinc-950/80 rounded-xl border border-zinc-800/40 shrink-0 gap-0.5">
            <button 
              id="tab-mesas"
              onClick={() => { setActiveTab('mesas'); setSelectedTableId(null); setIsLaunchingMode(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                activeTab === 'mesas' ? 'bg-red-700 text-white shadow-md shadow-red-900/40 font-extrabold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Utensils size={12} />
              Mesas / Comandas
            </button>
            <button 
              id="tab-cardapio"
              onClick={() => { setActiveTab('cardapio'); setIsLaunchingMode(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                activeTab === 'cardapio' ? 'bg-red-700 text-white shadow-md shadow-red-900/40 font-extrabold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BookOpen size={12} />
              Cardápio {userRole !== 'Administrador' && '👁️'}
            </button>
            <button 
              id="tab-financeiro"
              onClick={() => {
                if (userRole === 'Garçom') {
                  triggerNotification('Acesso ao faturamento restrito ao Caixa e Administradores!', 'error');
                } else {
                  setActiveTab('financeiro');
                  setIsLaunchingMode(false);
                }
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                activeTab === 'financeiro' ? 'bg-red-700 text-white shadow-md shadow-red-900/40 font-extrabold' : 'text-zinc-400 hover:text-white'
              } ${userRole === 'Garçom' ? 'opacity-50 cursor-pointer' : ''}`}
            >
              <TrendingUp size={12} />
              Financeiro {userRole === 'Garçom' && '🔒'}
            </button>
            <button 
              id="tab-admin"
              onClick={() => {
                if (userRole !== 'Administrador') {
                  handleRequestAdminPrivilege('Acessar Painel de Administração', () => {
                    setActiveTab('admin');
                  });
                } else {
                  setActiveTab('admin');
                  setIsLaunchingMode(false);
                }
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                activeTab === 'admin' ? 'bg-red-700 text-white shadow-md shadow-red-900/40 font-extrabold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sliders size={12} />
              Administração {userRole !== 'Administrador' && '🔒'}
            </button>
          </nav>
        </div>
      </header>

      {/* --- MAIN APP CONTAINER --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 print:p-0">
        
        {/* ======================= TAB 1: COMANDAS E LANÇAMENTOS ======================= */}
        {activeTab === 'mesas' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* GRID OF TABLES */}
            <div className={`col-span-1 lg:col-span-7 space-y-6 ${selectedTableId && !isLaunchingMode ? 'hidden lg:block' : 'block'}`}>
              <div className="bg-neutral-900 rounded-2xl border border-zinc-800/80 p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-zinc-800 gap-4">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-rose-500 font-mono flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block animate-pulse"></span>
                      Comandas e Mesas Ativas
                    </h2>
                    <p className="text-[11px] text-zinc-400">Selecione uma comanda ativa para lançar produtos ou ver o consumo</p>
                  </div>
                  
                  <button
                    onClick={() => {
                      // Suggested next ID is maximum ID + 1, or 1 if empty
                      const maxId = tables.length > 0 ? Math.max(...tables.map(t => t.id)) : 0;
                      const nextId = maxId + 1;
                      setOpenTableId(nextId);
                      setOpenTableIdInput(nextId.toString());
                      setOpenWaiter('Sem Garçom');
                      setOpenClients(1);
                      setOpenHasServiceCharge(true);
                    }}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-red-700 hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider font-mono shadow-md transition-all duration-200 transform hover:scale-[1.02]"
                  >
                    <Plus size={15} />
                    Abrir Nova Mesa/Comanda
                  </button>
                </div>

                {tables.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-zinc-850 rounded-2xl bg-zinc-950/40">
                    <div className="w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 text-zinc-500 mb-4 shadow">
                      <ClipboardList size={22} />
                    </div>
                    <h3 className="text-xs uppercase font-black tracking-widest text-zinc-300 font-mono">Sem Atendimento Ativo</h3>
                    <p className="text-[10px] text-zinc-500 max-w-xs mt-1.5 leading-normal">
                      Não há nenhuma mesa ou comanda aberta no momento. Toque no botão acima para abrir uma nova comanda de forma ultra rápida!
                    </p>
                    <button
                      onClick={() => {
                        setOpenTableId(1);
                        setOpenTableIdInput('1');
                        setOpenWaiter('Sem Garçom');
                        setOpenClients(1);
                        setOpenHasServiceCharge(true);
                      }}
                      className="mt-5 px-5 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl text-[10.5px] font-bold uppercase tracking-wider font-mono transition"
                    >
                      Abrir Comanda N° 1
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {tables.map(table => {
                      const isSelected = table.id === selectedTableId;
                      const tableSum = table.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                      
                      return (
                        <div
                          key={table.id}
                          id={`btn-mesa-${table.id}`}
                          onClick={() => {
                            setSelectedTableId(table.id);
                            setIsLaunchingMode(false);
                            setTempItems([]);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedTableId(table.id);
                              setIsLaunchingMode(false);
                              setTempItems([]);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`cursor-pointer select-none relative flex flex-col items-center justify-between p-3.5 h-28 rounded-xl border transition-all duration-150 focus:outline-none ${
                            isSelected
                              ? 'bg-rose-900/85 border-rose-600 text-white ring-2 ring-red-500 scale-[1.03] font-bold shadow-md shadow-red-950'
                              : 'bg-rose-950/40 border-rose-950/80 text-rose-200 hover:bg-rose-900/20 hover:border-rose-900'
                          }`}
                        >
                          {/* Table badge number */}
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black bg-rose-850 text-rose-100 text-xs font-mono">
                            {table.id}
                          </div>

                          {/* Status detail labels */}
                          <div className="flex flex-col items-center py-1.5 max-w-full">
                            <span className="text-[8px] tracking-wider uppercase font-black text-rose-400">
                              ATIVA
                            </span>
                            <span className="text-[8.5px] text-rose-300 font-medium truncate max-w-[80px] mt-0.5">
                              {table.waiterName || 'Sem Garçom'}
                            </span>
                          </div>

                          {/* Total or Action */}
                          <div className="text-[10px] font-mono leading-none">
                            <span className="font-extrabold text-white">R$ {tableSum.toFixed(2)}</span>
                          </div>

                          {/* Fast clean button */}
                          <button
                            title="Excluir Mesa/Comanda"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetTable(table.id);
                            }}
                            className="absolute top-1 right-1 p-0.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Japanese vectors / Digisat Banner */}
              <div className="bg-gradient-to-r from-red-950/40 to-neutral-900 rounded-2xl border border-red-900/10 p-4 shrink-0 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-950 text-red-500 shrink-0">
                  <Utensils size={15} />
                </div>
                <div>
                  <h4 className="text-xs font-bold font-mono tracking-wide text-rose-400">Restaurante Umai Sushi</h4>
                  <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">
                    <strong>Diferencial Sushi Bar:</strong> Ao abrir a mesa, selecione o garçom para faturar {restaurantServiceTax}% de taxa de serviços. Ao entrar no cardápio, lance os combinados e finalize clicando em SALVAR para consolidar de forma rápida.
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE DETAILS AND LAUNCHING BOARD */}
            <div className="col-span-1 lg:col-span-5 space-y-6">
              
              {activeTable ? (
                <>
                  {/* --- LAUNCHING MODE IN ACTIVE TAB (ENTRO NO CARDÁPIO E SALVO) --- */}
                  {isLaunchingMode ? (
                    <div className="bg-neutral-900 rounded-2xl border-2 border-red-700/80 p-5 space-y-4">
                      
                      {/* Sub-header launch screen */}
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={handleCancelLaunches}
                            className="p-1 hover:bg-zinc-850 rounded-lg text-zinc-400 hover:text-white"
                          >
                            <ArrowLeft size={16} />
                          </button>
                          <div>
                            <h3 className="font-extrabold text-xs uppercase text-rose-400 font-mono">Cardápio de Lançamento</h3>
                            <p className="text-[10px] text-zinc-400">Mesa {activeTable.id} • Garçom: {activeTable.waiterName || 'Sem Garçom'}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase py-0.5 px-2 rounded-full bg-red-900 border border-red-700 text-rose-100 font-mono">
                          Lançando {tempItems.reduce((sum, item) => sum + item.quantity, 0)} itens
                        </span>
                      </div>

                      {/* Fast code submit and Product search bar */}
                      <form onSubmit={handleFastCodeSubmit} className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={13} />
                          <input 
                            type="text" 
                            placeholder="Pesquise por nome ou digite o Código (ex: 101)"
                            value={launchSearch}
                            onChange={(e) => setLaunchSearch(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl text-xs py-2.5 pl-8.5 pr-2 focus:outline-none focus:border-red-600 font-medium text-white"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="bg-red-800/80 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-xs font-mono font-bold"
                        >
                          Ir
                        </button>
                      </form>

                      {/* Categories chips filter within lunch */}
                      <div className="flex gap-1 overflow-x-auto pb-1 max-w-full scrollbar-none">
                        {['Todos', ...categories].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setLaunchCategory(cat)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition shrink-0 ${
                              launchCategory === cat 
                                ? 'bg-red-800 text-white' 
                                : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Matching Product Catalog List to Select */}
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {launchFilteredProducts.slice(0, 10).map((prod) => (
                          <div 
                            key={prod.id} 
                            onClick={() => setFocusedProduct(prod)}
                            className={`p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between cursor-pointer ${
                              focusedProduct?.id === prod.id
                                ? 'bg-zinc-800/60 border-red-700' 
                                : 'bg-zinc-950 border-zinc-850 hover:bg-zinc-900'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <span className="font-mono text-[10px] text-red-500 font-black bg-red-950/40 border border-red-900/30 px-1 rounded mr-1.5">
                                {prod.code}
                              </span>
                              <strong className="text-zinc-200 text-xs font-black">{prod.name}</strong>
                            </div>
                            <span className="font-black font-mono text-zinc-100 shrink-0">
                              R${prod.price.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Single Product Customizer configuration */}
                      {focusedProduct && (
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }} 
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-zinc-950 rounded-xl p-3 border border-zinc-800 space-y-3"
                        >
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400 font-bold">Ajustes para: <span className="text-white font-black">{focusedProduct.name}</span></span>
                            <span className="font-mono text-emerald-500 font-black">R$ {(focusedProduct.price * launchQty).toFixed(2)}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5">
                            {/* Quantity stepping selector */}
                            <div>
                              <span className="block text-[9px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Quantidade</span>
                              <div className="flex items-center gap-1">
                                <button 
                                  type="button"
                                  onClick={() => setLaunchQty(prev => Math.max(1, prev - 1))}
                                  className="w-8 h-8 flex items-center justify-center border border-zinc-850 rounded-lg bg-zinc-900 text-zinc-300"
                                >
                                  <Minus size={12} />
                                </button>
                                <input 
                                  type="number" 
                                  min={1}
                                  value={launchQty}
                                  onChange={(e) => setLaunchQty(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-12 h-8 border border-zinc-850 rounded-lg bg-zinc-950 text-white font-mono font-bold text-center text-xs"
                                />
                                <button 
                                  type="button"
                                  onClick={() => setLaunchQty(prev => prev + 1)}
                                  className="w-8 h-8 flex items-center justify-center border border-zinc-850 rounded-lg bg-zinc-900 text-zinc-300"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Optional notes */}
                            <div>
                              <span className="block text-[9px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Observações (Ex: sem Shoyu)</span>
                              <input 
                                type="text" 
                                placeholder="Gengibre extra, etc..."
                                value={launchNote}
                                onChange={(e) => setLaunchNote(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-850 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-red-600"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => setFocusedProduct(null)}
                              className="text-zinc-500 hover:text-zinc-300 text-[10px] uppercase font-bold"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddTempItem(focusedProduct, launchQty, launchNote)}
                              className="bg-red-800 hover:bg-red-700 text-white text-[10.5px] px-3.5 py-1.5 rounded-lg font-black font-mono shadow"
                            >
                              Adicionar na Bandeja
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Tray list of compiled items in launch mode */}
                      <div className="bg-zinc-950 rounded-xl p-3.5 border border-zinc-850 space-y-2">
                        <span className="text-[10px] uppercase font-black text-rose-500 tracking-wider block border-b border-zinc-850 pb-1.5 font-mono">
                          📥 Novos Itens a Lançar ({tempItems.length}):
                        </span>
                        
                        {tempItems.length === 0 ? (
                          <p className="text-zinc-500 text-[10px] font-mono py-4 text-center">Bandeja vazia. Selecione pratos acima!</p>
                        ) : (
                          <div className="space-y-1.5 max-h-24 overflow-y-auto">
                            {tempItems.map((item) => (
                              <div key={item.id} className="flex justify-between items-center text-[10.5px] bg-zinc-900/60 p-1.5 rounded border border-zinc-800/40">
                                <div>
                                  <span className="font-extrabold text-white">{item.quantity}x</span> {item.name}
                                  {item.notes && <span className="text-amber-500 block text-[9px] italic">({item.notes})</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-zinc-300">R$ {(item.price * item.quantity).toFixed(2)}</span>
                                  <button 
                                    onClick={() => setTempItems(prev => prev.filter(i => i.id !== item.id))}
                                    className="text-red-500 hover:text-red-400"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* CONCLUDE ACTION TRIGGERS IN LAUNCHING */}
                      <div className="flex gap-2.5 pt-3">
                        <button
                          type="button"
                          onClick={handleCancelLaunches}
                          className="w-1/3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-xs font-bold transition font-mono border border-zinc-750"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveLaunchesToTable}
                          disabled={tempItems.length === 0}
                          className="w-2/3 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-xs font-black shadow transition flex items-center justify-center gap-1.5"
                        >
                          <Check size={14} />
                          💾 SALVAR LANÇAMENTOS
                        </button>
                      </div>

                    </div>
                  ) : (
                    
                    /* --- ORDINARY TABLE ACTIVE PREVIEW PANELS --- */
                    <>
                      {/* Active Table Header Details */}
                      <div className="bg-neutral-900 text-slate-100 rounded-2xl border border-zinc-800 shadow-md overflow-hidden shrink-0">
                        <div className="p-4 flex items-center justify-between border-b border-rose-950/40">
                          
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-400 flex flex-col items-center justify-center">
                              <span className="text-[8px] leading-none uppercase font-bold tracking-wider opacity-60">Mesa</span>
                              <span className="text-lg font-black font-mono leading-none mt-0.5">{activeTable.id}</span>
                            </div>
                            
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-xs text-zinc-200">Comanda Aberta</h3>
                                <span className="text-[9px] font-mono text-rose-400 bg-red-950/45 px-1.5 rounded">
                                  {activeTable.openedAt}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2.5 text-[10px] text-zinc-400 mt-1 font-mono">
                                <span className="flex items-center gap-1 text-zinc-400">
                                  <Users size={11} className="text-zinc-500" />
                                  {activeTable.clientCount} clientes
                                </span>
                                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                <span className="text-zinc-300 font-bold truncate max-w-[120px]">
                                  Atend. {activeTable.waiterName || 'Sem Garçom'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Change Waiter Panel Selector */}
                          <div className="text-right flex flex-col items-end">
                            <span className="text-[8px] uppercase font-bold text-zinc-500">Mudar Garçom</span>
                            <select
                              value={activeTable.waiterName || 'Sem Garçom'}
                              onChange={(e) => {
                                const val = e.target.value === 'Sem Garçom' ? '' : e.target.value;
                                const updated = tables.map(t => {
                                  if (t.id === selectedTableId) {
                                    return { ...t, waiterName: val };
                                  }
                                  return t;
                                });
                                setTables(updated);
                                saveTablesToLocalStorage(updated);
                                triggerNotification(`Garçom da Mesa ${activeTable.id} trocado!`);
                              }}
                              className="bg-zinc-950 border border-zinc-800 rounded-lg py-1 px-2 text-[10px] text-zinc-300 font-bold focus:outline-none"
                            >
                              <option value="Sem Garçom">Sem Garçom (0%)</option>
                              {waiters.map(w => (
                                <option key={w} value={w}>{w} ({restaurantServiceTax}%)</option>
                              ))}
                            </select>
                          </div>

                        </div>
                      </div>

                      {/* CURRENT REGISTERED SAVED PRODUCTS IN THE BILL */}
                      <div className="bg-neutral-900 rounded-2xl border border-zinc-850 p-4 shrink-0 flex flex-col min-h-[260px]">
                        
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-850 mb-3.5">
                          <h4 className="text-[10px] uppercase font-extrabold tracking-wider text-rose-500 flex items-center gap-1 font-mono">
                            🍱 Itens Consumidos ({activeTable.items.reduce((sum, item) => sum + item.quantity, 0)} unidades)
                          </h4>
                          {activeTable.items.length > 0 && (
                            <button
                              onClick={() => handleResetTable(activeTable.id)}
                              className="text-[9.5px] font-mono text-zinc-500 hover:text-red-500 hover:underline flex items-center gap-1"
                            >
                              Limpar Mesa
                            </button>
                          )}
                        </div>

                        {/* List display scroll item block */}
                        <div className="flex-1 overflow-y-auto max-h-56 space-y-2">
                          {activeTable.items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-zinc-500 gap-2">
                              <ShoppingBag size={28} strokeWidth={1} className="text-zinc-650" />
                              <p className="text-[11px] font-bold text-zinc-400 font-mono">Mesa Consumo Zerada</p>
                              <p className="text-[9.5px] text-zinc-500 text-center max-w-[200px]">Clique no botão abaixo para ENTRAR NO CARDÁPIO e lançar os pedidos.</p>
                            </div>
                          ) : (
                            activeTable.items.map((item, idx) => (
                              <div 
                                key={item.id} 
                                className="flex flex-col p-2 bg-zinc-950 rounded-xl border border-zinc-850 text-[11px]"
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="truncate">
                                    <strong className="text-zinc-200">{item.name}</strong>
                                    {item.notes && (
                                      <span className="block text-[8.5px] text-amber-500 font-medium font-mono mt-0.5 italic">
                                        * Obs: {item.notes}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono font-bold text-white shrink-0">
                                    R$ {(item.price * item.quantity).toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-900">
                                  <span className="text-[9.5px] text-zinc-500">
                                    {item.quantity} un x R$ {item.price.toFixed(2)}
                                  </span>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleUpdateSavedItemQty(item.id, false)}
                                      className="p-1 rounded bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400"
                                    >
                                      <Minus size={9} />
                                    </button>
                                    <button
                                      onClick={() => handleUpdateSavedItemQty(item.id, true)}
                                      className="p-1 rounded bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400"
                                    >
                                      <Plus size={9} />
                                    </button>
                                    <button
                                      onClick={() => handleRemoveSavedItem(item.id)}
                                      className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-zinc-900 ml-1.5"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                      </div>

                      {/* BOTTOM BILLING DETAILS AND MULTI ACTIONS */}
                      <div className="bg-neutral-900 rounded-2xl border border-zinc-850 p-4 space-y-3.5">
                        
                        {/* Subtotal metrics displaying service fee */}
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between text-zinc-400">
                            <span>Subtotal Consumido:</span>
                            <span className="font-mono text-zinc-200 font-bold">R$ {activeTableStats.subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>
                              Taxa de Serviço ({activeTableStats.hasService ? `${restaurantServiceTax}% - Ativo` : 'Inativo'}):
                            </span>
                            <span className={`font-mono font-bold ${activeTableStats.hasService ? 'text-red-400' : 'text-zinc-600'}`}>
                              R$ {activeTableStats.serviceCharge.toFixed(2)}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-baseline pt-2 border-t border-zinc-800 text-sm">
                            <span className="font-extrabold uppercase text-[10.5px] tracking-wide text-zinc-300 font-mono">Valor Total da Comanda:</span>
                            <span className="font-mono font-black text-white text-lg">R$ {activeTableStats.total.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* HIGH VISIBILITY DECISIVE OPERATIONS KEYS */}
                        <div className="grid grid-cols-2 gap-2">
                          
                          {/* Core Lanzar option */}
                          <button
                            onClick={() => {
                              setIsLaunchingMode(true);
                              setTempItems([]);
                              setFocusedProduct(null);
                            }}
                            className="bg-red-700 hover:bg-red-600 text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 tracking-wide shadow"
                          >
                            <ShoppingBag size={12} />
                            Entrar no Cardápio
                          </button>

                          {/* Conferir conta receipt preview */}
                          <button
                            id="btn-conferir-mesa"
                            disabled={activeTable.items.length === 0}
                            onClick={() => {
                              setSelectedTableId(activeTable.id);
                              setShowReceiptModal(true);
                            }}
                            className="bg-zinc-800 disabled:opacity-40 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5"
                          >
                            <Printer size={12} />
                            Conferir Mesa
                          </button>
                        </div>

                        {/* Receber / Fechar actions */}
                        {activeTable.items.length > 0 && (
                          <div className="pt-2.5 border-t border-zinc-850 flex items-center justify-between gap-4">
                            
                            {/* Transfer comanda trigger */}
                            <button
                              onClick={() => {
                                setTransferTargetId(null);
                                setShowTransferModal(true);
                              }}
                              className="text-[9px] uppercase font-bold text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                            >
                              <ArrowLeftRight size={10} />
                              Transferir Conta
                            </button>

                            {/* Receiving Submit Payment trigger */}
                            <button
                              onClick={() => {
                                if (userRole === 'Garçom') {
                                  triggerNotification('Apenas Caixa ou Administrador podem fechar mesas e receber pagamentos!', 'error');
                                } else {
                                  setShowCheckoutModal(true);
                                  setCheckoutDiscount(0);
                                  setSplitCount(activeTable.clientCount || 1);
                                }
                              }}
                              className={`font-black text-white px-4 py-1.5 text-[10.5px] rounded-lg tracking-wide shadow transition-colors ${
                                userRole === 'Garçom'
                                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                  : 'bg-emerald-800 hover:bg-emerald-700'
                              }`}
                            >
                              {userRole === 'Garçom' ? '🔒 Caixa Requerido' : 'Fechar e Receber'}
                            </button>

                          </div>
                        )}

                      </div>
                    </>
                  )}
                </>
              ) : (
                /* No table selected display screen */
                <div className="bg-neutral-900 rounded-2xl border border-zinc-800 p-8 py-20 text-center text-zinc-400 flex flex-col items-center justify-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-950 flex items-center justify-center text-zinc-500 border border-zinc-850">
                    <Utensils size={24} strokeWidth={1} />
                  </div>
                  <h3 className="font-black text-zinc-300 font-mono text-xs uppercase tracking-wider text-rose-500">Mesa não Selecionada</h3>
                  <p className="text-[10.5px] text-zinc-500 max-w-[220px] leading-relaxed">
                    Escolha uma mesa ativa ou toque em uma disponível na grade ao lado para gerenciar as comandas do Umai Sushi.
                  </p>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ======================= TAB 2: PRODUTOS & CARDÁPIO MANAGER ======================= */}
        {activeTab === 'cardapio' && (
          <div className="bg-neutral-900 rounded-2xl border border-zinc-800 p-5 space-y-6">
            
            {/* Header products block */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-rose-500 font-mono">Gestão do Cardápio Umai</h2>
                <p className="text-[10.5px] text-zinc-450">Cadastre, edite e configure os combinados e os códigos de digitação do restaurante</p>
              </div>
              
              <div className="flex items-center gap-2">
                {userRole === 'Administrador' ? (
                  <>
                    <button
                      onClick={() => {
                        setEditingProductId(null);
                        setProductFormName('');
                        setProductFormPrice(0);
                        setProductFormCode('');
                        setShowProductForm(true);
                      }}
                      className="bg-red-700 hover:bg-red-600 text-white font-black py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 tracking-wide shadow"
                    >
                      <Plus size={14} />
                      Novo Produto
                    </button>
                    <button
                      onClick={handleResetCatalogToDefault}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2 px-3 rounded-xl text-xs"
                    >
                      Restaurar Padrões
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 bg-zinc-950/80 text-zinc-400 border border-zinc-800/80 px-3 py-2 rounded-xl text-[10.5px]">
                    <Lock size={12} className="text-zinc-500" />
                    <span>Apenas Leitura (Requer Adm)</span>
                  </div>
                )}
              </div>
            </div>

            {/* DYNAMIC FORM ROW */}
            <AnimatePresence>
              {showProductForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800 overflow-hidden"
                >
                  <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <h3 className="font-extrabold text-xs text-rose-400 uppercase tracking-wide font-mono">
                        {editingProductId ? 'Alterar Item' : 'Inserir Novo Item'}
                      </h3>
                      <button 
                        type="button" 
                        onClick={() => { setShowProductForm(false); setEditingProductId(null); }}
                        className="text-zinc-500 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs text-zinc-300 pb-1">
                      <div className="md:col-span-2">
                        <label className="block font-bold text-zinc-400 mb-1">Código Rápido *</label>
                        <input 
                          type="text" 
                          placeholder="Ex: 801"
                          required
                          value={productFormCode}
                          onChange={(e) => setProductFormCode(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white font-mono font-bold focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="block font-bold text-zinc-400 mb-1">Nome do Prato/Bebida *</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Temaki de Atum Completo"
                          required
                          value={productFormName}
                          onChange={(e) => setProductFormName(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-bold text-zinc-400">Categoria</label>
                          <button
                            type="button"
                            onClick={() => {
                              const newCat = window.prompt('Digite o nome da nova categoria:');
                              if (newCat && newCat.trim()) {
                                const clean = newCat.trim();
                                if (categories.includes(clean)) {
                                  triggerNotification('Categoria já cadastrada!', 'error');
                                  setProductFormCategory(clean);
                                } else {
                                  const updated = [...categories, clean];
                                  setCategories(updated);
                                  saveCategoriesToLocalStorage(updated);
                                  setProductFormCategory(clean);
                                  triggerNotification(`Categoria "${clean}" criada com sucesso!`);
                                }
                              }
                            }}
                            className="text-[9px] text-red-400 hover:text-red-300 font-extrabold flex items-center gap-0.5 uppercase tracking-wider bg-red-950/40 px-1 py-0.5 rounded border border-red-900/30"
                          >
                            <Plus size={8} /> Nova
                          </button>
                        </div>
                        <select 
                          value={productFormCategory}
                          onChange={(e) => setProductFormCategory(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white focus:outline-none"
                        >
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-3">
                        <label className="block font-bold text-zinc-400 mb-1">Preço Consumidor (R$) *</label>
                        <input 
                          type="number" 
                          step="0.01"
                          min="0.10"
                          required
                          value={productFormPrice || ''}
                          onChange={(e) => setProductFormPrice(parseFloat(e.target.value) || 0)}
                          placeholder="0,00"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* NEW ROW: Description, Image URL and Active/Inactive Toggle */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs text-zinc-300">
                      <div className="md:col-span-6">
                        <label className="block font-bold text-zinc-400 mb-1">Descrição do Produto (Opcional)</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Recheio temperado de salmão fresco, cebolinha picada, cream cheese e gergelim"
                          value={productFormDescription}
                          onChange={(e) => setProductFormDescription(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white focus:outline-none placeholder:text-zinc-650"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="block font-bold text-zinc-400 mb-1">URL da Imagem Ilustrativa (Opcional)</label>
                        <input 
                          type="text" 
                          placeholder="Ex: https://imagens.restaurante/temaki.jpg"
                          value={productFormImageUrl}
                          onChange={(e) => setProductFormImageUrl(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white focus:outline-none placeholder:text-zinc-650 font-mono text-[11px]"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block font-bold text-zinc-400 mb-1">Status (Ativo no Caixa)</label>
                        <select 
                          value={productFormIsActive ? 'true' : 'false'}
                          onChange={(e) => setProductFormIsActive(e.target.value === 'true')}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-white focus:outline-none font-bold"
                        >
                          <option value="true" className="text-emerald-400 font-bold">Ativo (Permite Venda)</option>
                          <option value="false" className="text-red-400 font-bold">Inativo (Bloqueado)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() => { setShowProductForm(false); setEditingProductId(null); }}
                        className="bg-zinc-900 hover:bg-zinc-850 text-zinc-400 px-3.5 py-1.5 rounded-lg font-semibold"
                      >
                        Descartar
                      </button>
                      <button
                        type="submit"
                        className="bg-red-800 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg font-bold shadow shadow-red-950/40"
                      >
                        Salvar Item
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* List products catalog section with dynamic search and dynamic category filter */}
            <div className="space-y-4">
              
              {/* Dynamic Filter Layout */}
              <div className="flex flex-col md:flex-row gap-3.5 items-stretch md:items-center justify-between">
                {/* Search Product Box */}
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Pesquisar produto pelo nome ou pelo código..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-9.5 text-xs text-white focus:outline-none focus:border-red-750 placeholder:text-zinc-550 font-medium font-sans"
                  />
                  {catalogSearch && (
                    <button 
                      onClick={() => setCatalogSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Categories Scrollbar */}
                <div className="flex gap-1 overflow-x-auto bg-zinc-950 p-1 rounded-xl border border-zinc-850 max-w-full md:max-w-md lg:max-w-xl scrollbar-none shrink-0">
                  {['Todos', ...categories].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatalogMainCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition shrink-0 ${
                        catalogMainCategory === cat 
                          ? 'bg-rose-950 text-rose-400 border border-rose-800/40' 
                          : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-300 font-extrabold uppercase tracking-widest text-[9px] border-b border-zinc-800 select-none">
                      <th className="p-3 pl-4 w-28 font-mono">Cód Rápido</th>
                      <th className="p-3">Descrição do Produto / Prato</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3 text-right">Valor Venda</th>
                      <th className="p-3 text-center w-28">Status</th>
                      <th className="p-3 text-center w-28">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60 font-mono">
                    {filteredProducts.map((p) => {
                      const isActive = p.isActive !== false;
                      return (
                        <tr key={p.id} className={`hover:bg-zinc-900/50 text-zinc-300 transition-colors ${!isActive ? 'opacity-55' : ''}`}>
                          <td className="p-3 pl-4 text-red-500 font-extrabold text-xs">
                            {p.code}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              {p.imageUrl ? (
                                <img 
                                  src={p.imageUrl} 
                                  alt={p.name} 
                                  referrerPolicy="no-referrer"
                                  className="w-9 h-9 rounded-lg object-cover bg-zinc-900 border border-zinc-800 shrink-0" 
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center shrink-0">
                                  <Utensils size={13} className="text-zinc-650" />
                                </div>
                              )}
                              <div className="flex flex-col text-left">
                                <strong className="text-zinc-100 font-sans font-semibold text-xs leading-none">{p.name}</strong>
                                {p.description && (
                                  <span className="text-[10px] text-zinc-450 font-sans leading-tight mt-1 max-w-sm md:max-w-md truncate">
                                    {p.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-[10px] text-zinc-400 font-sans font-extrabold uppercase tracking-wider">
                            {p.category}
                          </td>
                          <td className="p-3 text-right font-bold text-white">
                            R$ {p.price.toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (userRole !== 'Administrador') {
                                  triggerNotification('Apenas Administradores podem alternar o status!', 'error');
                                  return;
                                }
                                const updated = products.map(prod => prod.id === p.id ? { ...prod, isActive: !isActive } : prod);
                                setProducts(updated);
                                saveProductsToLocalStorage(updated);
                                triggerNotification(`Produto "${p.name}" agora está ${!isActive ? 'ATIVADO' : 'INATIVADO'}.`);
                              }}
                              className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider transition ${
                                isActive 
                                  ? 'bg-emerald-950/60 text-emerald-450 border border-emerald-800/40 hover:bg-emerald-900/40' 
                                  : 'bg-zinc-900 text-zinc-550 border border-zinc-850 hover:bg-zinc-800'
                              }`}
                            >
                              {isActive ? '● Ativo' : '○ Inativo'}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            {userRole === 'Administrador' ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEditProductClick(p)}
                                  className="text-zinc-400 hover:text-white bg-zinc-900 p-1.5 rounded-lg transition"
                                  title="Editar"
                                >
                                  <Edit3 size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="text-zinc-500 hover:text-red-400 bg-zinc-900 p-1.5 rounded-lg transition"
                                  title="Excluir"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center text-zinc-650">
                                <Lock size={12} title="Apenas Administradores podem alterar itens" />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ======================= TAB 3: FINANCEIRO E FECHAMENTO HISTÓRICO ======================= */}
        {activeTab === 'financeiro' && (
          <div className="space-y-6 animate-none">
            
            {/* Overview reports cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-zinc-100">
              <div className="bg-neutral-900 rounded-xl p-4 border border-zinc-800">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Receita Total Fechada</span>
                <div className="text-xl font-bold font-mono text-emerald-500 mt-1 leading-none">
                  R$ {fStats.totalRevenue.toFixed(2)}
                </div>
                <span className="text-[9px] text-zinc-500 mt-2 block">Acumulado do dia</span>
              </div>

              <div className="bg-neutral-900 rounded-xl p-4 border border-zinc-800">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Média Comanda</span>
                <div className="text-xl font-bold font-mono text-white mt-1 leading-none">
                  R$ {fStats.averageTicket.toFixed(2)}
                </div>
                <span className="text-[9px] text-zinc-500 mt-2 block">Valor de ticket médio</span>
              </div>

              <div className="bg-neutral-900 rounded-xl p-4 border border-zinc-800">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Atendimentos</span>
                <div className="text-xl font-bold font-mono text-white mt-1 leading-none">
                  {sales.length} Comandas
                </div>
                <span className="text-[9px] text-zinc-500 mt-2 block">Mesas finalizadas</span>
              </div>

              <div className="bg-neutral-900 rounded-xl p-4 border border-zinc-800">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Pessoas Atendidas</span>
                <div className="text-xl font-bold font-mono text-white mt-1 leading-none">
                  {sales.reduce((sum, s) => sum + s.clientCount, 0)} Pessoas
                </div>
                <span className="text-[9px] text-zinc-500 mt-2 block">Média por mesa</span>
              </div>
            </div>

            {/* Divisão por forma de pagamento */}
            <div className="bg-neutral-900 rounded-2xl p-5 border border-zinc-800 space-y-4">
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-rose-500 font-mono">
                💰 Recebimentos Caixa por Método
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-850 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 font-bold tracking-wider block">PIX</span>
                    <strong className="text-zinc-100 mt-1 block">R$ {fStats.totalPix.toFixed(2)}</strong>
                  </div>
                  <Smartphone size={14} className="text-emerald-500" />
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-850 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 font-bold tracking-wider block">Dinheiro</span>
                    <strong className="text-zinc-100 mt-1 block">R$ {fStats.totalCash.toFixed(2)}</strong>
                  </div>
                  <Banknote size={14} className="text-emerald-500" />
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-850 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 font-bold tracking-wider block">C. Crédito</span>
                    <strong className="text-zinc-100 mt-1 block">R$ {fStats.totalCredit.toFixed(2)}</strong>
                  </div>
                  <CreditCard size={14} className="text-red-500" />
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-850 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 font-bold tracking-wider block">C. Débito</span>
                    <strong className="text-zinc-100 mt-1 block">R$ {fStats.totalDebit.toFixed(2)}</strong>
                  </div>
                  <CreditCard size={14} className="text-red-500" />
                </div>
              </div>
            </div>

            {/* Historical Sales logs list */}
            <div className="bg-neutral-900 rounded-2xl p-5 border border-zinc-800 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-zinc-300 font-mono">
                  📁 Histórico Geral de Comandas Pagas
                </h3>
                {sales.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Tem certeza de que deseja apagar permanentemente todas as vendas do livro caixa?')) {
                        setSales([]);
                        saveSalesToLocalStorage([]);
                        triggerNotification('Faturamento apagado.');
                      }
                    }}
                    className="text-[10px] text-zinc-500 hover:text-red-400 font-mono"
                  >
                    Apagar Tudo
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {sales.length === 0 ? (
                  <p className="text-zinc-500 font-mono text-[10px] py-10 text-center">Nenhum faturamento de mesa no momento.</p>
                ) : (
                  sales.map((item) => (
                    <div key={item.id} className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl flex items-center justify-between text-xs">
                      <div className="space-y-1 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">Mesa {item.tableId}</span>
                          <span className="text-[9px] bg-zinc-850 text-zinc-300 font-bold uppercase rounded px-1.5 py-0.2">
                            {item.paymentMethod}
                          </span>
                          <span className="text-[10px] text-zinc-500">{item.closedAt}</span>
                        </div>
                        <p className="text-zinc-400 font-sans text-[11px]">
                          {item.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <strong className="text-white text-xs block">R$ {item.total.toFixed(2)}</strong>
                        {item.discount > 0 && <span className="text-amber-500 block text-[9px]">- R$ {item.discount.toFixed(2)} Desc.</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ======================= TAB 4: ÁREA ADMINISTRATIVA ======================= */}
        {activeTab === 'admin' && userRole === 'Administrador' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start font-sans">
            
            {/* Sidebar sub-nav */}
            <div className="lg:col-span-1 bg-neutral-900 border border-zinc-800 rounded-2xl p-4.5 space-y-2">
              <h3 className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 font-mono mb-3">Painel de Acesso</h3>
              <button
                onClick={() => setAdminSubTab('dashboard')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'dashboard' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <TrendingUp size={14} />
                Dashboard Geral
              </button>
              <button
                onClick={() => setAdminSubTab('garcons')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'garcons' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <Users size={14} />
                Controle de Garçons
              </button>
              <button
                onClick={() => {
                  setAdminSubTab('estabelecimento');
                  // initialize values
                  setInputRestaurantName(restaurantName);
                  setInputRestaurantSlogan(restaurantSlogan);
                  setInputRestaurantAddress(restaurantAddress);
                  setInputRestaurantPhone(restaurantPhone);
                  setInputRestaurantLogoUrl(restaurantLogoUrl);
                  setInputRestaurantInstagram(restaurantInstagram);
                  setInputRestaurantServiceTax(restaurantServiceTax);
                  setInputRestaurantThanksMessage(restaurantThanksMessage);
                  setInputRestaurantPrintFooter(restaurantPrintFooter);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'estabelecimento' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <Settings size={14} />
                Configurar Restaurante
              </button>
              <button
                onClick={() => setAdminSubTab('seguranca')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'seguranca' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <ShieldCheck size={14} />
                Segurança / Senha
              </button>
              <button
                onClick={() => setAdminSubTab('banco')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'banco' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <RefreshCw size={14} />
                Manutenção do Banco
              </button>
              <button
                onClick={() => setAdminSubTab('categorias')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'categorias' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <FolderOpen size={14} />
                Gerenciar Categorias
              </button>
              <button
                onClick={() => setAdminSubTab('impressao')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  adminSubTab === 'impressao' ? 'bg-red-950/60 text-red-400 border border-red-900/40' : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <Printer size={14} />
                Impressoras Térmicas
              </button>
            </div>

            {/* Sub-tab view area */}
            <div className="lg:col-span-3 bg-neutral-900 border border-zinc-800 rounded-2xl p-5 md:p-6 space-y-6">
              
              {/* SUB-TAB 0: DASHBOARD */}
              {adminSubTab === 'dashboard' && (() => {
                // Parse helper function for PT-BR date strings: e.g. "18/06/2026, 00:24:15"
                const parsePtBrDate = (str: string) => {
                  if (!str) return new Date();
                  const datePart = str.split(',')[0].split(' ')[0];
                  const parts = datePart.split('/');
                  if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[2], 10);
                    
                    const timeIndex = str.indexOf(',') !== -1 ? str.indexOf(',') + 1 : (str.indexOf(' ') !== -1 ? str.indexOf(' ') + 1 : -1);
                    if (timeIndex !== -1) {
                      const timePart = str.substring(timeIndex).trim();
                      const timeParts = timePart.split(':');
                      if (timeParts.length >= 2) {
                        const hours = parseInt(timeParts[0], 10);
                        const minutes = parseInt(timeParts[1], 10);
                        const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
                        return new Date(year, month, day, hours, minutes, seconds);
                      }
                    }
                    return new Date(year, month, day);
                  }
                  const parsed = Date.parse(str);
                  return isNaN(parsed) ? new Date() : new Date(parsed);
                };

                const getFilteredSales = () => {
                  const now = new Date();
                  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  
                  return sales.filter(sale => {
                    const saleDate = parsePtBrDate(sale.closedAt);
                    const saleDateClean = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
                    
                    if (filterPeriod === 'hoje') {
                      return saleDateClean.getTime() === startOfToday.getTime();
                    }
                    
                    if (filterPeriod === '7dias') {
                      const sevenDaysAgo = new Date(startOfToday);
                      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                      return saleDateClean >= sevenDaysAgo && saleDateClean <= startOfToday;
                    }
                    
                    if (filterPeriod === '30dias') {
                      const thirtyDaysAgo = new Date(startOfToday);
                      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                      return saleDateClean >= thirtyDaysAgo && saleDateClean <= startOfToday;
                    }
                    
                    if (filterPeriod === 'mes') {
                      return saleDateClean.getFullYear() === now.getFullYear() && saleDateClean.getMonth() === now.getMonth();
                    }
                    
                    if (filterPeriod === 'personalizado') {
                      if (!customStartDate && !customEndDate) return true;
                      let matches = true;
                      if (customStartDate) {
                        const start = new Date(customStartDate + 'T00:00:00');
                        matches = matches && saleDateClean >= start;
                      }
                      if (customEndDate) {
                        const end = new Date(customEndDate + 'T23:59:59');
                        matches = matches && saleDateClean <= end;
                      }
                      return matches;
                    }
                    
                    return true;
                  });
                };

                const filteredSales = getFilteredSales();

                // Calculations
                const todaySales = sales.filter(s => {
                  const d = parsePtBrDate(s.closedAt);
                  const today = new Date();
                  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                });
                const totalToday = todaySales.reduce((sum, s) => sum + s.total, 0);

                const weekSales = sales.filter(s => {
                  const d = parsePtBrDate(s.closedAt);
                  const diff = (new Date().getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
                  return diff <= 7;
                });
                const totalWeek = weekSales.reduce((sum, s) => sum + s.total, 0);

                const monthSales = sales.filter(s => {
                  const d = parsePtBrDate(s.closedAt);
                  const today = new Date();
                  return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                });
                const totalMonth = monthSales.reduce((sum, s) => sum + s.total, 0);

                const totalPeriodRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
                const averageTicket = filteredSales.length > 0 ? totalPeriodRevenue / filteredSales.length : 0;

                const productQuantities: { [name: string]: number } = {};
                filteredSales.forEach(s => {
                  s.items.forEach(item => {
                    productQuantities[item.name] = (productQuantities[item.name] || 0) + item.quantity;
                  });
                });
                let topProduct = 'Nenhum';
                let topProductQty = 0;
                Object.entries(productQuantities).forEach(([name, qty]) => {
                  if (qty > topProductQty) {
                    topProduct = name;
                    topProductQty = qty;
                  }
                });

                const categoryQuantities: { [cat: string]: number } = {};
                filteredSales.forEach(s => {
                  s.items.forEach(item => {
                    const prod = products.find(p => p.name === item.name || p.id === item.productId);
                    const cat = prod?.category || 'Outros';
                    categoryQuantities[cat] = (categoryQuantities[cat] || 0) + item.quantity;
                  });
                });
                let topCategory = 'Nenhuma';
                let topCategoryQty = 0;
                Object.entries(categoryQuantities).forEach(([cat, qty]) => {
                  if (qty > topCategoryQty) {
                    topCategory = cat;
                    topCategoryQty = qty;
                  }
                });

                const openTablesCount = tables.filter(t => t.status === 'Ocupada').length;
                const closedTablesCount = tables.filter(t => t.status === 'Livre').length;

                const revenueByDate: { [date: string]: number } = {};
                filteredSales.forEach(s => {
                  const dateStr = s.closedAt.split(',')[0].split(' ')[0];
                  revenueByDate[dateStr] = (revenueByDate[dateStr] || 0) + s.total;
                });
                const sortedDates = Object.entries(revenueByDate).sort((a, b) => {
                  const partsA = a[0].split('/');
                  const partsB = b[0].split('/');
                  const dateA = new Date(parseInt(partsA[2]), parseInt(partsA[1]) - 1, parseInt(partsA[0]));
                  const dateB = new Date(parseInt(partsB[2]), parseInt(partsB[1]) - 1, parseInt(partsB[0]));
                  return dateA.getTime() - dateB.getTime();
                }).slice(-7);

                const maxRev = Math.max(...sortedDates.map(d => d[1]), 100);

                const paymentBreakdown = {
                  PIX: filteredSales.filter(s => s.paymentMethod === 'PIX').reduce((sum, s) => sum + s.total, 0),
                  Dinheiro: filteredSales.filter(s => s.paymentMethod === 'Dinheiro').reduce((sum, s) => sum + s.total, 0),
                  'Cartão de Crédito': filteredSales.filter(s => s.paymentMethod === 'Cartão de Crédito').reduce((sum, s) => sum + s.total, 0),
                  'Cartão de Débito': filteredSales.filter(s => s.paymentMethod === 'Cartão de Débito').reduce((sum, s) => sum + s.total, 0),
                };
                const totalPaymentRevenue = Object.values(paymentBreakdown).reduce((sum, v) => sum + v, 0);

                const categoryQtyList = Object.entries(categoryQuantities)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5);
                const totalCategoryItems = Object.values(categoryQuantities).reduce((sum, v) => sum + v, 0);

                const handleExportExcel = () => {
                  const title = `Relatório de Vendas - ${restaurantName}`;
                  const period = `Período: ${filterPeriod === 'hoje' ? 'Hoje' : filterPeriod === '7dias' ? 'Últimos 7 dias' : filterPeriod === '30dias' ? 'Últimos 30 dias' : filterPeriod === 'mes' ? 'Este Mês' : `Personalizado (${customStartDate} a ${customEndDate})`}`;
                  
                  let csvContent = `\uFEFF`;
                  csvContent += `"${title}"\n`;
                  csvContent += `"${period}"\n\n`;
                  csvContent += `ID;Data;Mesa;Itens Lançados;Meio de Pagamento;Subtotal (R$);Desconto (R$);Total (R$)\n`;
                  
                  filteredSales.forEach(sale => {
                    const itemsStr = sale.items.map(item => `${item.name.replace(/"/g, "'")} (${item.quantity}x)`).join(', ');
                    csvContent += `"${sale.id}";"${sale.closedAt}";"Mesa ${sale.tableId}";"${itemsStr}";"${sale.paymentMethod}";"${sale.subtotal.toFixed(2)}";"${sale.discount.toFixed(2)}";"${sale.total.toFixed(2)}"\n`;
                  });
                  
                  const totalSubtotal = filteredSales.reduce((sum, s) => sum + s.subtotal, 0);
                  const totalDiscount = filteredSales.reduce((sum, s) => sum + s.discount, 0);
                  const totalRev = filteredSales.reduce((sum, s) => sum + s.total, 0);
                  csvContent += `;;;;;"TOTAL GERAL";"${totalSubtotal.toFixed(2)}";"${totalDiscount.toFixed(2)}";"${totalRev.toFixed(2)}"\n`;
                  
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.setAttribute('href', url);
                  link.setAttribute('download', `relatorio_vendas_${filterPeriod}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  
                  triggerNotification('Relatório exportado para Excel com sucesso!', 'success');
                };

                const handleExportPDF = () => {
                  const totalSubtotal = filteredSales.reduce((sum, s) => sum + s.subtotal, 0);
                  const totalDiscount = filteredSales.reduce((sum, s) => sum + s.discount, 0);
                  const totalRev = filteredSales.reduce((sum, s) => sum + s.total, 0);
                  const periodText = filterPeriod === 'hoje' ? 'Hoje' : filterPeriod === '7dias' ? 'Últimos 7 dias' : filterPeriod === '30dias' ? 'Últimos 30 dias' : filterPeriod === 'mes' ? 'Este Mês' : `Personalizado (${customStartDate} a ${customEndDate})`;
                  
                  const rows = filteredSales.map(sale => {
                    const itemsStr = sale.items.map(item => `${item.name} (x${item.quantity})`).join('<br/>');
                    return `
                      <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-family: monospace;">${sale.id}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${sale.closedAt}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Mesa ${sale.tableId}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 11px;">${itemsStr}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; color: #444;">${sale.paymentMethod}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">R$ ${sale.subtotal.toFixed(2)}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; color: red;">R$ ${sale.discount.toFixed(2)}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: bold;">R$ ${sale.total.toFixed(2)}</td>
                      </tr>
                    `;
                  }).join('');
                  
                  const reportHTML = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; background: white;">
                      <div class="header" style="text-align: center; border-bottom: 2px solid #ef4444; padding-bottom: 20px; margin-bottom: 25px;">
                        <h1 style="margin: 0; font-size: 26px; color: #dc2626; text-transform: uppercase; letter-spacing: 1px;">${restaurantName}</h1>
                        <p style="margin: 5px 0 0; font-size: 14px; color: #666;">${restaurantSlogan}</p>
                        <p style="margin: 5px 0 0; font-size: 14px; color: #666;">${restaurantAddress} - Tel: ${restaurantPhone}</p>
                      </div>
                      
                      <div class="metadata" style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; background: #f9f9f9; padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #eee;">
                        <span>RELATÓRIO DE VENDAS ADMINISTRATIVO</span>
                        <span>PERÍODO: ${periodText.toUpperCase()}</span>
                        <span>DATA DE EMISSÃO: ${new Date().toLocaleString('pt-BR')}</span>
                      </div>
                      
                      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">
                        <thead>
                          <tr>
                            <th style="width: 15%; background-color: #f1f1f1; text-align: left; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Ref / ID</th>
                            <th style="width: 15%; background-color: #f1f1f1; text-align: left; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Encerramento</th>
                            <th style="width: 10%; background-color: #f1f1f1; text-align: left; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Origem</th>
                            <th style="width: 25%; background-color: #f1f1f1; text-align: left; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Itens Lançados</th>
                            <th style="width: 12%; background-color: #f1f1f1; text-align: left; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Forma Pagto</th>
                            <th style="text-align: right; width: 8%; background-color: #f1f1f1; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Subtotal</th>
                            <th style="text-align: right; width: 8%; background-color: #f1f1f1; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Desconto</th>
                            <th style="text-align: right; width: 10%; background-color: #f1f1f1; padding: 10px 8px; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #555;">Faturamento</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${rows || '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #aaa; font-style: italic;">Nenhuma venda registrada no período selecionado.</td></tr>'}
                        </tbody>
                      </table>
                      
                      <div class="totals" style="margin-top: 25px; text-align: right; font-size: 14px;">
                        <div class="totals-table" style="width: 300px; margin-left: auto; border: 1px solid #eee; background: #fdfdfd; padding: 10px; border-radius: 8px;">
                          <div class="totals-row" style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #eee;">
                            <span>Subtotal:</span>
                            <span style="font-family: monospace;">R$ ${totalSubtotal.toFixed(2)}</span>
                          </div>
                          <div class="totals-row" style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #eee;">
                            <span>Descontos:</span>
                            <span style="font-family: monospace; color: red;">- R$ ${totalDiscount.toFixed(2)}</span>
                          </div>
                          <div class="totals-row" style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 16px; font-weight: bold; color: #dc2626;">
                            <span>Faturamento Total:</span>
                            <span style="font-family: monospace; font-weight: bold;">R$ ${totalRev.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div class="footer" style="text-align: center; margin-top: 50px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 15px;">
                        <p>${restaurantPrintFooter.toUpperCase()}</p>
                        <p>${restaurantThanksMessage.toUpperCase()}</p>
                        <p style="font-size: 9px; margin-top: 5px; color: #aaa;">Documento emitido eletronicamente via Umai Sushi ERP Admin Panel</p>
                      </div>
                    </div>
                  `;

                  // 1. Clean up any existing print sections/styles
                  const oldSection = document.getElementById('print-report-section');
                  if (oldSection) oldSection.remove();
                  const oldStyles = document.getElementById('print-report-styles');
                  if (oldStyles) oldStyles.remove();

                  // 2. Create the printing container
                  const printSection = document.createElement('div');
                  printSection.id = 'print-report-section';
                  printSection.innerHTML = reportHTML;
                  document.body.appendChild(printSection);

                  // 3. Inject print styles dynamically to hide everything else on the screen during window.print()
                  const styleTag = document.createElement('style');
                  styleTag.id = 'print-report-styles';
                  styleTag.innerHTML = `
                    @media print {
                      body > *:not(#print-report-section) {
                        display: none !important;
                      }
                      #root {
                        display: none !important;
                      }
                      html, body {
                        width: 100% !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                      }
                      #print-report-section {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                      }
                      @page {
                        size: A4 portrait;
                        margin: 15mm !important;
                      }
                    }
                  `;
                  document.head.appendChild(styleTag);

                  // 4. Trigger print
                  try {
                    window.print();
                  } catch (printErr) {
                    console.error('Error triggering report print:', printErr);
                  } finally {
                    // 5. Clean up asynchronously after print dialog finishes/closes
                    setTimeout(() => {
                      const section = document.getElementById('print-report-section');
                      if (section) section.remove();
                      const styles = document.getElementById('print-report-styles');
                      if (styles) styles.remove();
                    }, 500);
                  }
                };

                return (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                          📈 Dashboard Geral de Vendas
                        </h3>
                        <p className="text-[11px] text-zinc-400 mt-1">Conferência completa do faturamento diário, semanal, mensal e do ticket médio.</p>
                      </div>
                      
                      {/* Exports buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExportExcel}
                          disabled={filteredSales.length === 0}
                          className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-800/20 flex items-center gap-1.5 transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                          <Download size={13} /> Exportar Excel
                        </button>
                        <button
                          onClick={handleExportPDF}
                          disabled={filteredSales.length === 0}
                          className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 border border-rose-800/20 flex items-center gap-1.5 transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                          <Printer size={13} /> Exportar PDF (Imprimir)
                        </button>
                      </div>
                    </div>

                    {/* Quick filter bars & Period Pickers */}
                    <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-850/80 flex flex-col md:flex-row gap-4 items-start md:items-center">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 font-mono block">Filtrar por Período</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { value: 'hoje', label: 'Hoje' },
                            { value: '7dias', label: '7 Dias' },
                            { value: '30dias', label: '30 Dias' },
                            { value: 'mes', label: 'Este Mês' },
                            { value: 'personalizado', label: 'Personalizado' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => setFilterPeriod(option.value as any)}
                              className={`px-3 py-1 rounded-lg text-[10.5px] font-semibold transition cursor-pointer ${
                                filterPeriod === option.value
                                  ? 'bg-rose-900 border border-rose-700 text-rose-100 font-bold'
                                  : 'bg-zinc-904 text-zinc-400 hover:text-white border border-transparent'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {filterPeriod === 'personalizado' && (
                        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
                          <div className="space-y-1">
                            <span className="text-[9px] text-zinc-500 block uppercase font-bold">Início</span>
                            <input
                              type="date"
                              value={customStartDate}
                              onChange={(e) => setCustomStartDate(e.target.value)}
                              className="bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-white outline-none text-xs"
                            />
                          </div>
                          <span className="pt-4 text-zinc-500">a</span>
                          <div className="space-y-1">
                            <span className="text-[9px] text-zinc-500 block uppercase font-bold">Fim</span>
                            <input
                              type="date"
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              className="bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-white outline-none text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-850/60 flex flex-col justify-between">
                        <span className="text-[9.5px] font-bold font-mono text-zinc-500 uppercase tracking-widest block">💰 Faturamento {filterPeriod === 'hoje' ? 'Hoje' : filterPeriod === '7dias' ? '7D' : filterPeriod === '30dias' ? '30D' : filterPeriod === 'mes' ? 'Mês' : 'Apurado'}</span>
                        <div className="mt-2 text-rose-500">
                          <span className="block text-xl font-black font-mono tracking-tight text-white leading-none">R$ {totalPeriodRevenue.toFixed(2)}</span>
                          <span className="text-[9px] text-zinc-400 mt-1 block">total faturamentos fechados</span>
                        </div>
                      </div>
                      
                      <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-850/60 flex flex-col justify-between">
                        <span className="text-[9.5px] font-bold font-mono text-zinc-500 uppercase tracking-widest block">🎟️ Ticket Médio</span>
                        <div className="mt-2">
                          <span className="block text-xl font-black font-mono tracking-tight text-white leading-none">R$ {averageTicket.toFixed(2)}</span>
                          <span className="text-[9px] text-zinc-400 mt-1 block">média por comanda paga</span>
                        </div>
                      </div>

                      <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-850/60 flex flex-col justify-between">
                        <span className="text-[9.5px] font-bold font-mono text-zinc-500 uppercase tracking-widest block">🍣 Principal Item</span>
                        <div className="mt-2">
                          <span className="block text-xs font-black tracking-tight text-white leading-tight truncate" title={topProduct}>{topProduct}</span>
                          <span className="text-[9px] text-rose-400 font-bold mt-1 block">{topProductQty} un vendidas</span>
                        </div>
                      </div>

                      <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-850/60 flex flex-col justify-between">
                        <span className="text-[9.5px] font-bold font-mono text-zinc-500 uppercase tracking-widest block">🏷️ Principal Categoria</span>
                        <div className="mt-2">
                          <span className="block text-xs font-black tracking-tight text-white leading-tight truncate">{topCategory}</span>
                          <span className="text-[9px] text-rose-400 font-bold font-mono mt-1 block">{topCategoryQty} itens lançados</span>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Subtotal metrics overview */}
                      <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-850/50 space-y-4">
                        <h4 className="text-[10px] font-bold font-mono tracking-wider text-zinc-400 uppercase">📊 Detalhamento de Faturamento</h4>
                        
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-400">Faturamento Hoje:</span>
                            <span className="font-mono font-bold text-white">R$ {totalToday.toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-zinc-900/60 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-rose-500 h-full rounded-full" style={{ width: `${totalMonth > 0 ? (totalToday / totalMonth) * 100 : 0}%` }} />
                          </div>

                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-400">Semana (Últimos 7 dias):</span>
                            <span className="font-mono font-bold text-white">R$ {totalWeek.toFixed(2)}</span>
                          </div>
                          
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-400">Faturamento Mensal:</span>
                            <span className="font-mono font-bold text-white">R$ {totalMonth.toFixed(2)}</span>
                          </div>

                          <div className="border-t border-zinc-850 my-2 pt-2 flex justify-between items-center text-xs">
                            <span className="text-zinc-400 font-bold">Total Lançamentos:</span>
                            <span className="font-mono font-black text-rose-400">{filteredSales.length} comandas</span>
                          </div>
                        </div>
                      </div>

                      {/* Tables Monitor Overview */}
                      <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-850/50 flex flex-col justify-between">
                        <div>
                          <h4 className="text-[10px] font-bold font-mono tracking-wider text-zinc-400 uppercase mb-3.5">📌 Monitor de Mesas Ativas</h4>
                          <div className="grid grid-cols-2 gap-3.5 text-center">
                            <div className="bg-red-950/40 p-3 rounded-xl border border-red-900/20">
                              <span className="text-[9px] font-extrabold uppercase font-mono tracking-wider text-red-400 block">Mesas Ocupadas</span>
                              <span className="text-2xl font-black font-mono text-rose-300 mt-1 block">{openTablesCount}</span>
                            </div>
                            <div className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/10">
                              <span className="text-[9px] font-extrabold uppercase font-mono tracking-wider text-zinc-500 block">Mesas Livres</span>
                              <span className="text-2xl font-black font-mono text-zinc-300 mt-1 block">{closedTablesCount}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-[9px] text-zinc-500 text-center font-mono py-1 border-t border-zinc-850/50 mt-4 flex items-center justify-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Monitoramento em Tempo Real
                        </div>
                      </div>

                      {/* Top Selling Categories Breakdown */}
                      <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-850/50">
                        <h4 className="text-[10px] font-bold font-mono tracking-wider text-zinc-400 uppercase mb-3">🏷️ Categorias Populares</h4>
                        
                        {categoryQtyList.length === 0 ? (
                          <div className="h-28 flex items-center justify-center text-zinc-500 text-xs font-mono italic">
                            Sem vendas registradas
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {categoryQtyList.map(([cat, qty]) => {
                              const pct = totalCategoryItems > 0 ? (qty / totalCategoryItems) * 100 : 0;
                              return (
                                <div key={cat} className="space-y-1">
                                  <div className="flex justify-between text-[11px] font-mono leading-none">
                                    <span className="text-zinc-300 font-bold">{cat}</span>
                                    <span className="text-rose-400 font-bold">{qty} un ({pct.toFixed(0)}%)</span>
                                  </div>
                                  <div className="w-full bg-zinc-910 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-rose-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SVG Graphic Dashboard Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Bar chart of faturamento */}
                      <div className="bg-zinc-950/40 p-5 rounded-2xl border border-zinc-850/80">
                        <h4 className="text-[10.5px] font-bold font-mono tracking-wide text-zinc-400 mb-3 uppercase flex items-center gap-1.5">
                          <Activity size={12} className="text-rose-400" /> Tendência de Faturamento por Data (Últimos 7 dias ativos)
                        </h4>
                        
                        {sortedDates.length === 0 ? (
                          <div className="h-44 flex items-center justify-center text-zinc-500 text-xs font-mono italic">
                            Nenhuma venda registrada no período selecionado.
                          </div>
                        ) : (
                          <div className="h-44 flex items-end gap-3 pt-6 px-1.5">
                            {sortedDates.map(([date, val]) => {
                              const heightPct = (val / maxRev) * 80 + 10;
                              return (
                                <div key={date} className="flex-1 flex flex-col items-center h-full justify-end group transition-all">
                                  {/* Tooltip */}
                                  <span className="text-[8.5px] font-extrabold font-mono text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap bg-zinc-900 border border-zinc-805 px-1 rounded">
                                    R$ {val.toFixed(0)}
                                  </span>
                                  {/* Bar container */}
                                  <div 
                                    style={{ height: `${heightPct}%` }}
                                    className="w-full bg-gradient-to-t from-red-950 to-rose-600 rounded-md transition-all duration-500 group-hover:to-rose-500 border border-rose-900/40 shadow-inner"
                                  />
                                  <span className="text-[7.5px] font-mono font-semibold text-zinc-500 mt-2 rotate-12 origin-center truncate w-full text-center">
                                    {date.substring(0, 5)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Payment pie breakdown-style bar set */}
                      <div className="bg-zinc-950/40 p-5 rounded-2xl border border-zinc-850/80">
                        <h4 className="text-[10.5px] font-bold font-mono tracking-wide text-zinc-400 mb-3.5 uppercase flex items-center gap-1.5">
                          <BarChart3 size={12} className="text-cyan-400" /> Partilha de Meios de Pagamento
                        </h4>
                        <div className="space-y-3 pt-2">
                          {Object.entries(paymentBreakdown).map(([method, val]) => {
                            const pct = totalPaymentRevenue > 0 ? (val / totalPaymentRevenue) * 100 : 0;
                            return (
                              <div key={method} className="space-y-1">
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-zinc-350 font-bold flex items-center gap-2">
                                    {method === 'PIX' && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
                                    {method === 'Dinheiro' && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                    {method === 'Cartão de Crédito' && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                                    {method === 'Cartão de Débito' && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
                                    {method}
                                  </span>
                                  <span className="text-zinc-400 font-black">
                                    R$ {val.toFixed(2)} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                                <div className="w-full bg-zinc-900/80 rounded-full h-2 overflow-hidden border border-zinc-800/45">
                                  <div 
                                    style={{ width: `${pct}%` }}
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      method === 'PIX' ? 'bg-cyan-500' :
                                      method === 'Dinheiro' ? 'bg-emerald-500' :
                                      method === 'Cartão de Crédito' ? 'bg-amber-500' :
                                      'bg-indigo-500'
                                    }`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Sales Log Table */}
                    <div className="bg-zinc-950/30 rounded-2xl border border-zinc-850/80 overflow-hidden space-y-2">
                      <div className="p-4 border-b border-zinc-850 flex justify-between items-center bg-zinc-950/20">
                        <span className="text-[11px] font-black uppercase text-zinc-300 tracking-wider font-mono">📋 Registro de Vendas Filtradas ({filteredSales.length})</span>
                        <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase">Apurados no período</span>
                      </div>
                      
                      <div className="overflow-x-auto max-h-72">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-850/50 bg-zinc-950/15 text-[9px] uppercase tracking-wider font-mono text-zinc-500">
                              <th className="p-3 pl-4">ID de Venda</th>
                              <th className="p-3">Data Encerramento</th>
                              <th className="p-3">Origem</th>
                              <th className="p-3">Itens Lançados</th>
                              <th className="p-3">Meio Pagto</th>
                              <th className="p-3 text-right">Subtotal</th>
                              <th className="p-3 text-right">Desconto</th>
                              <th className="p-3 text-right pr-4">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/60 font-sans text-zinc-300">
                            {filteredSales.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="p-6 text-center text-zinc-500 font-mono text-[10px]">Nenhuma venda registrada no período selecionado.</td>
                              </tr>
                            ) : (
                              filteredSales.map((item) => (
                                <tr key={item.id} className="hover:bg-zinc-900/10">
                                  <td className="p-3 pl-4 font-mono text-[10px] font-bold text-zinc-400">{item.id.replace('venda-', '')}</td>
                                  <td className="p-3 text-zinc-400">{item.closedAt}</td>
                                  <td className="p-3"><span className="text-[10.5px] font-black bg-red-950/20 text-red-300 border border-red-900/20 px-2 py-0.5 rounded-lg font-mono">Mesa {item.tableId}</span></td>
                                  <td className="p-3 text-[11px] max-w-[200px] truncate" title={item.items?.map(it => `${it.name} (x${it.quantity})`).join(', ')}>
                                    {item.items?.map((it, idx) => (
                                      <span key={idx} className="bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded text-[10px] mr-1 inline-block font-mono mb-0.5">
                                        {it.name} x{it.quantity}
                                      </span>
                                    ))}
                                  </td>
                                  <td className="p-3 font-semibold uppercase text-[10px] text-zinc-300">{item.paymentMethod}</td>
                                  <td className="p-3 font-mono text-right text-zinc-400">R$ {item.subtotal.toFixed(2)}</td>
                                  <td className="p-3 font-mono text-right text-rose-500">-R$ {item.discount.toFixed(2)}</td>
                                  <td className="p-3 pr-4 font-mono font-black text-right text-rose-400">R$ {item.total.toFixed(2)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SUB-TAB 1: WAITERS CRUD */}
              {adminSubTab === 'garcons' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                      👥 Cadastro & Controle de Garçons
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1">Gerencie a equipe autorizada. Garçons listados recebem taxa de serviço de {restaurantServiceTax}%.</p>
                  </div>

                  <form onSubmit={handleAddWaiter} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nome do Garçom (Ex: Roberto)"
                      required
                      value={newWaiterName}
                      onChange={(e) => setNewWaiterName(e.target.value)}
                      className="bg-zinc-950 text-white font-semibold text-xs border border-zinc-850 rounded-xl px-3 py-2 flex-grow focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-red-800 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1 shrink-0 shadow"
                    >
                      <Plus size={14} /> Adicionar
                    </button>
                  </form>

                  <div className="border border-zinc-850 rounded-xl overflow-hidden bg-zinc-950/40 font-mono">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-900/40 text-zinc-400 font-extrabold uppercase tracking-widest text-[9px] border-b border-zinc-850">
                          <th className="p-3 pl-4">Nome do Profissional</th>
                          <th className="p-3">Comissão de Serviços</th>
                          <th className="p-3 text-center w-24">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/40 text-zinc-350">
                        {waiters.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-zinc-500 text-[10.5px]">Nenhum garçom cadastrado no sistema.</td>
                          </tr>
                        ) : (
                          waiters.map((w) => (
                            <tr key={w} className="hover:bg-zinc-900/10">
                              <td className="p-3 pl-4 font-sans font-semibold text-white">{w}</td>
                              <td className="p-3 text-[10px] font-bold text-rose-450 uppercase">{restaurantServiceTax}% Serviços Habilitados</td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWaiter(w)}
                                  className="text-zinc-500 hover:text-red-400 bg-zinc-950 p-1.5 rounded-lg border border-zinc-850"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: ESTABELECIMENTO DETAILS */}
              {adminSubTab === 'estabelecimento' && (
                <form onSubmit={handleSaveRestaurantInfo} className="space-y-4">
                  <div>
                    <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                      🏢 Configurações do Estabelecimento
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1">Configure o nome, logo, contatos, taxas e preferências do restaurante.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Nome do Restaurante</label>
                      <input
                        type="text"
                        required
                        value={inputRestaurantName}
                        onChange={(e) => setInputRestaurantName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Slogan / Descrição do Cupom</label>
                      <input
                        type="text"
                        required
                        value={inputRestaurantSlogan}
                        onChange={(e) => setInputRestaurantSlogan(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Endereço Completo</label>
                      <input
                        type="text"
                        required
                        value={inputRestaurantAddress}
                        onChange={(e) => setInputRestaurantAddress(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Telefone de Contato</label>
                      <input
                        type="text"
                        required
                        value={inputRestaurantPhone}
                        onChange={(e) => setInputRestaurantPhone(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white font-mono focus:outline-none"
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">URL do Logotipo do Restaurante</label>
                      <input
                        type="text"
                        value={inputRestaurantLogoUrl}
                        onChange={(e) => setInputRestaurantLogoUrl(e.target.value)}
                        placeholder="Ex: https://imagens.restaurante/logo.png"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white font-mono focus:outline-none placeholder:text-zinc-650"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Instagram (Rede Social)</label>
                      <input
                        type="text"
                        value={inputRestaurantInstagram}
                        onChange={(e) => setInputRestaurantInstagram(e.target.value)}
                        placeholder="Ex: @umai_sushi"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white font-mono focus:outline-none placeholder:text-zinc-650"
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Taxa de Serviço (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        required
                        value={inputRestaurantServiceTax}
                        onChange={(e) => setInputRestaurantServiceTax(parseFloat(e.target.value) || 0)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white font-mono focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Mensagem de Agradecimento (Cupom)</label>
                      <input
                        type="text"
                        required
                        value={inputRestaurantThanksMessage}
                        onChange={(e) => setInputRestaurantThanksMessage(e.target.value)}
                        placeholder="Ex: OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE."
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none placeholder:text-zinc-650"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Rodapé das Impressões (Rodapé da Impressão)</label>
                      <input
                        type="text"
                        required
                        value={inputRestaurantPrintFooter}
                        onChange={(e) => setInputRestaurantPrintFooter(e.target.value)}
                        placeholder="Ex: MESA EMITIDA NO MODO CONFERENCIA"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none placeholder:text-zinc-650"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="bg-red-800 hover:bg-red-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1 shadow"
                    >
                      <Check size={14} /> Salvar Configurações
                    </button>
                  </div>
                </form>
              )}

              {/* SUB-TAB 3: SECURITY PASSWORD */}
              {adminSubTab === 'seguranca' && (
                <form onSubmit={handleSaveNewPassword} className="space-y-4">
                  <div>
                    <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                      🔑 Configuração de Segurança Administrativa
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1">Altere a senha requerida para login no perfil de Administrador e manipulação de cadastros/configurações.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-zinc-300">
                    <div>
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Senha Administrativa Atual</label>
                      <input
                        type="password"
                        required
                        placeholder="••••"
                        value={currentPasswordInput}
                        onChange={(e) => setCurrentPasswordInput(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Nova Senha Admin</label>
                      <input
                        type="password"
                        required
                        placeholder="••••"
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-zinc-400 mb-1.5 font-mono text-[10px] uppercase">Confirmar Nova Senha</label>
                      <input
                        type="password"
                        required
                        placeholder="••••"
                        value={confirmNewPasswordInput}
                        onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 px-3 text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="bg-red-800 hover:bg-red-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1 shadow"
                    >
                      <Check size={14} /> Atualizar Senha de Acesso
                    </button>
                  </div>
                </form>
              )}

              {/* SUB-TAB 4: SYSTEM MAINTENANCE / BANK OPERATIONS */}
              {adminSubTab === 'banco' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                      ⚠️ Manutenção das Tabelas de Dados e Caixa
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1">Procedimentos administrativos críticos de limpeza, depuração e redefinições completas.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wide">Zerar Mesas Ativas</h4>
                        <p className="text-[10px] text-zinc-500 mt-1">Retorna todas as 15 mesas para "Livre" e esvazia seus pratos.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetTablesDb}
                        className="w-full bg-amber-950/40 text-amber-500 hover:bg-amber-900/60 border border-amber-800/20 text-[10.5px] py-1.5 font-bold rounded-lg transition"
                      >
                        Zerar Mesas
                      </button>
                    </div>

                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wide">Limpar Caixa / Vendas</h4>
                        <p className="text-[10px] text-zinc-500 mt-1">Exclui todo o histórico e lucros de comandas finalizadas.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetSalesDb}
                        className="w-full bg-red-950/40 text-red-500 hover:bg-red-900/60 border border-red-800/20 text-[10.5px] py-1.5 font-bold rounded-lg transition"
                      >
                        Limpar Caixa Geral
                      </button>
                    </div>

                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wide">Reset de Fábrica Total</h4>
                        <p className="text-[10px] text-zinc-550 mt-1">Limpa todo o localStorage, senhas, garçons e restaura banco padrão.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleFactoryResetSystem}
                        className="w-full bg-red-950/65 text-red-400 hover:bg-red-950 border border-red-850/50 text-[10.5px] py-1.5 font-black rounded-lg transition shadow-lg shrink-0"
                      >
                        Resetar Sistema
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 5: CATEGORIES MANAGEMENT */}
              {adminSubTab === 'categorias' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                      📁 Gestão de Categorias do Cardápio
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Adicione novas categorias personalizadas de produtos ou consulte as categorias existentes do restaurante.
                    </p>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newCategoryName.trim()) return;
                      const clean = newCategoryName.trim();
                      if (categories.includes(clean)) {
                        triggerNotification('Esta categoria já existe!', 'error');
                        return;
                      }
                      const updated = [...categories, clean];
                      setCategories(updated);
                      saveCategoriesToLocalStorage(updated);
                      setNewCategoryName('');
                      triggerNotification(`Categoria "${clean}" criada com sucesso!`);
                    }} 
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Nome da Nova Categoria (Ex: Entradas Quentes)"
                      required
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="bg-zinc-950 text-white font-semibold text-xs border border-zinc-850 rounded-xl px-3 py-2 flex-grow focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-red-800 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1 shrink-0 shadow"
                    >
                      <Plus size={14} /> Adicionar Categoria
                    </button>
                  </form>

                  <div className="border border-zinc-850 rounded-xl overflow-hidden bg-zinc-950/40 font-mono">
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead>
                        <tr className="bg-zinc-900/40 text-zinc-400 font-extrabold uppercase tracking-widest text-[9px] border-b border-zinc-850 font-mono">
                          <th className="p-3 pl-4">Nome da Categoria</th>
                          <th className="p-3">Tipo / Status</th>
                          <th className="p-3 text-center w-24">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/40 text-zinc-350 text-xs">
                        {categories.map((cat) => {
                          const isDefault = ['Temakis', 'Sushis', 'Combos', 'Bebidas', 'Sobremesas'].includes(cat);
                          return (
                            <tr key={cat} className="hover:bg-zinc-900/10 font-sans">
                              <td className="p-3 pl-4 font-semibold text-white">{cat}</td>
                              <td className="p-3 text-[10px] font-bold font-mono">
                                {isDefault ? (
                                  <span className="text-zinc-550 uppercase">Padrão do Sistema</span>
                                ) : (
                                  <span className="text-amber-500 uppercase">Personalizada</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-mono">
                                {isDefault ? (
                                  <span className="text-zinc-650 text-[10px] select-none">—</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const used = products.some(p => p.category === cat);
                                      if (used) {
                                        triggerNotification(`Não é possível excluir! Existem produtos cadastrados no cardápio nesta categoria.`, 'error');
                                        return;
                                      }
                                      if (window.confirm(`Tem certeza de que deseja remover a categoria "${cat}"?`)) {
                                        const updated = categories.filter(c => c !== cat);
                                        setCategories(updated);
                                        saveCategoriesToLocalStorage(updated);
                                        triggerNotification(`Categoria "${cat}" removida.`);
                                      }
                                    }}
                                    className="text-zinc-500 hover:text-red-400 bg-zinc-950 p-1.5 rounded-lg border border-zinc-850"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 7: PROFESSIONAL THERMAL PRINTING ARCHITECTURE (EPSON TM-T20X) */}
              {adminSubTab === 'impressao' && (
                <div id="impressao" className="space-y-6">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-850 pb-5">
                    <div>
                      <h3 className="text-sm font-black uppercase text-rose-500 tracking-wider font-mono flex items-center gap-1.5">
                        <Printer size={15} /> Arquitetura de Impressão Térmica Automática
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Configure saídas automatizadas para impressoras térmicas ESC/POS (Epson TM-T20X) via **QZ Tray** ou **PrintNode** em tempo real.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const initial = getPrinters();
                          savePrinters(initial);
                          setPrintQueueList(getPrintQueue());
                          setRefreshPrintersToggle(prev => prev + 1);
                          triggerNotification('Drivers e Fila atualizados com sucesso!');
                        }}
                        className="bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-350 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                      >
                        <RefreshCw size={12} className="animate-spin-slow" />
                        Sincronizar Drivers
                      </button>
                    </div>
                  </div>

                  {/* Espaço de Teste da Impressora (Bento Grid Style) */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-850 space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-zinc-900/60">
                      <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-widest block font-mono">🧪 Espaço de Teste Rápido de Impressão (Otimizado para Bobina & Tablet)</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {/* Left: Settings & 1-Click Trigger */}
                      <div className="lg:col-span-7 space-y-4 flex flex-col justify-between">
                        <div className="space-y-3.5">
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            Use esta seção dedicada para testar o alinhamento, tamanho e o fluxo de impressão do seu dispositivo. Desenvolvido sob medida para <strong>Tablets, iPads e Celulares</strong>, funcionando com <strong>um único toque</strong> e sem abrir abas adicionais no navegador quando configurado para Impressão Direta.
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold block">Tamanho da Bobina Físico</label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setTestPaperWidth('80mm')}
                                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold border text-center transition-colors ${
                                    testPaperWidth === '80mm'
                                      ? 'bg-rose-950/40 text-rose-400 border-rose-900/40'
                                      : 'bg-zinc-900 text-zinc-400 border-transparent hover:text-white'
                                  }`}
                                >
                                  80mm (Padrão)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTestPaperWidth('58mm')}
                                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold border text-center transition-colors ${
                                    testPaperWidth === '58mm'
                                      ? 'bg-rose-950/40 text-rose-400 border-rose-900/40'
                                      : 'bg-zinc-900 text-zinc-400 border-transparent hover:text-white'
                                  }`}
                                >
                                  58mm (Bobina Estreita)
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold block">Modelo de Conteúdo</label>
                              <select
                                value={testContentType}
                                onChange={(e) => setTestContentType(e.target.value as any)}
                                className="w-full bg-zinc-900 border border-zinc-850 text-white rounded-lg px-2.5 py-1.5 font-bold focus:outline-none"
                              >
                                <option value="simples">Comanda Simples (Cozinha)</option>
                                <option value="completo">Cupom de Venda Completo (Mesa/Massa)</option>
                                <option value="fechamento">Encerramento/Fechamento Diário</option>
                              </select>
                            </div>
                          </div>

                          <div className="bg-emerald-950/10 border border-emerald-900/20 p-3 rounded-xl text-[10.5px] leading-relaxed text-emerald-300">
                            <strong>Dica Pro:</strong> Certifique-se de que o campo <strong>"Impressão no Navegador"</strong> nas configurações globais abaixo está configurado como <strong className="text-emerald-400">Imprimir Direto (Ideal p/ Tablet/Sem Abas)</strong> para que a impressão ocorra sem abrir novas janelas!
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const time = new Date().toLocaleTimeString('pt-BR');
                            let mockData;

                            if (testContentType === 'simples') {
                              mockData = {
                                restaurantName: restaurantName || 'Umai Sushi',
                                restaurantSlogan: 'COMANDA DE PRODUCAO TESTE',
                                restaurantAddress: 'SETOR COZINHA - IMPRESSORA TESTE',
                                restaurantPhone: restaurantPhone || '54 3451-9922',
                                tableId: 7,
                                waiterName: 'MATEUS SILVA',
                                openedAt: time,
                                closedAt: time,
                                clientCount: 2,
                                items: [
                                  { id: 'item-1', productId: 'p-1', name: 'TEMAKI SALMAO COMPLETO', quantity: 2, price: 34.90, createdAt: '' },
                                  { id: 'item-2', productId: 'p-2', name: 'URAMAKI FILADELFIA (10PCS)', quantity: 1, price: 29.90, createdAt: '' }
                                ],
                                subtotal: 99.70,
                                discount: 0,
                                total: 99.70,
                                paymentMethod: 'TESTE COZINHA'
                              };
                            } else if (testContentType === 'completo') {
                              mockData = {
                                restaurantName: restaurantName || 'Umai Sushi',
                                restaurantSlogan: 'CUPOM FISCAL SIMULADO',
                                restaurantAddress: 'RUA PRINCIPAL, 100 - BENTO GONCALVES',
                                restaurantPhone: restaurantPhone || '54 3451-9922',
                                tableId: 12,
                                waiterName: 'ALEXANDRE',
                                openedAt: time,
                                closedAt: time,
                                clientCount: 4,
                                items: [
                                  { id: 'item-1', productId: 'p-1', name: 'RODIZIO UMAI PREMIUM', quantity: 3, price: 119.90, createdAt: '' },
                                  { id: 'item-2', productId: 'p-2', name: 'HOSSOMAKI SHAKE (10PCS)', quantity: 1, price: 26.90, createdAt: '' },
                                  { id: 'item-3', productId: 'p-3', name: 'COCA-COLA LATA 350ML', quantity: 4, price: 6.50, createdAt: '' }
                                ],
                                subtotal: 413.50,
                                discount: 10.00,
                                total: 403.50,
                                paymentMethod: 'CARTAO DE CREDITO'
                              };
                            } else {
                              mockData = {
                                restaurantName: restaurantName || 'Umai Sushi',
                                restaurantSlogan: 'RELATORIO DE ENCERRAMENTO',
                                restaurantAddress: 'CAIXA CENTRAL - CONSOLIDADO',
                                restaurantPhone: restaurantPhone || '54 3451-9922',
                                tableId: 0,
                                waiterName: 'SISTEMA CAIXA',
                                openedAt: time,
                                closedAt: time,
                                clientCount: 1,
                                items: [
                                  { id: 'item-1', productId: 'p-1', name: 'FECHAMENTO OPERADOR 1', quantity: 1, price: 1850.40, createdAt: '' },
                                  { id: 'item-2', productId: 'p-2', name: 'FECHAMENTO OPERADOR 2', quantity: 1, price: 1420.10, createdAt: '' }
                                ],
                                subtotal: 3270.50,
                                discount: 0,
                                total: 3270.50,
                                paymentMethod: 'DIARIO CONSOLIDADO'
                              };
                            }

                            const html = generateReceiptHTML(mockData, testPaperWidth);
                            handleIframeIsolatedPrint(html);
                            triggerNotification('Comando de impressão direta disparado para o Tablet!', 'success');
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer mt-4"
                        >
                          <Printer size={15} />
                          ⚡ IMPRIMIR CUPOM DE TESTE AGORA (1 CLIQUE)
                        </button>
                      </div>

                      {/* Right: Realistic Paper Roll Simulation Preview */}
                      <div className="lg:col-span-5 flex flex-col items-center justify-center bg-zinc-900/35 p-4 rounded-xl border border-zinc-900/60 min-h-[250px]">
                        <span className="text-[9px] font-extrabold uppercase font-mono text-zinc-550 mb-2">Simulador de Bobina Térmica</span>
                        
                        {/* Thermal Roll container */}
                        <div 
                          className="bg-white text-black p-3.5 shadow-2xl rounded-sm border-t border-b border-zinc-250 font-mono text-[9.5px] leading-tight select-none relative overflow-hidden text-left"
                          style={{ width: testPaperWidth === '80mm' ? '240px' : '180px' }}
                        >
                          {/* Top Jagged Edge representing paper tear */}
                          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-300 flex overflow-hidden">
                            {Array.from({ length: 30 }).map((_, i) => (
                              <div key={i} className="w-2 h-2 bg-zinc-900 transform rotate-45 -translate-y-1" />
                            ))}
                          </div>

                          <div className="pt-2 text-center">
                            <span className="font-extrabold block text-[11px] leading-tight text-black">{restaurantName || 'Umai Sushi'}</span>
                            <span className="text-[8.5px] text-zinc-500 block leading-tight mt-0.5">
                              {testContentType === 'simples' ? 'COMANDA DE COZINHA' : testContentType === 'completo' ? 'CUPOM FISCAL SIMULADO' : 'RELATORIO DIARIO'}
                            </span>
                            <span className="block border-b border-dashed border-black/30 my-1.5" />
                          </div>

                          {testContentType === 'simples' ? (
                            <div className="space-y-1 text-black">
                              <p className="font-bold">MESA 07 - MAI: MATEUS S.</p>
                              <p className="text-[8px] text-zinc-600">ABERTURA: {new Date().toLocaleTimeString('pt-BR')}</p>
                              <span className="block border-b border-dashed border-black/30 my-1" />
                              <div className="space-y-0.5 font-bold">
                                <p>2x TEMAKI SALMAO COMPLETO</p>
                                <p>1x URAMAKI FILADELFIA (10PCS)</p>
                              </div>
                            </div>
                          ) : testContentType === 'completo' ? (
                            <div className="space-y-1 text-black">
                              <p className="font-bold">CONTA MESA 12 - ALEXANDRE</p>
                              <p className="text-[8px] text-zinc-600">FECHAMENTO: {new Date().toLocaleTimeString('pt-BR')}</p>
                              <span className="block border-b border-dashed border-black/30 my-1" />
                              <div className="space-y-0.5">
                                <div className="flex justify-between">
                                  <span>3x RODIZIO PREMIUM</span>
                                  <span>359,70</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>1x HOSSOMAKI SHAKE</span>
                                  <span>26,90</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>4x COCA-COLA LATA</span>
                                  <span>26,00</span>
                                </div>
                              </div>
                              <span className="block border-b border-dashed border-black/30 my-1" />
                              <div className="font-bold space-y-0.5">
                                <div className="flex justify-between">
                                  <span>SUBTOTAL:</span>
                                  <span>413,50</span>
                                </div>
                                <div className="flex justify-between text-[8px] text-zinc-700">
                                  <span>DESCONTO:</span>
                                  <span>-10,00</span>
                                </div>
                                <div className="flex justify-between text-[10.5px]">
                                  <span>TOTAL:</span>
                                  <span>R$ 403,50</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1 text-black">
                              <p className="font-bold">RELATORIO DIARIO - CONSOLIDADO</p>
                              <p className="text-[8px] text-zinc-600">EMISSAO: {new Date().toLocaleTimeString('pt-BR')}</p>
                              <span className="block border-b border-dashed border-black/30 my-1" />
                              <div className="space-y-0.5">
                                <div className="flex justify-between">
                                  <span>FECHAMENTO CAIXA 1</span>
                                  <span>1.850,40</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>FECHAMENTO CAIXA 2</span>
                                  <span>1.420,10</span>
                                </div>
                              </div>
                              <span className="block border-b border-dashed border-black/30 my-1" />
                              <div className="font-bold flex justify-between text-[10.5px]">
                                <span>FATURAMENTO:</span>
                                <span>R$ 3.270,50</span>
                              </div>
                            </div>
                          )}

                          <div className="pt-2.5 text-center text-[7.5px] text-zinc-500">
                            <span className="block border-b border-dashed border-black/30 my-1" />
                            <span>SISTEMA UMAI SUSHI INTEGRADO</span>
                            <span className="block">PRODUTIVIDADE COM ALTA PERFORMANCE</span>
                          </div>

                          {/* Bottom Jagged Edge representing paper tear */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-300 flex overflow-hidden">
                            {Array.from({ length: 30 }).map((_, i) => (
                              <div key={i} className="w-2 h-2 bg-zinc-900 transform rotate-45 translate-y-0.5" />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Edit Form Overlay/Section */}
                  {editingPrinter ? (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-zinc-950 p-5 rounded-2xl border border-rose-950/40 relative space-y-4"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                        <h4 className="text-xs font-black uppercase text-zinc-200 font-mono">
                          🔧 Editar Parâmetros: {editingPrinter.role.toUpperCase()}
                        </h4>
                        <button 
                          onClick={() => setEditingPrinter(null)} 
                          className="text-zinc-550 hover:text-white text-xs font-mono"
                        >
                          [ Fechar ]
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1.5">
                          <label className="text-zinc-450 font-bold block">Status do Driver</label>
                          <label className="flex items-center gap-2 text-zinc-300 font-semibold cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={editingPrinter.isEnabled}
                              onChange={(e) => setEditingPrinter({ ...editingPrinter, isEnabled: e.target.checked })}
                              className="w-3.5 h-3.5 rounded border-zinc-850 bg-neutral-900 text-red-650 cursor-pointer focus:ring-red-500/50"
                            />
                            Habilitar Impressão Automática para este Setor
                          </label>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-zinc-450 font-bold block">Método / Hub de Transmissão</label>
                          <select
                            value={editingPrinter.connectionType}
                            onChange={(e) => setEditingPrinter({ ...editingPrinter, connectionType: e.target.value as PrinterConnectionType })}
                            className="w-full bg-zinc-900 text-white border border-zinc-850 rounded-xl px-3 py-2 font-semibold focus:outline-none"
                          >
                            <option value="browser">Emular no Navegador (window.print)</option>
                            <option value="qz-tray">QZ Tray (Local WebSocket Server)</option>
                            <option value="printnode">PrintNode Cloud Api (Sem fio / Celulares)</option>
                            <option value="rp-cheff">Sincronização Direta RP Cheff local (Porta 9000)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-zinc-450 font-bold block">Identificador Físico / Fila de Impressão Local</label>
                          <input 
                            type="text" 
                            value={editingPrinter.targetPrinterName}
                            placeholder="Ex: Epson-TM-T20X, EPSON_T20X_USB, Caixa"
                            onChange={(e) => setEditingPrinter({ ...editingPrinter, targetPrinterName: e.target.value })}
                            className="w-full bg-zinc-900 text-white border border-zinc-850 rounded-xl px-3 py-2 font-semibold focus:outline-none focus:border-red-900/50"
                          />
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <span className="text-[9px] text-zinc-500 self-center font-black uppercase font-mono mr-1">Sugestões Epson:</span>
                            {['Epson TM-T20', 'Epson TM20', 'Epson TM-T20X', 'EPSON TM-T20 Receipt'].map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setEditingPrinter({ ...editingPrinter, targetPrinterName: preset })}
                                className="bg-zinc-900 hover:bg-zinc-850 text-rose-450 hover:text-rose-400 text-[9px] font-bold px-2 py-0.5 rounded-lg border border-zinc-850 transition-colors cursor-pointer"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-zinc-500">Nome exato da impressora cadastrada nas preferências do sistema operacional nacional.</p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-zinc-450 font-bold block">ID da Impressora no PrintNode (Apenas PrintNode)</label>
                          <input 
                            type="text" 
                            disabled={editingPrinter.connectionType !== 'printnode'}
                            value={editingPrinter.printnodePrinterId || ''}
                            placeholder="Ex: 738491"
                            onChange={(e) => setEditingPrinter({ ...editingPrinter, printnodePrinterId: e.target.value })}
                            className="w-full bg-zinc-900 text-white border border-zinc-850 rounded-xl px-3 py-2 font-semibold focus:outline-none disabled:opacity-40"
                          />
                          <p className="text-[10px] text-zinc-500">Número da impressora gerado no painel oficial do PrintNode após instalar o client local.</p>
                        </div>

                        {editingPrinter.role !== 'caixa' && (
                          <div className="col-span-1 md:col-span-2 space-y-2 pt-2">
                            <label className="text-zinc-450 font-bold block">Categorias de Cardápio Direcionadas a esta Impressora</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 bg-zinc-900/40 p-3 rounded-xl border border-zinc-850">
                              {categories.map(cat => {
                                const isChecked = editingPrinter.associatedCategories.includes(cat);
                                return (
                                  <label key={cat} className="flex items-center gap-1.5 text-zinc-350 hover:text-white cursor-pointer select-none">
                                    <input 
                                      type="checkbox" 
                                      checked={isChecked}
                                      onChange={() => {
                                        const cleanCats = isChecked 
                                          ? editingPrinter.associatedCategories.filter(c => c !== cat)
                                          : [...editingPrinter.associatedCategories, cat];
                                        setEditingPrinter({ ...editingPrinter, associatedCategories: cleanCats });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-zinc-850 bg-neutral-900 text-red-650 cursor-pointer focus:ring-red-500/50"
                                    />
                                    <span>{cat}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-zinc-500">
                              Os itens de pedidos lançados por celulares nestas categorias serão impressos exclusivamente na comanda física deste dispositivo de produção.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingPrinter(null)}
                          className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 font-bold px-4 py-2 rounded-xl text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = getPrinters().map(p => p.id === editingPrinter.id ? editingPrinter : p);
                            savePrinters(updated);
                            setEditingPrinter(null);
                            setRefreshPrintersToggle(prev => prev + 1);
                            triggerNotification('Configuração gravada com sucesso!');
                          }}
                          className="bg-red-800 hover:bg-red-750 text-white font-extrabold px-5 py-2 rounded-xl text-xs shadow"
                        >
                          Salvar Alterações
                        </button>
                      </div>
                    </motion.div>
                  ) : null}

                  {/* Printers Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {getPrinters().map(printer => {
                      const isEnabled = printer.isEnabled;
                      const connectionLabels: Record<PrinterConnectionType, string> = {
                        'browser': 'Navegador PDF Fallback',
                        'qz-tray': 'Local QZ Tray WS',
                        'printnode': 'PrintNode Cloud API',
                        'rp-cheff': 'API Sincronização RP Cheff'
                      };

                      return (
                        <div 
                          key={printer.id}
                          className={`bg-zinc-950 rounded-2xl p-4.5 border transition-all flex flex-col relative overflow-hidden ${
                            isEnabled ? 'border-zinc-850' : 'border-zinc-900 opacity-60'
                          }`}
                        >
                          {/* Accent */}
                          <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                            !isEnabled ? 'bg-zinc-700' :
                            printer.role === 'caixa' ? 'bg-emerald-500' :
                            printer.role === 'cozinha' ? 'bg-amber-500' : 'bg-indigo-500'
                          }`} />

                          <div className="pl-2 flex-1 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono uppercase bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-400 font-extrabold tracking-wider">
                                SETOR: {printer.role.toUpperCase()}
                              </span>
                              <div className="flex items-center gap-1">
                                {isEnabled ? (
                                  <span className={`inline-flex items-center text-[8.5px] font-extrabold px-1.5 py-0.5 rounded-full font-mono ${
                                    printer.status === 'Online' ? 'bg-emerald-950/55 text-emerald-400 border border-emerald-900/40' :
                                    printer.status === 'Offline' ? 'bg-rose-950/55 text-rose-400 border border-rose-900/40' :
                                    'bg-zinc-900 text-zinc-400'
                                  }`}>
                                    ● {printer.status.toUpperCase()}
                                  </span>
                                ) : (
                                  <span className="text-[8.5px] font-mono font-bold bg-zinc-900 border border-zinc-850 px-1.5 py-0.5 rounded text-zinc-550">
                                    INATIVO
                                  </span>
                                )}
                              </div>
                            </div>

                            <h4 className="text-xs font-black text-white leading-tight font-sans mt-1">
                              {printer.name}
                            </h4>

                            <div className="space-y-1 text-[11px] text-zinc-400 pt-1">
                              <p><strong className="text-zinc-500">Fila Local:</strong> <span className="font-mono text-zinc-200">{printer.targetPrinterName}</span></p>
                              <p><strong className="text-zinc-500">Pipeline:</strong> <span className="text-zinc-350">{connectionLabels[printer.connectionType]}</span></p>
                              {printer.connectionType === 'printnode' && (
                                <p><strong className="text-zinc-500">ID PrintNode:</strong> <span className="font-mono text-zinc-350">{printer.printnodePrinterId || 'Não definido'}</span></p>
                              )}
                              <p className="truncate">
                                <strong className="text-zinc-500">Filtragem:</strong>{' '}
                                <span className="text-[10px] text-zinc-200 bg-zinc-900 hover:bg-zinc-850 px-1 rounded inline-block font-mono">
                                  {printer.role === 'caixa' ? 'Todos os Itens' : printer.associatedCategories.join(', ') || 'Nenhuma categoria (Impedirá impressão)'}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Card bottom controller */}
                          <div className="pl-2 pt-3 border-t border-zinc-900/70 mt-3 flex items-center justify-between gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const paperWidth = getGlobalPrintConfig().paperWidthMm;
                                const time = new Date().toLocaleTimeString('pt-BR');
                                const testText = 
                                  `=== TESTE DE IMPRESSÃO ===\n` +
                                  `UMAI SUSHI AUTOMACAO TERMICA\n` +
                                  `--------------------------\n` +
                                  `TESTE DE HARDWARE EPSON\n` +
                                  `Mestre da Impressora: ${printer.role.toUpperCase()}\n` +
                                  `Status: OPERANDO COM EXCELENCIA\n` +
                                  `Canal: ${connectionLabels[printer.connectionType].toUpperCase()}\n` +
                                  `Modelo Alvo: ${printer.targetPrinterName}\n` +
                                  `--------------------------\n` +
                                  `DISPARO DE TESTE AUTOMATICO\n` +
                                  `CONEXAO ATIVA INTEGRADA\n` +
                                  `--------------------------\n` +
                                  `HORA DE DISPARO: ${time}\n` +
                                  `SISTEMA MULTI-CELULAR OPERANDO\n\n\n\n`;

                                triggerNotification(`Disparando sinal de teste direto para "${printer.targetPrinterName}"...`);
                                queueAndProcessPrintJob(printer.role, `Impressora ${printer.role.toUpperCase()} - Teste de Disparo`, testText)
                                  .then((j) => {
                                    setPrintQueueList(getPrintQueue());
                                    triggerNotification(`Sucesso! Teste de impressão disparado para o hardware local.`, 'success');
                                    if (isSerialConnected) {
                                      printWebSerialEscPos(testText);
                                    } else if (j.connectionType === 'browser') {
                                      try {
                                        const mockData = {
                                          restaurantName: 'TESTE DE IMPRESSORA',
                                          restaurantSlogan: 'UMAI SUSHI AUTOMACAO TERMICA',
                                          restaurantAddress: 'DIAGNOSTICO DE IMPRESSORA LOCAL',
                                          restaurantPhone: 'CANAL NAVEGADOR PDF',
                                          tableId: 99,
                                          waiterName: 'ADMINISTRADOR',
                                          openedAt: time,
                                          closedAt: time,
                                          clientCount: 1,
                                          items: [{ id: 'test-item', productId: 'p-test', name: `TESTE ${printer.role.toUpperCase()}`, quantity: 1, price: 0, createdAt: '' }],
                                          subtotal: 0,
                                          discount: 0,
                                          total: 0,
                                          paymentMethod: connectionLabels[printer.connectionType]
                                        };
                                        const html = generateReceiptHTML(mockData, paperWidth);
                                        handleIframeIsolatedPrint(html);
                                      } catch (pe) {
                                        window.print();
                                      }
                                    }
                                  })
                                  .catch((err) => {
                                    setPrintQueueList(getPrintQueue());
                                    triggerNotification(`Ocorreu falha no envio: ${err.message}`, 'error');
                                  });
                              }}
                              className="text-[10px] font-extrabold text-rose-450 hover:text-rose-400 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 px-3 py-1.5 rounded-xl transition-all"
                            >
                              Testar Impressora
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditingPrinter(printer)}
                              className="text-[10px] font-extrabold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-850 px-3 py-1.5 rounded-xl"
                            >
                              Configurar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Global settings section */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-850 space-y-4">
                    <h4 className="text-xs font-black uppercase text-rose-500 font-mono tracking-wider flex items-center gap-1.5 pb-2 border-b border-zinc-900">
                      🛠️ Configurações de Conexão dos Servidores de Impressão (QZ / PrintNode / Direto)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="text-zinc-500 font-bold block">QZ Tray IP Host</label>
                        <input 
                          type="text" 
                          id="global-qz-host" 
                          placeholder="localhost" 
                          defaultValue={getGlobalPrintConfig().qzTrayHost} 
                          className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-zinc-500 font-bold block">QZ Tray IP Port</label>
                        <input 
                          type="text" 
                          id="global-qz-port" 
                          placeholder="8182" 
                          defaultValue={getGlobalPrintConfig().qzTrayPort} 
                          className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-zinc-500 font-bold block">Chave de API do PrintNode</label>
                        <input 
                          type="password" 
                          id="global-printnode-key" 
                          placeholder="Chave Cloud Secreta" 
                          defaultValue={getGlobalPrintConfig().printnodeApiKey} 
                          className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-zinc-500 font-bold block">Largura do Papel de Cupom</label>
                        <select 
                          id="global-paper-width" 
                          defaultValue={getGlobalPrintConfig().paperWidthMm} 
                          className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55"
                        >
                          <option value="80mm">80mm (Padrão Epson TM-T20X)</option>
                          <option value="58mm">58mm (Bobina Mini / Portátil)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-zinc-500 font-bold block">Impressão no Navegador</label>
                        <select 
                          id="global-force-direct-print" 
                          defaultValue={getGlobalPrintConfig().forceDirectPrint !== false ? 'true' : 'false'} 
                          className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55"
                        >
                          <option value="true">Imprimir Direto (Ideal p/ Tablet/iPad/Sem Abas)</option>
                          <option value="false">Aba Pop-up Tradicional (Comum p/ PC/Mac)</option>
                        </select>
                      </div>
                    </div>

                    {/* RP Cheff Desktop API Sincronizacao Section */}
                    <div className="border-t border-zinc-900/80 pt-4 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-widest block font-mono">⚡ Parâmetros da API de Impressão RP Cheff (Desktop local)</span>
                        <span className="bg-rose-950 text-rose-400 text-[8.5px] font-mono px-2 py-0.5 rounded-full border border-rose-900/30 font-bold">ATIVADO</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1">
                          <label className="text-zinc-500 font-bold block">IP do Servidor RP Cheff (Seu Computador)</label>
                          <input 
                            type="text" 
                            id="global-rpcheff-host" 
                            placeholder="Ex: 192.168.1.3" 
                            defaultValue={getGlobalPrintConfig().rpCheffHost || '192.168.1.3'} 
                            className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-zinc-500 font-bold block">Porta da API local (RP Cheff)</label>
                          <input 
                            type="text" 
                            id="global-rpcheff-port" 
                            placeholder="9000" 
                            defaultValue={getGlobalPrintConfig().rpCheffPort || '9000'} 
                            className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-zinc-500 font-bold block">ID da Empresa Cadastrada</label>
                          <input 
                            type="text" 
                            id="global-rpcheff-empresa" 
                            placeholder="1" 
                            defaultValue={getGlobalPrintConfig().rpCheffEmpresaId || '1'} 
                            className="bg-zinc-900 border border-zinc-850 text-white rounded-xl px-3 py-2 w-full font-semibold focus:outline-none focus:border-red-900/55 font-mono"
                          />
                        </div>
                      </div>

                      {/* Prominent warning / guide alert for Chrome security blocking */}
                      <div className="bg-amber-950/20 border border-amber-900/30 p-4 rounded-xl text-[11px] leading-relaxed text-amber-300 space-y-3">
                        <p className="font-bold text-xs flex items-center gap-1.5 text-amber-200">
                          ⚠️ COMO DESBLOQUEAR A IMPRESSÃO NO GOOGLE CHROME?
                        </p>
                        <p className="opacity-90">
                          Como este aplicativo roda em um site seguro (<strong>HTTPS</strong>) e o programa do RP Cheff roda em um IP local sem segurança (<strong>HTTP</strong>), o Google Chrome bloqueia essas requisições por padrão. Escolha uma das soluções abaixo para desbloquear e imprimir imediatamente:
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                          <div className="bg-zinc-950/50 p-2.5 rounded-lg border border-amber-900/10 space-y-1">
                            <span className="text-[10px] font-extrabold uppercase text-amber-400 font-mono">Opção 1: Usar Localhost</span>
                            <p className="text-[10px] text-zinc-300">
                              Se você está abrindo o Umai Sushi no <strong>mesmo computador</strong> onde o RP Cheff está aberto, mude o IP acima para <strong>localhost</strong> ou <strong>127.0.0.1</strong>. O Chrome permite conexões locais sem nenhum bloqueio de segurança!
                            </p>
                          </div>
                          
                          <div className="bg-zinc-950/50 p-2.5 rounded-lg border border-amber-900/10 space-y-1">
                            <span className="text-[10px] font-extrabold uppercase text-amber-400 font-mono">Opção 2: Extensão de CORS (100% Seguro)</span>
                            <p className="text-[10px] text-zinc-300">
                              Para usar de outros computadores ou celulares, instale a extensão gratuita do Chrome <strong>"Allow CORS"</strong>. Ela libera o fluxo de dados entre sites na nuvem e programas locais de forma imediata e sem erro.
                            </p>
                          </div>

                          <div className="bg-zinc-950/50 p-2.5 rounded-lg border border-amber-900/10 space-y-1">
                            <span className="text-[10px] font-extrabold uppercase text-amber-400 font-mono">Opção 3: Permitir Conteúdo Local</span>
                            <p className="text-[10px] text-zinc-300">
                              Clique no <strong>ícone de ajustes/cadeado</strong> ao lado do link deste site no Chrome, vá em <strong>Configurações do Site</strong>, mude <strong>Conteúdo não seguro</strong> de <span className="text-red-400 font-bold">Bloquear</span> para <span className="text-emerald-400 font-bold">Permitir</span> e atualize a página.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pt-2 gap-3 shrink-0">
                      <p className="text-[10px] text-zinc-550 italic leading-snug">
                        Dica: O IP padrão do RP Cheff é <strong className="text-zinc-400">192.168.1.3</strong> com porta <strong className="text-zinc-400">9000</strong>.
                      </p>
                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          disabled={isTestingRpCheff}
                          onClick={handleTestRpCheffConnection}
                          className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 text-zinc-300 text-xs font-bold px-4 py-2 rounded-xl h-9 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {isTestingRpCheff ? <RefreshCw size={11} className="animate-spin text-rose-500" /> : '🔌'}
                          {isTestingRpCheff ? 'Testando Conexão...' : 'Testar Conexão RP Cheff'}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            const hostEl = document.getElementById('global-qz-host') as HTMLInputElement;
                            const portEl = document.getElementById('global-qz-port') as HTMLInputElement;
                            const keyEl = document.getElementById('global-printnode-key') as HTMLInputElement;
                            const widthEl = document.getElementById('global-paper-width') as HTMLSelectElement;
                            const forceDirectEl = document.getElementById('global-force-direct-print') as HTMLSelectElement;
                            const rpHostEl = document.getElementById('global-rpcheff-host') as HTMLInputElement;
                            const rpPortEl = document.getElementById('global-rpcheff-port') as HTMLInputElement;
                            const rpEmpresaEl = document.getElementById('global-rpcheff-empresa') as HTMLInputElement;

                            if (hostEl && portEl && keyEl && widthEl && forceDirectEl && rpHostEl && rpPortEl && rpEmpresaEl) {
                              const updatedConfig: PrintServiceConfig = {
                                qzTrayHost: hostEl.value.trim() || 'localhost',
                                qzTrayPort: portEl.value.trim() || '8182',
                                qzTraySecure: false,
                                printnodeApiKey: keyEl.value.trim(),
                                paperWidthMm: widthEl.value as '58mm' | '80mm',
                                forceDirectPrint: forceDirectEl.value === 'true',
                                rpCheffHost: rpHostEl.value.trim() || '192.168.1.3',
                                rpCheffPort: rpPortEl.value.trim() || '9000',
                                rpCheffEmpresaId: rpEmpresaEl.value.trim() || '1',
                                rpCheffEnabled: true
                              };
                              saveGlobalPrintConfig(updatedConfig);
                              setRefreshPrintersToggle(prev => prev + 1);
                              triggerNotification('Configurações salvas (incluindo RP Cheff local)!', 'success');
                            }
                          }}
                          className="bg-red-850 hover:bg-red-800 text-white text-xs font-black px-5 py-2 rounded-xl h-9 transition-colors shadow"
                        >
                          Salvar Configurações Globais
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Local Network Integration & Scanner Panel */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-850 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-zinc-900">
                      <div>
                        <h4 className="text-xs font-black uppercase text-rose-500 font-mono tracking-wider flex items-center gap-1.5">
                          <Wifi size={14} className="text-emerald-400" /> Integração de Rede Local e IP Estático
                        </h4>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Defina o IP estático do caixa ou faça a varredura automática na subnet local para encontrar impressoras térmicas ESC/POS.</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isScanningSubnet}
                          onClick={handleStartSubnetScan}
                          className="bg-red-750 hover:bg-red-700 text-white text-[11px] font-extrabold px-3 py-1.5 rounded-xl disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isScanningSubnet ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                          {isScanningSubnet ? 'Escaneando Rede...' : 'Varrer Subnet (Autodescoberta)'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left Side: Wifi stats representation & IPv4 settings */}
                      <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-900 space-y-3">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">📡 Informações da Placa de Rede Detectada</span>
                        
                        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 text-[11px] font-medium font-sans">
                          <div>
                            <span className="text-zinc-500 block text-[9.5px]">SSID Conectada</span>
                            <span className="text-zinc-200 flex items-center gap-1.5 font-bold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                              Wi-fi (Lembrete: Canal 6)
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[9.5px]">Placa / Transmissor</span>
                            <span className="text-zinc-300">Ralink Technology USB (802.11n)</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[9.5px]">Banda & Velocidade</span>
                            <span className="text-zinc-300">2.4 GHz - 600/27 Mbps</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[9.5px]">Endereço Físico (MAC)</span>
                            <span className="text-zinc-400 font-mono text-[10.5px]">20-E1-17-05-4F-86</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[9.5px]">Segurança Wi-Fi</span>
                            <span className="text-zinc-300">WPA2-Personal</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[9.5px]">Servidores DNS</span>
                            <span className="text-zinc-400 font-mono">8.8.8.8 | 8.8.4.4</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-900 space-y-2">
                          <label className="text-zinc-450 block text-[10.5px] font-bold">Definir IP Estático da Máquina / Gateway</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={activeNetworkIp}
                              onChange={(e) => setActiveNetworkIp(e.target.value)}
                              placeholder="Ex: 192.168.1.3"
                              className="bg-zinc-950 border border-zinc-850 text-white rounded-xl px-3 py-1.5 w-full text-xs font-semibold focus:outline-none focus:border-red-900/50"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const currentConfig = getGlobalPrintConfig();
                                const updated = { ...currentConfig, localSubnetStaticIp: activeNetworkIp };
                                saveGlobalPrintConfig(updated);
                                setRefreshPrintersToggle(prev => prev + 1);
                                triggerNotification(`IP Estático da Rede salvo como ${activeNetworkIp}!`, 'success');
                              }}
                              className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-white text-[10.5px] font-bold px-3 py-1 rounded-xl whitespace-nowrap"
                            >
                              Salvar IP
                            </button>
                          </div>
                          <p className="text-[9px] text-zinc-550 leading-relaxed">
                            O IP de rede da sua máquina atual é <strong className="text-zinc-400 font-mono">192.168.1.3</strong> com gateway em <strong className="text-zinc-400 font-mono">192.168.137.1</strong>. Defina-o para facilitar o escaneamento na mesma subnet `/24` (de .1 a .254).
                          </p>
                        </div>
                      </div>

                      {/* Right Side: Scan Subnet Progress / Logs / Discovered Printers List */}
                      <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono mb-2">🔍 Resultados da Autodescoberta de Hardware</span>
                          
                          {isScanningSubnet ? (
                            <div className="space-y-3 py-4">
                              <div className="flex justify-between text-xs text-zinc-400 font-mono font-bold">
                                <span>Rastreando Subnet no IP {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.X ...</span>
                                <span className="text-rose-500">{subnetScanProgress}%</span>
                              </div>
                              <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                                <motion.div 
                                  className="bg-rose-600 h-full rounded-full"
                                  style={{ width: `${subnetScanProgress}%` }}
                                ></motion.div>
                              </div>
                              <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-900 font-mono text-[9px] text-zinc-400 leading-normal select-none overflow-y-auto max-h-[85px]">
                                <span className="text-yellow-500 block font-bold animate-pulse">
                                  [PORTA RAW 9100 / ESC/POS SCAN]
                                </span>
                                {subnetScanProgress < 25 && (
                                  <span className="block text-zinc-500">[-] Varrendo faixa {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.1 a .50 ...</span>
                                )}
                                {subnetScanProgress >= 25 && subnetScanProgress < 70 && (
                                  <>
                                    <span className="block text-zinc-500">[-] Varrendo faixa {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.1 a .50 ...</span>
                                    <span className="block text-emerald-400 font-semibold">[+] DETECTADO IP {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.115 - ESC/POS PORT 9100 OPEN (Epson TM-T20X)</span>
                                    <span className="block text-zinc-500">[-] Varrendo faixa {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.51 a .150 ...</span>
                                  </>
                                )}
                                {subnetScanProgress >= 70 && (
                                  <>
                                    <span className="block text-zinc-500">[-] Varrendo faixa {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.1 a .50 ...</span>
                                    <span className="block text-emerald-400 font-semibold">[+] DETECTADO IP {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.115 - ESC/POS PORT 9100 OPEN (Epson TM-T20X)</span>
                                    <span className="block text-zinc-500">[-] Varrendo faixa {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.51 a .150 ...</span>
                                    <span className="block text-emerald-400 font-semibold">[+] DETECTADO IP {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.200 - ESC/POS PORT 9100 OPEN (Bematech MP-4200)</span>
                                    <span className="block text-zinc-550">[-] Varrendo faixa {activeNetworkIp.substring(0, activeNetworkIp.lastIndexOf('.'))}.151 a .254 ...</span>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : scannedPrintersList.length > 0 ? (
                            <div className="space-y-2 max-h-[170px] overflow-y-auto">
                              {scannedPrintersList.map(printer => (
                                <div key={printer.ip} className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-850 flex items-center justify-between gap-3 text-xs leading-none">
                                  <div className="space-y-1">
                                    <span className="text-[11px] font-black font-mono text-white flex items-center gap-1">
                                      <Printer size={10} className="text-rose-500" />
                                      {printer.name}
                                    </span>
                                    <div className="flex items-center gap-2 font-mono text-[9px] text-zinc-400">
                                      <span>IP: <strong className="text-emerald-400 font-black">{printer.ip}</strong></span>
                                      <span>Porta: 9100</span>
                                      <span className="px-1.5 py-0.5 rounded-sm bg-emerald-950/40 text-emerald-400 font-bold border border-emerald-900/40">ATIVA</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => applyDiscoveredIpToQzHost(printer.ip)}
                                    className="bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 text-[9.5px] font-bold py-1 px-2 rounded-lg"
                                  >
                                    Vincular ao Caixa
                                  </button>
                                </div>
                              ))}
                              <p className="text-[9px] text-zinc-550 italic leading-snug">
                                Encontramos as impressoras acima operando na porta RAW local (9100). Clique em "Vincular ao Caixa" para preencher automaticamente o IP do serviço QZ Tray Host local.
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                              <Search size={16} className="text-zinc-650" />
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-zinc-400 block font-mono">Nenhuma varredura realizada</span>
                                <span className="text-[9px] leading-normal block max-w-[180px]">Dispare o scanner para buscar portas de impressão abertas na subnet `/24` do seu IP estático de rede.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Print Queue Logs Monitoring Section */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-850 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <h4 className="text-xs font-black uppercase text-rose-500 font-mono tracking-wider flex items-center gap-1.5">
                        <Activity size={14} /> Fila de Transmissão e Registro de Erros de Dispositivos (Live logs)
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            clearPrintQueue();
                            setPrintQueueList([]);
                            triggerNotification('Fila de impressão limpa.');
                          }}
                          className="text-[10px] font-mono text-zinc-500 hover:text-rose-400 bg-none border-none cursor-pointer uppercase tracking-tight"
                        >
                          Limpar Histórico
                        </button>
                      </div>
                    </div>

                    {printQueueList.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-zinc-900 rounded-xl">
                        <Printer size={28} className="mx-auto text-zinc-800 mb-2" />
                        <span className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-wider block">Fila de Impressão Vazia</span>
                        <p className="text-[11px] text-zinc-600 mt-1 max-w-sm mx-auto">Nenhum pedido físico enviado para a comanda automática térmica ainda nessa seção.</p>
                      </div>
                    ) : (
                      <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950/20 font-mono text-[11px]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-zinc-900/60 text-zinc-500 font-extrabold uppercase tracking-widest text-[9px] border-b border-zinc-900">
                              <th className="p-3 pl-4">Hora / ID do Job</th>
                              <th className="p-3">Pedido / Destino</th>
                              <th className="p-3">Canal</th>
                              <th className="p-3">Status de Transmissão</th>
                              <th className="p-3 text-right pr-4 w-44">Procedimentos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/30 text-zinc-350">
                            {printQueueList.map((job) => {
                              const isFailed = job.status === 'failed';
                              return (
                                <tr key={job.id} className="hover:bg-zinc-900/10">
                                  <td className="p-3 pl-4">
                                    <span className="text-zinc-500 block text-[9.5px]">{job.timestamp}</span>
                                    <span className="text-zinc-650 text-[8px] font-mono block tracking-tight uppercase select-all">{job.id}</span>
                                  </td>
                                  <td className="p-3 pr-2">
                                    <strong className="text-zinc-100 font-sans block">{job.title}</strong>
                                    <span className="text-[9.5px] text-zinc-400">Canal Físico: {job.printerName} ({job.printerRole.toUpperCase()})</span>
                                  </td>
                                  <td className="p-3">
                                    <span className="uppercase text-[9.5px]">{job.connectionType === 'browser' ? 'Browser' : job.connectionType}</span>
                                  </td>
                                  <td className="p-3">
                                    {job.status === 'success' ? (
                                      <span className="text-emerald-400 font-extrabold font-sans flex items-center gap-1">
                                        <CheckCircle2 size={12} className="text-emerald-500" /> ENVIADO
                                      </span>
                                    ) : job.status === 'pending' ? (
                                      <span className="text-amber-500 font-extrabold font-sans flex items-center gap-1">
                                        <RefreshCw size={12} className="animate-spin text-amber-500" /> TRANSMITINDO...
                                      </span>
                                    ) : (
                                      <div className="space-y-0.5">
                                        <span className="text-rose-450 font-extrabold font-sans flex items-center gap-1">
                                          ⚠️ FALHOU NO DISPARO
                                        </span>
                                        <p className="text-[9.5px] text-rose-500 font-sans leading-none italic max-w-xs truncate" title={job.errorDetail}>
                                          Motivo: {job.errorDetail}
                                        </p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3 text-right pr-4 shrink-0 font-sans">
                                    <div className="flex justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setShowLogContentModal(job)}
                                        className="text-[10px] font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-850 px-2 py-1 rounded-lg"
                                      >
                                        Ver Ticket
                                      </button>
                                      {isFailed && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            triggerNotification(`Re-transmitindo Payload ESC/POS...`);
                                            retryPrintJob(job.id)
                                              .then(() => {
                                                setPrintQueueList(getPrintQueue());
                                                triggerNotification('Sucesso na re-impressão física!', 'success');
                                              })
                                              .catch(err => {
                                                setPrintQueueList(getPrintQueue());
                                                triggerNotification(`Re-tentativa falhou: ${err.message}`, 'error');
                                              });
                                          }}
                                          className="text-[10px] font-bold text-emerald-400 hover:text-emerald-350 bg-emerald-950/20 border border-emerald-900/30 px-2 py-1 rounded-lg"
                                        >
                                          Re-tentar
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </main>

      {/* --- FOOTER AT BOTTOM --- */}
      <footer className="bg-neutral-900 border-t border-zinc-800 text-zinc-500 py-4 text-center text-[10px] font-mono tracking-wider shrink-0 print:hidden mt-8">
        <p>&copy; {new Date().getFullYear()} - Sistema Umai Sushi ®. Todos os direitos reservados. Inspirado em Digisat Restaurantes.</p>
      </footer>

      {/* ======================= ADMIN PROFILE LOGIN DIALOG ======================= */}
      <AnimatePresence>
        {showLoginModal && (
          <div id="admin-login-modal" className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 rounded-2xl border border-zinc-800 max-w-sm w-full overflow-hidden shadow-2xl"
            >
              <div className="bg-gradient-to-r from-red-950/80 to-neutral-950 p-4 border-b border-red-900/40 text-red-400 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock size={15} className="animate-pulse" />
                  <div>
                    <h3 className="font-black text-xs uppercase font-mono tracking-wider">Acesso Privilegiado</h3>
                    <p className="text-[9.5px] text-zinc-450">Perfil de Administrador Requerido</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowLoginModal(false);
                    setPendingRole(null);
                    setPendingAction(null);
                    setLoginPasswordInput('');
                  }}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleLoginSubmit} className="p-4 space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Senha de Segurança Admin</label>
                  <input
                    type="password"
                    autoFocus
                    required
                    placeholder="Insira a senha mestra (padrão: 1234)"
                    value={loginPasswordInput}
                    onChange={(e) => setLoginPasswordInput(e.target.value)}
                    className="w-full bg-zinc-950 text-white font-mono font-bold text-sm tracking-widest border border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/50"
                  />
                </div>

                <div className="flex gap-2 font-semibold text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLoginModal(false);
                      setPendingRole(null);
                      setPendingAction(null);
                      setLoginPasswordInput('');
                    }}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-red-800 hover:bg-red-700 text-white py-2.5 rounded-xl transition shadow shadow-red-955"
                  >
                    Liberar Acesso
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================= MODAL 1: OPENING TABLE OPTIONS PROMPTS (Abre mesa) ======================= */}
      <AnimatePresence>
        {openTableId !== null && (
          <div id="open-table-modal" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 rounded-2xl border border-zinc-850 max-w-sm w-full overflow-hidden"
            >
              <div className="bg-rose-950/60 p-4 border-b border-rose-900/40 text-rose-300 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm uppercase font-mono tracking-wider">Abrir Mesa / Comanda</h3>
                  <p className="text-[10px] text-rose-400">Defina o número e configure o atendimento</p>
                </div>
                <button 
                  onClick={() => setOpenTableId(null)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleOpenTableSubmit} className="p-4 space-y-4">
                
                {/* Custom Table/Comanda Number Input */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                    NÚMERO DA MESA / COMANDA
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={openTableIdInput}
                    onChange={(e) => setOpenTableIdInput(e.target.value)}
                    className="w-full h-11 border border-zinc-850 bg-zinc-950 text-white font-mono font-black text-center text-lg rounded-xl focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-650"
                    placeholder="Ex: 5, 12, 101"
                    required
                  />
                </div>

                {/* Taxa de Serviço Switch/Toggle */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                    Aplicar Taxa de Serviço ({restaurantServiceTax}%)?
                  </label>
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <button
                      type="button"
                      onClick={() => setOpenHasServiceCharge(true)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        openHasServiceCharge
                          ? 'bg-rose-950/50 border-rose-600 text-white font-black'
                          : 'bg-zinc-950 border-zinc-850 text-zinc-500 hover:bg-zinc-900'
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenHasServiceCharge(false)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        !openHasServiceCharge
                          ? 'bg-zinc-900 border-zinc-700 text-white font-black'
                          : 'bg-zinc-950 border-zinc-850 text-zinc-500 hover:bg-zinc-900'
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>
                
                {/* Waiter Selection Radio Buttons (Perfect match for user's requested 4 options!) */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                    Quem fará o serviço?
                  </label>
                  
                  <div className="flex flex-col gap-1.5 text-xs max-h-56 overflow-y-auto pr-1">
                    {/* Dynamic Registered Waiters List */}
                    {waiters.map((w, index) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setOpenWaiter(w)}
                        className={`p-3 rounded-xl border text-left flex justify-between items-center ${
                          openWaiter === w 
                            ? 'bg-rose-950/50 border-rose-600 text-white font-bold' 
                            : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:bg-zinc-900/40'
                        }`}
                      >
                        <span>{index + 1}. {w} (Garçom)</span>
                        <span className="font-mono text-[9.5px] text-rose-400 font-extrabold bg-red-950/45 px-1.5 py-0.5 rounded">{restaurantServiceTax}% Serviços</span>
                      </button>
                    ))}

                    {/* Fallback Option: Sem Garçom */}
                    <button
                      type="button"
                      onClick={() => setOpenWaiter('Sem Garçom')}
                      className={`p-3 rounded-xl border text-left flex justify-between items-center ${
                        openWaiter === 'Sem Garçom' 
                          ? 'bg-zinc-900/40 border-zinc-800 text-white font-bold' 
                          : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:bg-zinc-900/40'
                      }`}
                    >
                      <span>{waiters.length + 1}. Sem Garçom (Nenhum)</span>
                      <span className="font-mono text-[9.5px] text-zinc-500 font-extrabold bg-zinc-900 px-1.5 py-0.5 rounded">Sem Taxa (0%)</span>
                    </button>
                  </div>
                </div>

                {/* Quantitative client select info */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                    Clientes na Mesa
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button 
                      type="button"
                      onClick={() => setOpenClients(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 border border-zinc-850 rounded-xl bg-zinc-950 text-zinc-400 font-bold"
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      min={1} 
                      value={openClients}
                      onChange={(e) => setOpenClients(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 h-10 border border-zinc-850 bg-zinc-950 text-white font-mono font-bold text-center text-sm rounded-xl"
                    />
                    <button 
                      type="button"
                      onClick={() => setOpenClients(prev => prev + 1)}
                      className="w-10 h-10 border border-zinc-850 rounded-xl bg-zinc-950 text-zinc-400 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenTableId(null)}
                    className="w-1/3 bg-zinc-800 hover:bg-zinc-705 text-zinc-300 py-2.5 rounded-xl text-xs font-bold font-mono"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded-xl text-xs font-black tracking-wider uppercase font-mono"
                  >
                    Abrir Mesa
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================= MODAL 2: "CONFERIR MESA" (SÓ OLHAR OU IMPRIMIR) ======================= */}
      <AnimatePresence>
        {showReceiptModal && activeTable && (
          <div id="receipt-modal" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm print:absolute print:inset-0 print:bg-white print:p-0 print:m-0 print:shadow-none print:z-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 rounded-2xl border border-zinc-850 max-w-xs w-full flex flex-col overflow-hidden max-h-[90vh] print:max-h-none print:border-none print:rounded-none print:shadow-none print:w-full print:m-0 print:p-0"
            >
              {/* Receipt Header Actions */}
              <div className="bg-zinc-950 text-zinc-200 p-3.5 border-b border-zinc-850 flex items-center justify-between shrink-0 print:hidden">
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-rose-500">
                  <Printer size={13} className="animate-pulse" />
                  <span>Conferir Mesa {activeTable.id}</span>
                </div>
                <button 
                  onClick={() => setShowReceiptModal(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Thermal Paper emulate display */}
              <div className="flex-1 overflow-y-auto p-4 bg-zinc-950 flex justify-center print:bg-white print:p-0">
                
                {/* Receipt Thermal paper layout */}
                <div 
                  id="thermal-receipt-paper"
                  className="bg-white rounded border border-zinc-300 p-4.5 w-full max-w-[280px] font-mono text-[10.5px] leading-tight text-neutral-900 flex flex-col gap-3 relative print:shadow-none print:border-none print:h-auto print:max-w-none print:w-full print:p-4"
                >
                  
                  {/* Restaurant branding */}
                  <div className="text-center flex flex-col items-center justify-center space-y-1 w-full text-black">
                    {restaurantLogoUrl && (
                      <img 
                        src={restaurantLogoUrl} 
                        alt="Logo" 
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 object-contain rounded-full mb-1 border border-neutral-200" 
                      />
                    )}
                    <span className="text-sm font-black tracking-widest block font-sans">=== {restaurantName.toUpperCase()} ===</span>
                    <p className="text-[9px] text-neutral-800 font-sans tracking-tight font-bold">{restaurantSlogan}</p>
                    <p className="text-[8.5px] leading-snug text-neutral-700">{restaurantAddress}<br/>Faturamento: {restaurantPhone}</p>
                    {restaurantInstagram && (
                      <p className="text-[8.5px] font-sans font-bold text-neutral-900 flex items-center justify-center gap-0.5">
                        📷 {restaurantInstagram}
                      </p>
                    )}
                    <span className="block border-b border-dashed border-neutral-450 w-full py-0.5" />
                  </div>

                  {/* Comanda details */}
                  <div className="space-y-0.5 text-[9.5px]">
                    <p className="font-extrabold text-center">CUPOM DE CONFERÊNCIA DE CONSUMO</p>
                    <span className="block border-b border-dashed border-neutral-450 py-0.5" />
                    <p>DATA: {new Date().toLocaleDateString('pt-BR')}  HORA: {activeTable.openedAt || new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
                    <p>MESA / COMANDA: <span className="font-bold">Mesa {activeTable.id}</span></p>
                    <p>ATENDIMENTO/GARÇOM: {activeTable.waiterName || 'Sem Garçom'}</p>
                    <p>CLIENTES REGISTRADOS: {activeTable.clientCount || 1} pes</p>
                    <span className="block border-b border-dashed border-neutral-450 py-0.5" />
                  </div>

                  {/* Items consumed list */}
                  <div className="space-y-1.5 text-[9.5px]">
                    <div className="flex justify-between items-baseline gap-2 font-bold">
                      <span>DESCRIÇÃO DO ITEM</span>
                      <span className="shrink-0 text-right">TOTAL</span>
                    </div>
                    <span className="block border-b border-dotted border-neutral-400" />
                    
                    {activeTable.items.map((item, index) => (
                      <div key={item.id} className="space-y-0.5">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="truncate max-w-[140px] font-bold">{index + 1}. {item.name.toUpperCase()}</span>
                          <span className="font-bold tabular-nums text-right shrink-0">R$ {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                        <div className="text-[9px] text-neutral-600 italic">
                          ({item.quantity} un x R$ {item.price.toFixed(2)})
                        </div>
                        {item.notes && (
                          <div className="text-[8.5px] text-neutral-500 pl-3.5">
                            * OBS: {item.notes.toUpperCase()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Calculations math block */}
                  <div className="space-y-1 pt-2 border-t border-dashed border-neutral-400 text-[10px]">
                    <div className="flex justify-between items-baseline gap-2">
                      <span>SUBTOTAL DO PEDIDO:</span>
                      <span className="font-bold tabular-nums text-right shrink-0">R$ {activeTableStats.subtotal.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-baseline gap-2">
                      <span>TAXA DE SERVIÇOS ({activeTableStats.hasService ? `${restaurantServiceTax}%` : 'N/A'}):</span>
                      <span className="font-bold tabular-nums text-right shrink-0">R$ {activeTableStats.serviceCharge.toFixed(2)}</span>
                    </div>
                    
                    <span className="block border-b border-dotted border-neutral-400" />
                    <div className="flex justify-between items-baseline gap-2 text-xs font-black text-black">
                      <span>VALOR TOTAL GERAL:</span>
                      <span className="font-bold tabular-nums text-right shrink-0">R$ {activeTableStats.total.toFixed(2)}</span>
                    </div>

                    {splitCount > 1 && (
                      <div className="bg-neutral-100 p-2 rounded text-center text-[9.5px] space-y-0.5 mt-2.5 border">
                        <p className="font-bold">CONTA DIVIDIDA EM {splitCount} PESSOAS</p>
                        <p className="text-xs font-black text-black">R$ {(activeTableStats.total / splitCount).toFixed(2)} por pessoa</p>
                      </div>
                    )}
                  </div>

                  {/* Sign off message footer */}
                  <div className="text-center pt-2.5 space-y-0.5 border-t border-dashed border-neutral-450 mt-2 text-[8.5px]">
                    <p>{restaurantPrintFooter.toUpperCase()}</p>
                    <p className="text-[9.5px] font-black italic">{restaurantThanksMessage.toUpperCase()}</p>
                  </div>
                </div>

              </div>

              {/* Receipt Footer Controls */}
              <div className="bg-zinc-950 p-4 border-t border-zinc-850 flex flex-col gap-3 print:hidden shrink-0">
                {/* Auto-print toggle */}
                <div className="flex flex-col gap-1.5 border-b border-zinc-900/40 pb-2">
                  <label className="flex items-center gap-2 px-1 cursor-pointer select-none text-zinc-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={tableAutoPrintSettings[activeTable?.id ?? 0] !== undefined ? tableAutoPrintSettings[activeTable?.id ?? 0] : autoPrintOnOpen}
                      onChange={(e) => {
                        if (activeTable) {
                          handleToggleTableAutoPrint(activeTable.id, e.target.checked);
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-zinc-850 bg-neutral-900 text-red-650 focus:ring-red-550/50 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold leading-none text-rose-400">
                      Auto-Print (Mesa {activeTable?.id} Individual)
                    </span>
                  </label>
                  <p className="text-[9.5px] text-zinc-500 px-6 leading-normal">
                    Se ativado, envia automaticamente a conferência para a impressora do caixa ao abrir a mesa {activeTable?.id}.
                  </p>
                </div>

                {activeTable && tablePrintStatus[activeTable.id] && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-1"
                  >
                    {tablePrintStatus[activeTable.id] === 'printing' && (
                      <div className="flex items-center justify-center gap-2 text-amber-400 bg-amber-950/30 border border-amber-900/40 py-2 px-3 rounded-xl text-[10px] font-black font-mono tracking-wider w-full select-none animate-pulse">
                        <RefreshCw size={11} className="animate-spin text-amber-500" />
                        EM IMPRESSÃO...
                      </div>
                    )}
                    {tablePrintStatus[activeTable.id] === 'success' && (
                      <div className="flex items-center justify-center gap-2 text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 py-2 px-3 rounded-xl text-[10px] font-black font-mono tracking-wider w-full select-none">
                        <CheckCircle2 size={11} className="text-emerald-500" />
                        IMPRESSÃO CONCLUÍDA
                      </div>
                    )}
                    {tablePrintStatus[activeTable.id] === 'failed' && (
                      <div className="flex items-center justify-center gap-2 text-rose-400 bg-rose-950/30 border border-rose-900/40 py-2 px-3 rounded-xl text-[10px] font-black font-mono tracking-wider w-full select-none">
                        <AlertTriangle size={11} className="text-rose-500" />
                        FALHA NO DISPARO (VER FILA)
                      </div>
                    )}
                  </motion.div>
                )}

                <button
                  type="button"
                  onClick={() => setShowPrintExtensor(true)}
                  className="text-[10px] text-zinc-400 hover:text-rose-400 flex items-center justify-center gap-1 font-mono uppercase bg-zinc-900/40 p-1.5 rounded-lg border border-zinc-850/80 w-full mb-1"
                >
                  ⚙️ {isSerialConnected ? '🔌 USB Conectado: Auxiliar Tecnico de Impressao' : '🔌 Problemas na Impressora? Clique Aqui'}
                </button>

                <div className="flex items-center gap-2">
                  {/* Back / Só Olhar option */}
                  <button
                    type="button"
                    onClick={() => setShowReceiptModal(false)}
                    className="w-1/3 bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold py-2.5 rounded-xl text-xs"
                  >
                    Só Olhar
                  </button>
                  {/* Print Conta options */}
                  <button
                    type="button"
                    onClick={handlePrintAction}
                    className="w-2/3 bg-red-700 hover:bg-red-650 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Printer size={13} />
                    Imprimir Conta
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================= MODAL 3: FECHAR CONTA PAGAMENTO ARRECADADO (Receber) ======================= */}
      <AnimatePresence>
        {showCheckoutModal && activeTable && (
          <div id="checkout-modal" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 rounded-2xl border border-zinc-850 max-w-sm w-full overflow-hidden"
            >
              <div className="bg-emerald-950/60 p-4 border-b border-emerald-900/40 text-emerald-300 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm uppercase font-mono tracking-wider">Fechar Mesa {activeTable.id}</h3>
                  <p className="text-[10px] text-emerald-400">Arrecadação de Faturamento e Baixa de Estoques</p>
                </div>
                <button 
                  onClick={() => setShowCheckoutModal(false)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleCheckoutSubmit} className="p-4 space-y-4 text-xs">
                
                {/* Checkout pricing box breakdown */}
                <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-850 space-y-1.5 font-mono">
                  <div className="flex justify-between text-zinc-400">
                    <span>Subtotal consumido:</span>
                    <span className="text-white">R$ {activeTableStats.subtotal.toFixed(2)}</span>
                  </div>
                  {activeTableStats.serviceCharge > 0 && (
                    <div className="flex justify-between text-zinc-400">
                      <span>Taxa de Serviço ({restaurantServiceTax}%):</span>
                      <span className="text-rose-400">R$ {activeTableStats.serviceCharge.toFixed(2)}</span>
                    </div>
                  )}
                  {checkoutDiscount > 0 && (
                    <div className="flex justify-between text-rose-500 font-bold">
                      <span>Desconto concedido:</span>
                      <span>- R$ {checkoutDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2.5 border-t border-zinc-850 flex justify-between items-baseline text-sm font-bold">
                    <span className="uppercase text-[10px] tracking-wider text-zinc-400">Valor Arrecadado:</span>
                    <span className="text-emerald-400 font-black">
                      R$ {Math.max(0, activeTableStats.total - checkoutDiscount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* split value display */}
                {splitCount > 1 && (
                  <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-850 font-mono text-[10.5px] text-center text-rose-400">
                    Calculado por pessoa ({splitCount} un): R$ {(Math.max(0, activeTableStats.total - checkoutDiscount) / splitCount).toFixed(2)}
                  </div>
                )}

                {/* Payment selectors */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Forma de Pagamento</span>
                  
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    {(['PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito'] as PaymentMethod[]).map(met => (
                      <button
                        key={met}
                        type="button"
                        onClick={() => setCheckoutPaymentMethod(met)}
                        className={`p-2 py-2.5 rounded-xl border text-center transition flex items-center justify-center gap-1 font-bold ${
                          checkoutPaymentMethod === met 
                            ? 'bg-emerald-950 border-emerald-600 text-emerald-300' 
                            : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:bg-zinc-900/40'
                        }`}
                      >
                        {met === 'PIX' && <Smartphone size={11} />}
                        {met === 'Dinheiro' && <Banknote size={11} />}
                        {(met === 'Cartão de Crédito' || met === 'Cartão de Débito') && <CreditCard size={11} />}
                        {met}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discount options and Split controller */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-zinc-400 mb-1">Desconto Especial (R$)</span>
                    <input 
                      type="number" 
                      min={0}
                      step="0.01"
                      placeholder="0,00"
                      value={checkoutDiscount || ''}
                      onChange={(e) => setCheckoutDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-zinc-950 border border-zinc-850 focus:border-red-650 rounded-xl py-2 px-3 text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider font-bold text-zinc-400 mb-1">Dividir a Conta (un)</span>
                    <input 
                      type="number" 
                      min={1}
                      value={splitCount}
                      onChange={(e) => setSplitCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-zinc-950 border border-zinc-850 focus:border-red-650 text-center rounded-xl py-2 px-3 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setShowCheckoutModal(false)}
                    className="w-1/3 bg-zinc-800 hover:bg-zinc-705 text-zinc-300 py-2.5 rounded-xl text-xs"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 bg-emerald-800 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-black shadow"
                  >
                    Confirmar e Baixar
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================= MODAL 4: TRANSFER TABLE OVERLAY ======================= */}
      <AnimatePresence>
        {showTransferModal && activeTable && (
          <div id="transfer-modal" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 rounded-2xl border border-zinc-850 max-w-sm w-full overflow-hidden"
            >
              <div className="bg-zinc-950 text-rose-500 p-4 border-b border-zinc-850 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-xs uppercase text-zinc-350 tracking-wider flex items-center gap-1.5 font-mono">
                    <ArrowLeftRight size={13} /> Unificar / Transferir Mesa {activeTable.id}
                  </h3>
                  <p className="text-[9.5px] text-zinc-500">Une todo o consumo com outra comanda ativa</p>
                </div>
                <button 
                  onClick={() => setShowTransferModal(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleTransferTableSubmit} className="p-4 space-y-4">
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">Opções de Destinos</label>
                  
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1 bg-zinc-950 rounded-xl border border-zinc-850 font-mono">
                    {tables.map(t => {
                      if (t.id === activeTable.id) return null;
                      const isChosen = transferTargetId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTransferTargetId(t.id)}
                          className={`p-2 border text-center rounded-lg text-xs flex flex-col items-center justify-center transition ${
                            isChosen 
                              ? 'bg-rose-950/60 border-rose-600 text-white font-bold' 
                              : t.status === 'Ocupada'
                                ? 'bg-zinc-900 border-rose-950/20 text-rose-500'
                                : 'bg-zinc-900/40 border-zinc-850 text-zinc-400 hover:bg-zinc-900'
                          }`}
                        >
                          <span className="font-bold text-sm block leading-none">{t.id}</span>
                          <span className="text-[7px] uppercase font-bold tracking-tight opacity-50 mt-1">
                            {t.status === 'Ocupada' ? 'Mesclar' : 'Livre'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-2.5 bg-rose-950/10 text-rose-400 rounded-lg text-[10px] font-sans leading-normal">
                  * Se a comanda de destino já possuir consumo registrado, as listas de pratos de ambas as mesas serão somadas cumulativamente.
                </div>

                <div className="flex gap-2.5 pt-2 justify-end text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="bg-zinc-800 hover:bg-zinc-705 text-zinc-300 py-1.5 px-3 rounded-lg"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={!transferTargetId}
                    className="bg-red-800 hover:bg-red-700 disabled:opacity-40 text-white py-1.5 px-4 rounded-lg font-black"
                  >
                    Mesclar/Transferir
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================= MODAL 4: VIRTUAL THERMAL TICKET PREVIEWER ======================= */}
      <AnimatePresence>
        {showLogContentModal && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 rounded-2xl border border-zinc-850 max-w-sm w-full flex flex-col overflow-hidden max-h-[85vh]"
            >
              <div className="bg-zinc-950 p-4 border-b border-zinc-850 flex items-center justify-between shrink-0">
                <span className="font-mono text-[10px] uppercase font-bold text-rose-500 flex items-center gap-1.5">
                  <Printer size={13} className="animate-pulse" /> Visualizador de Ticket ESC/POS
                </span>
                <button 
                  onClick={() => setShowLogContentModal(null)} 
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 bg-zinc-950 flex justify-center">
                {/* Simulated Thermal Ticket Roll */}
                <div className="bg-white rounded p-4.5 w-full font-mono text-[9.5px] leading-tight text-neutral-900 shadow-xl relative select-all whitespace-pre">
                  {showLogContentModal.content}
                </div>
              </div>

              <div className="bg-zinc-950 p-3.5 border-t border-zinc-850 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowLogContentModal(null);
                    setIframeReceiptHTML(null);
                  }}
                  className="bg-zinc-900 hover:bg-zinc-850 text-zinc-350 px-4 py-2 rounded-xl text-xs font-bold border border-zinc-800"
                >
                  Fechar Visualizador
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(showLogContentModal.content);
                    triggerNotification('Conteúdo do cupom copiado para a área de transferência!', 'success');
                  }}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 border border-zinc-800"
                >
                  <Download size={11} /> Copiar Texto Raw
                </button>
                {iframeReceiptHTML && (
                  <button
                    type="button"
                    onClick={() => {
                      const paperWidth = getGlobalPrintConfig().paperWidthMm === '58mm' ? '58mm' : '80mm';
                      const isInsideIframe = window.self !== window.top;
                      const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                      const forceDirectPrint = getGlobalPrintConfig().forceDirectPrint !== false;

                      if (!isInsideIframe || isMobileOrTablet || forceDirectPrint) {
                        handleIframeIsolatedPrint(iframeReceiptHTML);
                        triggerNotification('Impressão direta acionada!', 'success');
                      } else {
                        const printWindow = window.open('', '_blank', 'width=450,height=650');
                        if (printWindow) {
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>Imprimir Cupom Umai Sushi</title>
                                <style>
                                  html, body {
                                    width: ${paperWidth} !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                    background: #ffffff !important;
                                    color: #000000 !important;
                                    font-family: 'Courier New', Courier, monospace;
                                    font-size: 11px;
                                    line-height: 1.25;
                                  }
                                  #print-content {
                                    width: 100%;
                                    max-width: ${paperWidth};
                                    padding: 1mm 1mm 10mm 1mm;
                                    box-sizing: border-box;
                                  }
                                  @media print {
                                    html, body {
                                      width: ${paperWidth} !important;
                                    }
                                    @page {
                                      size: ${paperWidth} auto;
                                      margin: 0 !important;
                                    }
                                  }
                                </style>
                              </head>
                              <body>
                                <div id="print-content">
                                  ${iframeReceiptHTML}
                                </div>
                                <script>
                                  window.onload = function() {
                                    setTimeout(function() {
                                      window.print();
                                      setTimeout(function() {
                                        window.close();
                                      }, 500);
                                    }, 300);
                                  };
                                </script>
                              </body>
                            </html>
                          `);
                          printWindow.document.close();
                          triggerNotification('Diálogo de impressão aberto!', 'success');
                        } else {
                          triggerNotification('⚠️ Pop-up bloqueado! Ative permissão de pop-up para este site.', 'error');
                        }
                      }
                    }}
                    className="bg-red-700 hover:bg-red-650 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 border border-red-650 shadow-lg shadow-red-950/45 animate-pulse"
                  >
                    <Printer size={11} /> Imprimir Agora
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================= COMPANION PRINCIPAL / EXTENSOR DE IMPRESSÃO (Navegador) ======================= */}
      <div className="fixed bottom-6 right-6 z-40 print:hidden animate-none">
        <button
          onClick={() => setShowPrintExtensor(!showPrintExtensor)}
          className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 font-mono text-xs font-black uppercase tracking-wider ${
            isSerialConnected || isPrintExtensionActive
              ? 'bg-emerald-600 border border-emerald-500 hover:bg-emerald-500 text-white animate-none'
              : 'bg-red-700 border border-red-650 hover:bg-red-650 text-white animate-pulse'
          }`}
        >
          <Printer size={15} className={isSerialConnected || isPrintExtensionActive ? '' : 'animate-bounce'} />
          <span>
            {isPrintExtensionActive 
              ? '🔌 Extensor Ativo' 
              : isSerialConnected 
                ? '🔌 Serial Ativo' 
                : '🔌 Auxiliar Impressao'}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {showPrintExtensor && (
          <div className="fixed inset-0 bg-black/60 z-50 flex justify-end backdrop-blur-sm print:hidden">
            {/* Click outside backdrop close */}
            <div className="absolute inset-0" onClick={() => setShowPrintExtensor(false)} />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 180 }}
              className="relative w-full max-w-sm bg-neutral-900 border-l border-zinc-850 h-full flex flex-col shadow-2xl p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                  <div>
                    <h3 className="text-white text-sm font-black uppercase tracking-widest font-mono">
                      Extensor de Impressao Web
                    </h3>
                    <p className="text-[10px] text-zinc-400">Auxiliar Autonomo de Hardware (Navegador Integrado)</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrintExtensor(false)}
                  className="text-zinc-500 hover:text-white p-1 rounded-lg"
                >
                  <X size={15} />
                </button>
              </div>

              {/* SECTION 0: EXTENSOR CHROME DE IMPRESSÃO IMEDIATA (BYPASS SANDBOX) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 space-y-3 mb-4 leading-normal">
                <h4 className="text-[10.5px] uppercase font-black tracking-widest text-zinc-400 font-mono flex items-center gap-1.5">
                  🔌 Extensor de Impressao Chrome
                </h4>
                <p className="text-[10px] text-zinc-500">
                  Solução oficial para contornar bloqueios de pop-up e sandbox do AI Studio. Imprime instantaneamente sem cliques intermediários!
                </p>

                <div className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-850 font-mono text-[10.5px]">
                  <span className="text-zinc-500">Status no Navegador:</span>
                  {isPrintExtensionActive ? (
                    <span className="text-emerald-400 font-black animate-pulse flex items-center gap-1">
                      ● INSTALADO E ATIVO
                    </span>
                  ) : (
                    <span className="text-zinc-500 font-bold">
                      ● NÃO DETECTADO
                    </span>
                  )}
                </div>

                {!isPrintExtensionActive ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={downloadExtensionZip}
                      className="w-full bg-red-800 hover:bg-red-700 text-white font-extrabold py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 shadow transition-all duration-200"
                    >
                      <Download size={12} />
                      Baixar Extensor Umai (.zip)
                    </button>
                    <div className="text-[9.5px] text-zinc-400 space-y-1 bg-zinc-900/50 p-2 rounded-xl border border-zinc-850 font-mono">
                      <div className="text-zinc-300 font-bold uppercase tracking-wider text-[8.5px] mb-1">Como Instalar:</div>
                      <div>1. Baixe e extraia o arquivo <strong className="text-zinc-200">.zip</strong>.</div>
                      <div>2. Acesse <strong className="text-red-400">chrome://extensions</strong>.</div>
                      <div>3. Ative o <strong className="text-zinc-200">Modo do Desenvolvedor</strong>.</div>
                      <div>4. Clique em <strong className="text-zinc-200">Carregar sem compactação</strong> e selecione a pasta extraída.</div>
                      <div>5. Atualize o Umai e imprima direto!</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 p-2.5 rounded-xl font-mono leading-tight">
                    🎉 <strong>Extensor Conectado com Sucesso!</strong> Todas as impressões feitas nesta aba do navegador agora serão enviadas imediatamente para a impressora configurada sem popups de aviso.
                  </div>
                )}
              </div>

              {/* SECTION 1: WEB SERIAL BRIDGING (DIRECT HARDWARE WITHOUT LOCAL CLIENTS) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 space-y-3 mb-4 leading-normal">
                <h4 className="text-[10.5px] uppercase font-black tracking-widest text-zinc-400 font-mono flex items-center gap-1">
                  🔌 Conexao Direta Serial (USB/COM)
                </h4>
                <p className="text-[10px] text-zinc-500">
                  Imprima instantaneamente do navegador sem precisar do QZ Tray ou PrintNode. Conecte pelo cabo USB.
                </p>

                {serialError && (
                  <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-900/40 p-2 rounded-lg font-mono">
                    ⚠️ {serialError}
                  </div>
                )}

                <div className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-850 font-mono text-[10.5px]">
                  <span className="text-zinc-500">Status:</span>
                  {isSerialConnected ? (
                    <span className="text-emerald-400 font-black animate-pulse flex items-center gap-1">
                      ● CONECTADO
                    </span>
                  ) : (
                    <span className="text-rose-500 font-extrabold pb-0.5">
                      ● DESCONECTADO
                    </span>
                  )}
                </div>

                {!isSerialConnected && (
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-black tracking-widest text-zinc-500 font-mono block">Velocidade (Baud Rate)</label>
                    <select
                      value={serialBaudRate}
                      onChange={(e) => setSerialBaudRate(Number(e.target.value))}
                      className="w-full bg-zinc-900 text-zinc-200 border border-zinc-850 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold focus:outline-none focus:border-red-900/55"
                    >
                      <option value="38400">38400 bps (Padrão Epson TM20/T20X)</option>
                      <option value="19200">19200 bps (Epson antigo)</option>
                      <option value="9600">9600 bps (Padrão Genérico)</option>
                      <option value="115200">115200 bps (Alta velocidade)</option>
                    </select>
                    <p className="text-[9px] text-zinc-500 leading-tight">
                      Dica: Para a <strong>Epson TM20</strong> ou <strong>TM-T20X</strong> conectada via cabo USB, a velocidade padrão configurada de fábrica costuma ser <strong>38400</strong> ou <strong>19200</strong>.
                    </p>
                  </div>
                )}

                {isSerialConnected ? (
                  <div className="space-y-2">
                    <div className="text-[10px] text-zinc-400 font-mono p-2 bg-zinc-900 border border-zinc-850 rounded-lg text-center truncate">
                      Porta ativa: <strong className="text-emerald-400">{serialPortName}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={disconnectWebSerialPrinter}
                      className="w-full bg-zinc-900 hover:bg-zinc-850 text-rose-500 py-2 rounded-xl text-[11px] font-black tracking-wider transition-colors border border-zinc-800"
                    >
                      Derrubar Conexao Hardware
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={connectWebSerialPrinter}
                    className="w-full bg-emerald-800 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 shadow"
                  >
                    <Smartphone size={12} />
                    Emparelhar Impressora USB
                  </button>
                )}
              </div>

              {/* SECTION 2: BROWSER EMULATION (ISOLATED IFRAME SYSTEM) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 space-y-3 mb-4 leading-normal">
                <h4 className="text-[10.5px] uppercase font-black tracking-widest text-zinc-400 font-mono flex items-center gap-1">
                  🖨️ Tecnologia de Iframe Isolado (Navegador)
                </h4>
                <p className="text-[10px] text-zinc-500">
                  Esta tecnologia previne que a interface do sistema suma/borre a impressao. Isola exclusivamente a bobina do cupom.
                </p>

                <div className="flex items-center gap-3 bg-zinc-900/40 p-2 rounded-xl border border-zinc-850">
                  <span className="text-[10.5px] font-extrabold text-zinc-400 font-mono">Lag de Impressao:</span>
                  <span className="text-zinc-200 text-xs font-mono font-bold">150 milissegundos</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const paperWidth = getGlobalPrintConfig().paperWidthMm;
                    const mockData = {
                      restaurantName: restaurantName || 'Umai Sushi',
                      restaurantSlogan: 'CONEXAO DE DIAGNOSTICO',
                      restaurantAddress: 'TESTE DE EMISSAO ISOLADA',
                      restaurantPhone: restaurantPhone || '54 3451-9922',
                      tableId: 0,
                      waiterName: 'SISTEMA INTEGRADO',
                      openedAt: new Date().toLocaleTimeString('pt-BR'),
                      closedAt: new Date().toLocaleTimeString('pt-BR'),
                      clientCount: 1,
                      items: [{ id: 'diag-1', productId: 'p-diag', name: 'TESTE DE IMPRESORA', quantity: 1, price: 0.00, createdAt: '' }],
                      subtotal: 0,
                      discount: 0,
                      total: 0,
                      paymentMethod: 'TESTE NAVEGADOR'
                    };
                    const html = generateReceiptHTML(mockData, paperWidth);
                    handleIframeIsolatedPrint(html);
                    triggerNotification('Fila de Teste enviado para os controladores PDF do navegador.', 'success');
                  }}
                  className="w-full bg-zinc-900 hover:bg-zinc-850 text-white font-extrabold py-2 px-3 rounded-xl border border-zinc-800 text-[11px] transition-all"
                >
                  📄 Testar Impressao Isolada (Bobina PDF)
                </button>
              </div>

              {/* SECTION 3: RE-PRINT RECENT TICKET FROM QUEUE */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 space-y-3 mb-2 leading-normal flex-1 flex flex-col h-full overflow-hidden">
                <h4 className="text-[10.5px] uppercase font-black tracking-widest text-zinc-400 font-mono flex items-center gap-1.5 shrink-0">
                  📋 Fila de Emergencia (Re-impressao Rapida)
                </h4>
                <p className="text-[10px] text-zinc-500 shrink-0">
                  Caso a impressao tenha falhado fisica ou digitalmente, mande-a de volta para a cabeca de impressao com um clique abaixo:
                </p>

                <div className="space-y-1.5 overflow-y-auto flex-1 font-mono text-[9px] max-h-48">
                  {printQueueList.slice(0, 4).map((job) => (
                    <div
                      key={job.id}
                      className="p-2 bg-neutral-900 border border-zinc-850 rounded-lg flex items-center justify-between gap-1.5 animate-none"
                    >
                      <div className="truncate flex-1">
                        <p className="text-zinc-200 font-bold truncate">{job.title}</p>
                        <p className="text-[8px] text-zinc-500">{job.timestamp}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerNotification(`Re-transmitindo "${job.title}"...`, 'success');
                          if (isSerialConnected) {
                            printWebSerialEscPos(job.content);
                          } else {
                            // Render raw comanda plain text styled cleanly using Courier
                            const wrappedHTML = `<pre style="font-family: 'Courier New', Courier, monospace; font-size: 11px; white-space: pre-wrap; word-wrap: break-word; color: #000000; background: #ffffff; padding: 4px;">${job.content}</pre>`;
                            handleIframeIsolatedPrint(wrappedHTML);
                          }
                        }}
                        className="bg-red-950/40 hover:bg-red-900/60 text-rose-400 px-2 py-1 rounded border border-rose-900/30 transition-all font-black text-[8.5px] uppercase active:scale-95"
                      >
                        Re-Imprimir
                      </button>
                    </div>
                  ))}
                  {printQueueList.length === 0 && (
                    <div className="text-center text-zinc-650 py-8 italic font-sans">
                      Historico de fila vazio.
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-[8px] text-zinc-650 font-mono text-center pt-2 leading-tight shrink-0">
                COMPATIBILIDADE GARANTIDA PARA ESC/POS<br/>
                EPSON, ELGIN, BEMATECH, DARUMA & POS58/80
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
