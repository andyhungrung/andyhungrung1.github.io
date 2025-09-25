import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, BarChart3, Settings, Plus, Trash2, Edit, Download, Upload, Save, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// IndexedDB 配置
const DB_NAME = 'POSSystemDB';
const DB_VERSION = 2;
const PRODUCTS_STORE = 'products';
const SALES_STORE = 'sales';

// 圓餅圖顏色配置
const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', 
  '#82CA9D', '#FFC658', '#FF7300', '#00C4A7', '#8DD1E1'
];

// IndexedDB 初始化
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('瀏覽器不支援 IndexedDB'));
      return;
    }

    console.log('初始化 IndexedDB...');
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('IndexedDB 開啟失敗:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      console.log('IndexedDB 開啟成功');
      const db = event.target.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      console.log('IndexedDB 需要升級...');
      const db = event.target.result;
      
      if (db.objectStoreNames.contains(PRODUCTS_STORE)) {
        db.deleteObjectStore(PRODUCTS_STORE);
      }
      if (db.objectStoreNames.contains(SALES_STORE)) {
        db.deleteObjectStore(SALES_STORE);
      }
      
      const productStore = db.createObjectStore(PRODUCTS_STORE, { keyPath: 'id' });
      productStore.createIndex('name', 'name', { unique: false });
      console.log('Products store 創建完成');
      
      const salesStore = db.createObjectStore(SALES_STORE, { keyPath: 'id' });
      salesStore.createIndex('timestamp', 'timestamp', { unique: false });
      console.log('Sales store 創建完成');
    };

    request.onblocked = () => {
      console.warn('IndexedDB 被阻塞，請關閉其他標籤頁');
      reject(new Error('IndexedDB 被阻塞'));
    };
  });
};

// IndexedDB 操作函數
const dbOperation = (storeName, operation, data = null) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`執行 DB 操作: ${operation} on ${storeName}`, data);
      
      const db = await initDB();
      const transaction = db.transaction([storeName], operation === 'get' || operation === 'getAll' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(storeName);
      
      let request;
      switch (operation) {
        case 'add':
          request = store.add(data);
          break;
        case 'put':
          request = store.put(data);
          break;
        case 'delete':
          request = store.delete(data);
          break;
        case 'get':
          request = store.get(data);
          break;
        case 'getAll':
          request = store.getAll();
          break;
        default:
          reject(new Error('未知操作: ' + operation));
          return;
      }
      
      request.onsuccess = (event) => {
        console.log(`DB 操作 ${operation} 成功:`, event.target.result);
        resolve(event.target.result);
      };
      
      request.onerror = (event) => {
        console.error(`DB 操作 ${operation} 失敗:`, event.target.error);
        reject(event.target.error);
      };
      
      transaction.oncomplete = () => {
        console.log(`Transaction ${operation} 完成`);
        db.close();
      };
      
      transaction.onerror = (event) => {
        console.error(`Transaction ${operation} 錯誤:`, event.target.error);
        db.close();
        reject(event.target.error);
      };
      
      transaction.onabort = () => {
        console.error(`Transaction ${operation} 被中止`);
        db.close();
        reject(new Error('Transaction 被中止'));
      };
      
    } catch (error) {
      console.error('dbOperation 錯誤:', error);
      reject(error);
    }
  });
};

const POS = () => {
  const [currentPage, setCurrentPage] = useState('sales');
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [manualProduct, setManualProduct] = useState({ name: '', price: '' });
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // 自定義確認對話框
  const showConfirm = (message, action) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  const handleCancel = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // 自定義提示對話框
  const showAlertMessage = (message) => {
    setAlertMessage(message);
    setShowAlert(true);
  };

  // 載入資料
  useEffect(() => {
    const initializeApp = async () => {
      console.log('應用程式初始化開始...');
      try {
        await loadProducts();
        await loadSales();
        console.log('應用程式初始化完成');
      } catch (error) {
        console.error('應用程式初始化失敗:', error);
        showAlertMessage('資料庫初始化失敗，某些功能可能無法正常使用。請重新整理頁面。');
      }
    };
    
    initializeApp();
  }, []);

  // 計算購物車總額
  useEffect(() => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    setCartTotal(total);
  }, [cart]);

  const loadProducts = async () => {
    try {
      console.log('載入商品資料...');
      const allProducts = await dbOperation(PRODUCTS_STORE, 'getAll');
      console.log('載入的商品:', allProducts);
      setProducts(allProducts || []);
    } catch (error) {
      console.error('載入商品失敗:', error);
      setProducts([]);
    }
  };

  const loadSales = async () => {
    try {
      console.log('載入銷售記錄...');
      const allSales = await dbOperation(SALES_STORE, 'getAll');
      console.log('載入的銷售記錄:', allSales);
      const sortedSales = (allSales || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setSales(sortedSales);
    } catch (error) {
      console.error('載入銷售記錄失敗:', error);
      setSales([]);
    }
  };

  // 商品管理
  const saveProduct = async (product) => {
    try {
      const productData = {
        id: product.id || Date.now().toString(),
        name: product.name,
        price: parseFloat(product.price),
        timestamp: new Date().toISOString()
      };
      
      await dbOperation(PRODUCTS_STORE, 'put', productData);
      loadProducts();
      setShowProductModal(false);
      setEditingProduct(null);
      showAlertMessage('商品儲存成功！');
    } catch (error) {
      console.error('儲存商品失敗:', error);
      showAlertMessage('儲存商品失敗：' + (error.message || error));
    }
  };

  const deleteProduct = async (productId, productName) => {
    try {
      console.log('=== 刪除操作開始 ===');
      console.log('商品ID:', productId);
      console.log('商品名稱:', productName);
      
      await dbOperation(PRODUCTS_STORE, 'delete', productId);
      console.log('資料庫刪除成功');
      
      await loadProducts();
      console.log('商品列表重新載入完成');
      
      showAlertMessage(`商品「${productName}」刪除成功！`);
      console.log('=== 刪除操作完成 ===');
    } catch (error) {
      console.error('刪除商品失敗:', error);
      showAlertMessage('刪除商品失敗：' + (error.message || error));
    }
  };

  // 購物車管理
  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const addManualProduct = () => {
    if (manualProduct.name && manualProduct.price) {
      const product = {
        id: 'manual_' + Date.now(),
        name: manualProduct.name,
        price: parseFloat(manualProduct.price)
      };
      addToCart(product);
      setManualProduct({ name: '', price: '' });
    } else {
      showAlertMessage('請輸入商品名稱和價格');
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(cart.map(item => 
      item.id === productId 
        ? { ...item, quantity: quantity }
        : item
    ));
  };

  // 結帳
  const checkout = async () => {
    if (cart.length === 0) {
      showAlertMessage('購物車是空的');
      return;
    }

    try {
      const sale = {
        id: Date.now().toString(),
        items: cart,
        total: cartTotal,
        timestamp: new Date().toISOString()
      };
      
      await dbOperation(SALES_STORE, 'add', sale);
      setCart([]);
      loadSales();
      showAlertMessage(`結帳成功！總金額：$${cartTotal}`);
    } catch (error) {
      console.error('結帳失敗:', error);
      showAlertMessage('結帳失敗：' + (error.message || error));
    }
  };

  // 報表功能
  const getFilteredSales = () => {
    let filtered = [...sales];
    
    if (filterStartDate) {
      filtered = filtered.filter(sale => new Date(sale.timestamp) >= new Date(filterStartDate));
    }
    
    if (filterEndDate) {
      filtered = filtered.filter(sale => new Date(sale.timestamp) <= new Date(filterEndDate + ' 23:59:59'));
    }
    
    return filtered;
  };

  const getProductAnalysis = () => {
    const filteredSales = getFilteredSales();
    const analysis = {};
    
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (analysis[item.name]) {
          analysis[item.name].quantity += item.quantity;
          analysis[item.name].revenue += item.price * item.quantity;
        } else {
          analysis[item.name] = {
            name: item.name,
            quantity: item.quantity,
            revenue: item.price * item.quantity,
            price: item.price
          };
        }
      });
    });
    
    return Object.values(analysis).sort((a, b) => b.revenue - a.revenue);
  };

  // 準備圓餅圖資料
  const getPieChartData = () => {
    const analysis = getProductAnalysis();
    return analysis.map((item, index) => ({
      name: item.name,
      value: item.revenue,
      quantity: item.quantity,
      color: COLORS[index % COLORS.length]
    }));
  };

  const getQuantityPieData = () => {
    const analysis = getProductAnalysis();
    return analysis.map((item, index) => ({
      name: item.name,
      value: item.quantity,
      revenue: item.revenue,
      color: COLORS[index % COLORS.length]
    }));
  };

  // 自定義圓餅圖標籤
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null; // 小於5%不顯示標籤
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // 自定義Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.name}</p>
          <p className="text-blue-600">銷售金額: ${data.value || data.revenue}</p>
          <p className="text-green-600">銷售數量: {data.quantity || data.value} 件</p>
        </div>
      );
    }
    return null;
  };

  // 匯出功能
  const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) {
      showAlertMessage('沒有資料可以匯出');
      return;
    }

    try {
      const headers = Object.keys(data[0]);
      const headerRow = headers.join(',');
      
      const csvRows = data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      );
      
      const csvContent = headerRow + '\n' + csvRows.join('\n');
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;
      
      const blob = new Blob([csvWithBOM], { 
        type: 'text/csv;charset=utf-8;' 
      });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      showAlertMessage('檔案匯出成功！');
    } catch (error) {
      console.error('匯出CSV失敗:', error);
      showAlertMessage('匯出失敗：' + error.message);
    }
  };

  const exportSalesData = () => {
    const filteredSales = getFilteredSales();
    
    if (filteredSales.length === 0) {
      showAlertMessage('沒有銷售資料可以匯出');
      return;
    }
    
    const exportData = filteredSales.map(sale => ({
      '銷售日期': new Date(sale.timestamp).toLocaleDateString('zh-TW'),
      '銷售時間': new Date(sale.timestamp).toLocaleTimeString('zh-TW'),
      '商品明細': sale.items.map(item => `${item.name}×${item.quantity}`).join('；'),
      '總金額': sale.total,
      '交易編號': sale.id
    }));
    
    const filename = `銷售記錄_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.csv`;
    exportToCSV(exportData, filename);
  };

  const exportProductAnalysis = () => {
    const analysis = getProductAnalysis();
    
    if (analysis.length === 0) {
      showAlertMessage('沒有商品分析資料可以匯出');
      return;
    }
    
    const exportData = analysis.map((item, index) => ({
      '排名': index + 1,
      '商品名稱': item.name,
      '商品單價': item.price,
      '銷售數量': item.quantity,
      '銷售金額': item.revenue,
      '平均單次購買量': Math.round((item.quantity / getSalesCountForProduct(item.name)) * 100) / 100 || 0
    }));
    
    const filename = `商品銷售分析_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.csv`;
    exportToCSV(exportData, filename);
  };

  // 輔助函數：計算商品被購買的次數
  const getSalesCountForProduct = (productName) => {
    const filteredSales = getFilteredSales();
    return filteredSales.filter(sale => 
      sale.items.some(item => item.name === productName)
    ).length;
  };

  // 備份與還原
  const backupData = async () => {
    try {
      const allProducts = await dbOperation(PRODUCTS_STORE, 'getAll');
      const allSales = await dbOperation(SALES_STORE, 'getAll');
      
      const backupData = {
        products: allProducts,
        sales: allSales,
        timestamp: new Date().toISOString(),
        version: DB_VERSION
      };
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `POS備份_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      showAlertMessage('資料備份完成！');
    } catch (error) {
      console.error('備份失敗:', error);
      showAlertMessage('備份失敗：' + error.message);
    }
  };

  const restoreData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backupData = JSON.parse(e.target.result);
        
        showConfirm(
          '確定要還原資料嗎？這將覆蓋現有資料。',
          async () => {
            try {
              for (const product of backupData.products) {
                await dbOperation(PRODUCTS_STORE, 'put', product);
              }
              
              for (const sale of backupData.sales) {
                await dbOperation(SALES_STORE, 'put', sale);
              }
              
              await loadProducts();
              await loadSales();
              showAlertMessage('資料還原完成！');
            } catch (error) {
              console.error('還原過程失敗:', error);
              showAlertMessage('還原過程失敗：' + error.message);
            }
          }
        );
      } catch (error) {
        console.error('還原失敗:', error);
        showAlertMessage('還原失敗，請確認檔案格式正確');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // 商品編輯模態框
  const ProductModal = () => {
    const [formData, setFormData] = useState(editingProduct || { name: '', price: '' });

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-96">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingProduct ? '編輯商品' : '新增商品'}
            </h3>
            <button 
              onClick={() => { setShowProductModal(false); setEditingProduct(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">商品名稱</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="輸入商品名稱"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">價格</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="輸入價格"
                step="0.01"
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <button
                onClick={() => saveProduct(formData)}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                disabled={!formData.name || !formData.price}
              >
                儲存
              </button>
              <button
                onClick={() => { setShowProductModal(false); setEditingProduct(null); }}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* 頂部導航 */}
      <div className="bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">POS系統</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage('sales')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                currentPage === 'sales' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <ShoppingCart size={20} />
              銷售
            </button>
            <button
              onClick={() => setCurrentPage('products')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                currentPage === 'products' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <Package size={20} />
              商品管理
            </button>
            <button
              onClick={() => setCurrentPage('reports')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                currentPage === 'reports' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <BarChart3 size={20} />
              報表
            </button>
            <button
              onClick={() => setCurrentPage('backup')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                currentPage === 'backup' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <Settings size={20} />
              備份
            </button>
          </div>
        </div>
      </div>

      {/* 主要內容 */}
      <div className="flex-1 flex overflow-hidden">
        {currentPage === 'sales' && (
          <>
            {/* 左側商品區域 */}
            <div className="flex-1 p-6 overflow-auto">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4">商品選擇</h2>
                
                {/* 手動輸入商品 */}
                <div className="bg-white p-4 rounded-lg shadow mb-4">
                  <h3 className="font-medium mb-2">快速新增商品</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="商品名稱"
                      value={manualProduct.name}
                      onChange={(e) => setManualProduct({ ...manualProduct, name: e.target.value })}
                      className="flex-1 border border-gray-300 rounded px-3 py-2"
                    />
                    <input
                      type="number"
                      placeholder="價格"
                      value={manualProduct.price}
                      onChange={(e) => setManualProduct({ ...manualProduct, price: e.target.value })}
                      className="w-24 border border-gray-300 rounded px-3 py-2"
                      step="0.01"
                    />
                    <button
                      onClick={addManualProduct}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                      disabled={!manualProduct.name || !manualProduct.price}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
                
                {/* 常用商品 */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {products.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow border-2 hover:border-blue-300"
                    >
                      <div className="text-lg font-medium">{product.name}</div>
                      <div className="text-blue-600 font-semibold">${product.price}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 右側購物車 */}
            <div className="w-80 bg-white border-l p-6 flex flex-col">
              <h2 className="text-xl font-semibold mb-4">購物車</h2>
              
              <div className="flex-1 overflow-auto mb-4">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 border-b">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-600">${item.price} × {item.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                        className="w-8 h-8 bg-gray-200 rounded text-center hover:bg-gray-300"
                      >
                        -
                      </button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                        className="w-8 h-8 bg-gray-200 rounded text-center hover:bg-gray-300"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="border-t pt-4">
                <div className="text-xl font-bold mb-4">總計: ${cartTotal}</div>
                <button
                  onClick={checkout}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
                  disabled={cart.length === 0}
                >
                  結帳
                </button>
              </div>
            </div>
          </>
        )}

        {currentPage === 'products' && (
          <div className="flex-1 p-6 overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">商品管理</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    console.log('測試按鈕被點擊');
                    showAlertMessage('測試按鈕正常工作！');
                  }}
                  className="bg-yellow-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-yellow-600"
                >
                  測試
                </button>
                <button
                  onClick={() => {
                    console.log('新增按鈕被點擊');
                    setShowProductModal(true);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                >
                  <Plus size={20} />
                  新增商品
                </button>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 bg-gray-50 border-b">
                <p className="text-sm text-gray-600">
                  目前共有 <span className="font-semibold">{products.length}</span> 項商品
                </p>
              </div>
              
              {products.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>尚無商品資料，請先新增商品</p>
                </div>
              ) : (
                <div className="grid gap-4 p-4">
                  {products.map((product, index) => (
                    <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">{product.name}</h3>
                            <p className="text-sm text-gray-500">ID: {product.id}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">${product.price}</p>
                          <p className="text-xs text-gray-500">價格</p>
                        </div>
                        
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              console.log('編輯按鈕被點擊，商品:', product);
                              setEditingProduct(product);
                              setShowProductModal(true);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                            title="編輯商品"
                          >
                            <Edit size={18} />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              
                              console.log('刪除按鈕被點擊，商品:', product);
                              
                              showConfirm(
                                `確定要刪除商品「${product.name}」嗎？\n\n商品ID: ${product.id}`,
                                () => deleteProduct(product.id, product.name)
                              );
                            }}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                            title="刪除商品"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentPage === 'reports' && (
          <div className="flex-1 p-6 overflow-auto">
            <h2 className="text-xl font-semibold mb-6">銷售報表</h2>
            
            {/* 時間篩選 */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <h3 className="font-medium mb-4">時間篩選</h3>
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="block text-sm font-medium text-gray-700">開始日期</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="mt-1 border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">結束日期</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="mt-1 border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={exportSalesData}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2"
                  >
                    <Download size={16} />
                    匯出銷售記錄
                  </button>
                  <button
                    onClick={exportProductAnalysis}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Download size={16} />
                    匯出商品分析
                  </button>
                </div>
              </div>
            </div>
            
            {/* 圓餅圖分析區域 */}
            {getProductAnalysis().length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* 銷售金額圓餅圖 */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-medium mb-4 text-center">商品銷售金額分析</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getPieChartData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderCustomLabel}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {getPieChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* 圖例 */}
                  <div className="mt-4 grid grid-cols-1 gap-2 max-h-32 overflow-auto">
                    {getPieChartData().map((item, index) => (
                      <div key={item.name} className="flex items-center gap-2 text-sm">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        <span className="flex-1 truncate">{item.name}</span>
                        <span className="font-semibold">${item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 銷售數量圓餅圖 */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-medium mb-4 text-center">商品銷售數量分析</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getQuantityPieData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderCustomLabel}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {getQuantityPieData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* 圖例 */}
                  <div className="mt-4 grid grid-cols-1 gap-2 max-h-32 overflow-auto">
                    {getQuantityPieData().map((item, index) => (
                      <div key={item.name} className="flex items-center gap-2 text-sm">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        <span className="flex-1 truncate">{item.name}</span>
                        <span className="font-semibold">{item.value} 件</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* 詳細數據統計 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">銷售記錄</h3>
                <div className="space-y-2 max-h-96 overflow-auto">
                  {getFilteredSales().length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <BarChart3 size={48} className="mx-auto mb-4 text-gray-300" />
                      <p>無銷售記錄</p>
                    </div>
                  ) : (
                    getFilteredSales().map(sale => (
                      <div key={sale.id} className="border-b pb-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">
                            {new Date(sale.timestamp).toLocaleString('zh-TW')}
                          </span>
                          <span className="font-medium">${sale.total}</span>
                        </div>
                        <div className="text-sm text-gray-500">
                          {sale.items.map(item => `${item.name}(${item.quantity})`).join(', ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">商品銷售排行</h3>
                <div className="space-y-2 max-h-96 overflow-auto">
                  {getProductAnalysis().length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Package size={48} className="mx-auto mb-4 text-gray-300" />
                      <p>無商品銷售資料</p>
                    </div>
                  ) : (
                    getProductAnalysis().map((item, index) => (
                      <div key={item.name} className="flex justify-between items-center border-b pb-2 hover:bg-gray-50 px-2 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-sm text-gray-500">
                              數量: {item.quantity} 件 | 單價: ${item.price}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-green-600">${item.revenue}</div>
                          <div className="text-xs text-gray-400">銷售額</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 銷售統計總覽 */}
            {getFilteredSales().length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">統計總覽</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {getFilteredSales().length}
                    </div>
                    <div className="text-sm text-gray-600">交易筆數</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      ${getFilteredSales().reduce((sum, sale) => sum + sale.total, 0)}
                    </div>
                    <div className="text-sm text-gray-600">總銷售額</div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {getFilteredSales().reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)}
                    </div>
                    <div className="text-sm text-gray-600">總銷售件數</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      ${Math.round(getFilteredSales().reduce((sum, sale) => sum + sale.total, 0) / Math.max(getFilteredSales().length, 1))}
                    </div>
                    <div className="text-sm text-gray-600">平均客單價</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentPage === 'backup' && (
          <div className="flex-1 p-6 overflow-auto">
            <h2 className="text-xl font-semibold mb-6">資料備份與還原</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">備份資料</h3>
                <p className="text-gray-600 mb-4">
                  將所有商品資料和銷售記錄備份為JSON檔案，建議定期備份以防資料遺失。
                </p>
                <button
                  onClick={backupData}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  備份資料
                </button>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">還原資料</h3>
                <p className="text-gray-600 mb-4">
                  從備份檔案還原資料，此操作將覆蓋現有資料，請謹慎操作。
                </p>
                <label className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={20} />
                  選擇備份檔案
                  <input
                    type="file"
                    accept=".json"
                    onChange={restoreData}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            
            {/* 資料統計資訊 */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">系統資料統計</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{products.length}</div>
                  <div className="text-sm text-gray-600">商品總數</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{sales.length}</div>
                  <div className="text-sm text-gray-600">銷售記錄</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    ${sales.reduce((sum, sale) => sum + sale.total, 0)}
                  </div>
                  <div className="text-sm text-gray-600">總銷售額</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)}
                  </div>
                  <div className="text-sm text-gray-600">總銷售件數</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 商品編輯模態框 */}
      {showProductModal && <ProductModal />}

      {/* 自定義確認對話框 */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">確認操作</h3>
              <p className="text-gray-600 whitespace-pre-line">{confirmMessage}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自定義提示對話框 */}
      {showAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">提示訊息</h3>
              <p className="text-gray-600">{alertMessage}</p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAlert(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;