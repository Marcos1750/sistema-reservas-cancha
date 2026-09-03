import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAlert, useConfirm } from './lib/confirmDialog';
import { Icon } from './icons';

const tabs = [
  ['overview', 'Resumen', 'home'],
  ['sales', 'Vender', 'cart'],
  ['products', 'Productos', 'box'],
  ['purchases', 'Compras', 'receipt'],
  ['movements', 'Movimientos', 'clock'],
];

const formatARS = (amount) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
}).format(Number(amount) || 0);

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const newKey = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
const emptyProduct = { nombre: '', categoria: '', sku: '', precio_venta_ars: '', stock_minimo: '0', activo: true };

function EmptyState({ title, body, action }) {
  return <div className="cantina-empty"><Icon name="box" size={24} /><strong>{title}</strong><p>{body}</p>{action}</div>;
}

function QuantityControl({ value, onChange, disabled = false }) {
  return <div className="cantina-quantity">
    <button type="button" disabled={disabled || value <= 1} aria-label="Restar una unidad" onClick={() => onChange(value - 1)}>−</button>
    <span>{value}</span>
    <button type="button" disabled={disabled} aria-label="Sumar una unidad" onClick={() => onChange(value + 1)}>+</button>
  </div>;
}

function StockPill({ product }) {
  const state = product.stock_actual < 0 ? 'negative' : product.stock_actual <= product.stock_minimo ? 'low' : 'ok';
  const label = product.stock_actual < 0 ? `${product.stock_actual} · Conciliar` : product.stock_actual <= product.stock_minimo ? `${product.stock_actual} · Bajo` : `${product.stock_actual} u.`;
  return <span className={`cantina-stock cantina-stock--${state}`}>{label}</span>;
}

export default function CantinaManager({ request, canManageTeam = false, isSuperadmin = false }) {
  const confirm = useConfirm();
  const alert = useAlert();
  const [complexes, setComplexes] = useState([]);
  const [complexId, setComplexId] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [operations, setOperations] = useState([]);
  const [movements, setMovements] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [cart, setCart] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [bookingId, setBookingId] = useState('');
  const [saleNote, setSaleNote] = useState('');
  const [purchaseRows, setPurchaseRows] = useState([]);
  const [purchaseProductId, setPurchaseProductId] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [adjustment, setAdjustment] = useState({ producto_id: '', cantidad: '', motivo: '' });
  const [sourceComplexId, setSourceComplexId] = useState('');

  const can = useCallback((permission) => permissions.includes(permission), [permissions]);
  const activeComplex = complexes.find((complex) => String(complex.id) === String(complexId));
  const activeProducts = products.filter((product) => product.activo !== false);
  const cartEntries = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = cartEntries.reduce((total, entry) => total + entry.quantity * Number(entry.product.precio_venta_ars), 0);
  const purchaseTotal = purchaseRows.reduce((total, item) => total + item.cantidad * item.precio_unitario_ars, 0);

  const loadComplexes = useCallback(async () => {
    const nextComplexes = await request('/api/admin/cantina/complejos');
    setComplexes(nextComplexes);
    setComplexId((current) => current || String(nextComplexes[0]?.id || ''));
  }, [request]);

  const loadCantina = useCallback(async () => {
    if (!complexId) return;
    setError('');
    try {
      const productResult = await request(`/api/admin/complejos/${complexId}/cantina/productos`);
      setProducts(productResult.productos || []);
      setPermissions(productResult.permisos || []);
      const nextPermissions = productResult.permisos || [];
      const tasks = [];
      if (nextPermissions.includes('resultados')) {
        tasks.push(request(`/api/admin/complejos/${complexId}/cantina/resumen`).then(setSummary));
        tasks.push(request(`/api/admin/complejos/${complexId}/cantina/operaciones`).then(setOperations));
        tasks.push(request(`/api/admin/complejos/${complexId}/cantina/movimientos`).then(setMovements));
      } else {
        setSummary(null); setOperations([]); setMovements([]);
      }
      if (nextPermissions.includes('vender')) tasks.push(request(`/api/admin/complejos/${complexId}/cantina/turnos`).then(setBookings));
      else setBookings([]);
      if (nextPermissions.includes('comprar')) tasks.push(request(`/api/admin/complejos/${complexId}/cantina/proveedores`).then(setSuppliers));
      else setSuppliers([]);
      await Promise.all(tasks);
    } catch (loadError) { setError(loadError.message); }
  }, [complexId, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => { loadComplexes().catch((loadError) => setError(loadError.message)); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadComplexes]);
  useEffect(() => {
    const timer = window.setTimeout(() => { loadCantina(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCantina]);

  const refresh = async () => {
    await loadComplexes();
    await loadCantina();
  };
  const run = async (action) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (actionError) { setError(actionError.message); }
    finally { setBusy(false); }
  };
  const addProductToCart = (product) => setCart((current) => ({
    ...current,
    [product.id]: { product, quantity: (current[product.id]?.quantity || 0) + 1 },
  }));
  const updateCart = (productId, quantity) => setCart((current) => {
    if (quantity <= 0) { const { [productId]: _removed, ...rest } = current; return rest; }
    return { ...current, [productId]: { ...current[productId], quantity } };
  });

  const saveProduct = (event) => {
    event.preventDefault();
    run(async () => {
      const path = `/api/admin/complejos/${complexId}/cantina/productos${editingProductId ? `/${editingProductId}` : ''}`;
      await request(path, { method: editingProductId ? 'PATCH' : 'POST', body: JSON.stringify(productForm) });
      setProductForm(emptyProduct); setEditingProductId(null);
    });
  };
  const startProductEdit = (product) => {
    setEditingProductId(product.id);
    setProductForm({ nombre: product.nombre, categoria: product.categoria || '', sku: product.sku || '', precio_venta_ars: String(product.precio_venta_ars), stock_minimo: String(product.stock_minimo), activo: product.activo !== false });
    setTab('products');
  };
  const archiveProduct = (product) => run(async () => {
    if (!(await confirm({ title: `¿Archivar “${product.nombre}”?`, description: 'El historial se conserva y el producto deja de aparecer al vender.', confirmText: 'Archivar producto', tone: 'danger' }))) return;
    await request(`/api/admin/complejos/${complexId}/cantina/productos/${product.id}`, { method: 'PATCH', body: JSON.stringify({ ...product, activo: false }) });
  });
  const submitSale = () => run(async () => {
    if (!cartEntries.length) throw new Error('Agregá al menos un producto para registrar la venta.');
    const negative = cartEntries.filter(({ product, quantity }) => Number(product.stock_actual) - quantity < 0);
    if (negative.length && !(await confirm({ title: 'La venta dejará stock negativo', description: `${negative.map(({ product }) => product.nombre).join(', ')} quedará para conciliar. Podés continuar y reponerlo después.`, confirmText: 'Registrar igual', tone: 'danger' }))) return;
    await request(`/api/admin/complejos/${complexId}/cantina/ventas`, {
      method: 'POST', body: JSON.stringify({
        items: cartEntries.map(({ product, quantity }) => ({ producto_id: product.id, cantidad: quantity, precio_unitario_ars: product.precio_venta_ars })),
        medio_pago: paymentMethod, reserva_id: bookingId || null, nota: saleNote, fecha: today(), request_key: newKey('venta'),
      }),
    });
    setCart({}); setBookingId(''); setSaleNote('');
  });
  const addPurchaseRow = () => {
    const product = activeProducts.find((item) => String(item.id) === String(purchaseProductId));
    const quantity = Number(purchaseQuantity); const price = Number(purchasePrice);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(price) || price < 0) { setError('Elegí un producto, una cantidad y un costo válidos.'); return; }
    if (purchaseRows.some((item) => item.producto_id === product.id)) { setError('Ese producto ya está en la compra.'); return; }
    setPurchaseRows((current) => [...current, { producto_id: product.id, producto_nombre: product.nombre, cantidad: quantity, precio_unitario_ars: price }]);
    setPurchaseProductId(''); setPurchaseQuantity('1'); setPurchasePrice(''); setError('');
  };
  const submitPurchase = () => run(async () => {
    if (!purchaseRows.length) throw new Error('Agregá al menos un producto a la compra.');
    await request(`/api/admin/complejos/${complexId}/cantina/compras`, {
      method: 'POST', body: JSON.stringify({ items: purchaseRows, proveedor_id: supplierId || null, proveedor_nombre: supplierName, nota: purchaseNote, fecha: today(), request_key: newKey('compra') }),
    });
    setPurchaseRows([]); setSupplierId(''); setSupplierName(''); setPurchaseNote('');
  });
  const saveSupplier = () => run(async () => {
    if (supplierName.trim().length < 2) throw new Error('Ingresá el nombre del proveedor para guardarlo.');
    const created = await request(`/api/admin/complejos/${complexId}/cantina/proveedores`, { method: 'POST', body: JSON.stringify({ nombre: supplierName }) });
    setSupplierId(String(created.id)); setSupplierName('');
  });
  const submitAdjustment = (event) => {
    event.preventDefault();
    run(async () => {
      await request(`/api/admin/complejos/${complexId}/cantina/ajustes`, { method: 'POST', body: JSON.stringify(adjustment) });
      setAdjustment({ producto_id: '', cantidad: '', motivo: '' });
    });
  };
  const cancelOperation = (operation) => run(async () => {
    if (!(await confirm({ title: `¿Anular esta ${operation.tipo}?`, description: 'Se conservará la operación y se registrará el movimiento inverso de stock.', confirmText: 'Anular operación', tone: 'danger' }))) return;
    const motive = 'Anulada desde el panel de cantina';
    await request(`/api/admin/complejos/${complexId}/cantina/operaciones/${operation.id}/anular`, { method: 'POST', body: JSON.stringify({ motivo: motive }) });
  });
  const copyCatalog = () => run(async () => {
    if (!sourceComplexId) throw new Error('Elegí el complejo desde el que querés copiar el catálogo.');
    const source = complexes.find((complex) => String(complex.id) === sourceComplexId);
    if (!(await confirm({ title: `¿Copiar productos desde ${source?.nombre}?`, description: 'Se copiarán precios y mínimos. El stock empezará en cero y no se sobrescribirán productos existentes.', confirmText: 'Copiar catálogo' }))) return;
    const result = await request(`/api/admin/complejos/${complexId}/cantina/catalogo/copiar`, { method: 'POST', body: JSON.stringify({ origen_complejo_id: sourceComplexId }) });
    alert({ title: 'Catálogo copiado', description: `${result.copiados} productos agregados${result.omitidos ? ` · ${result.omitidos} ya existían` : ''}.` });
    setSourceComplexId('');
  });

  if (!complexes.length && !error) return <section className="admin-bookings-section"><EmptyState title="Todavía no tenés una cantina disponible" body="Creá un complejo o pedí acceso a una sede para empezar a gestionar productos." /></section>;
  return <section className="admin-bookings-section cantina" aria-busy={busy}>
    <div className="cantina-heading">
      <div><h2>Cantina</h2><p>Ventas, stock y compras claros para cada complejo.</p></div>
      <label className="cantina-complex-picker">Complejo<select value={complexId} onChange={(event) => setComplexId(event.target.value)}>{complexes.map((complex) => <option key={complex.id} value={complex.id}>{complex.nombre}</option>)}</select></label>
    </div>
    {error && <div className="cantina-feedback" role="alert">{error}</div>}
    {activeComplex?.suspendido_suscripcion && <div className="cantina-feedback" role="status">Esta sede está suspendida: podés consultar la cantina, pero no registrar cambios.</div>}
    <div className="cantina-tabs" role="tablist" aria-label="Secciones de cantina">
      {tabs.filter(([id]) => id === 'overview' ? can('resultados') : id === 'sales' ? can('vender') : id === 'purchases' ? can('comprar') : id === 'products' ? can('stock') : can('resultados')).map(([id, label, icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><Icon name={icon} size={17} />{label}</button>)}
    </div>
    {tab === 'overview' && can('resultados') && <>
      <div className="cantina-metrics">
        <article><small>Ventas de hoy</small><strong>{formatARS(summary?.ventas)}</strong><span>{summary?.cantidad_ventas || 0} operaciones</span></article>
        <article><small>Compras de hoy</small><strong>{formatARS(summary?.compras)}</strong><span>Reposición registrada</span></article>
        <article className={(summary?.negativos || 0) > 0 ? 'is-alert' : ''}><small>Para conciliar</small><strong>{summary?.negativos || 0}</strong><span>stocks negativos</span></article>
        <article className={(summary?.bajos || 0) > 0 ? 'is-warning' : ''}><small>Stock bajo</small><strong>{summary?.bajos || 0}</strong><span>productos a reponer</span></article>
      </div>
      <div className="cantina-grid">
        <section className="cantina-panel"><div className="cantina-panel__title"><h3>Atención de stock</h3><Button variant="ghost" size="sm" type="button" onClick={() => setTab('products')}>Ver productos</Button></div>{activeProducts.filter((product) => product.stock_actual <= product.stock_minimo).slice(0, 6).map((product) => <div className="cantina-list-row" key={product.id}><div><strong>{product.nombre}</strong><small>{product.categoria || 'Sin categoría'}</small></div><StockPill product={product} /></div>)}{!activeProducts.some((product) => product.stock_actual <= product.stock_minimo) && <EmptyState title="Stock al día" body="Todavía no hay productos para reponer." />}</section>
        <section className="cantina-panel"><div className="cantina-panel__title"><h3>Últimos movimientos</h3><Button variant="ghost" size="sm" type="button" onClick={() => setTab('movements')}>Ver todos</Button></div>{(summary?.movimientos || []).map((movement) => <div className="cantina-list-row" key={movement.id}><div><strong>{movement.producto_nombre}</strong><small>{movement.tipo} · {movement.usuario_nombre}</small></div><b className={movement.cantidad > 0 ? 'is-positive' : 'is-negative'}>{movement.cantidad > 0 ? '+' : ''}{movement.cantidad} u.</b></div>)}{!summary?.movimientos?.length && <EmptyState title="Sin movimientos todavía" body="Las compras, ventas y ajustes van a aparecer acá." />}</section>
      </div>
    </>}
    {tab === 'sales' && can('vender') && <div className="cantina-sale-layout">
      <section className="cantina-panel cantina-products-sale"><div className="cantina-panel__title"><h3>Venta rápida</h3><span>{activeProducts.length} productos</span></div><div className="cantina-product-grid">{activeProducts.map((product) => <button type="button" className="cantina-sale-product" key={product.id} onClick={() => addProductToCart(product)}><strong>{product.nombre}</strong><small>{product.categoria || 'Cantina'}</small><StockPill product={product} /><b>{formatARS(product.precio_venta_ars)}</b></button>)}</div>{!activeProducts.length && <EmptyState title="Agregá tu primer producto" body="Cuando cargues bebidas, snacks u otros productos, los vas a poder vender desde acá." action={can('stock') ? <Button type="button" size="sm" onClick={() => setTab('products')}>Crear producto</Button> : null} />}</section>
      <aside className="cantina-cart"><div className="cantina-panel__title"><h3>Ticket actual</h3><span>{cartEntries.reduce((count, entry) => count + entry.quantity, 0)} u.</span></div>{cartEntries.map(({ product, quantity }) => <div className="cantina-cart-row" key={product.id}><div><strong>{product.nombre}</strong><small>{formatARS(product.precio_venta_ars)} c/u</small></div><QuantityControl value={quantity} onChange={(next) => updateCart(product.id, next)} /><b>{formatARS(quantity * product.precio_venta_ars)}</b></div>)}{!cartEntries.length && <p className="cantina-cart-empty">Elegí productos para armar la venta.</p>}<label>Medio de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="mercado_pago">Mercado Pago</option><option value="otro">Otro</option></select></label><label>Vincular con turno <select value={bookingId} onChange={(event) => setBookingId(event.target.value)}><option value="">Sin vínculo</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.nombre} · {booking.fecha} {booking.hora}</option>)}</select></label><label>Nota opcional<Input value={saleNote} onChange={(event) => setSaleNote(event.target.value)} placeholder="Ej. Consumió después del turno" /></label><div className="cantina-cart-total"><span>Total</span><strong>{formatARS(cartTotal)}</strong></div><Button type="button" disabled={busy || !cartEntries.length} onClick={submitSale}>Registrar venta <Icon name="check" size={17} /></Button></aside>
    </div>}
    {tab === 'products' && can('stock') && <div className="cantina-grid cantina-grid--products">
      <section className="cantina-panel"><div className="cantina-panel__title"><h3>{editingProductId ? 'Editar producto' : 'Nuevo producto'}</h3>{editingProductId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingProductId(null); setProductForm(emptyProduct); }}>Cancelar</Button>}</div><form className="cantina-form" onSubmit={saveProduct}><label>Nombre<Input required value={productForm.nombre} onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })} placeholder="Ej. Gaseosa 500 ml" /></label><label>Categoría<Input value={productForm.categoria} onChange={(event) => setProductForm({ ...productForm, categoria: event.target.value })} placeholder="Bebidas" /></label><label>SKU opcional<Input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} placeholder="Código interno" /></label><label>Precio de venta<Input required inputMode="numeric" value={productForm.precio_venta_ars} onChange={(event) => setProductForm({ ...productForm, precio_venta_ars: event.target.value })} placeholder="1800" /></label><label>Stock mínimo<Input required inputMode="numeric" value={productForm.stock_minimo} onChange={(event) => setProductForm({ ...productForm, stock_minimo: event.target.value })} /></label><Button type="submit" disabled={busy}>{editingProductId ? 'Guardar cambios' : 'Agregar producto'}</Button></form>
        {(canManageTeam || isSuperadmin) && complexes.length > 1 && <div className="cantina-copy"><strong>Copiar catálogo</strong><p>Los productos llegan sin stock y no reemplazan los que ya existen.</p><select value={sourceComplexId} onChange={(event) => setSourceComplexId(event.target.value)}><option value="">Elegí una sede</option>{complexes.filter((complex) => String(complex.id) !== String(complexId)).map((complex) => <option value={complex.id} key={complex.id}>{complex.nombre}</option>)}</select><Button type="button" variant="secondary" size="sm" disabled={busy || !sourceComplexId} onClick={copyCatalog}>Copiar productos</Button></div>}</section>
      <section className="cantina-panel"><div className="cantina-panel__title"><h3>Inventario</h3><span>{activeProducts.length} activos</span></div><div className="cantina-inventory">{activeProducts.map((product) => <article key={product.id}><div><strong>{product.nombre}</strong><small>{product.categoria || 'Sin categoría'}{product.sku ? ` · ${product.sku}` : ''}</small></div><StockPill product={product} /><b>{formatARS(product.precio_venta_ars)}</b><div className="cantina-row-actions"><button type="button" onClick={() => startProductEdit(product)}>Editar</button><button type="button" className="is-danger" onClick={() => archiveProduct(product)}>Archivar</button></div></article>)}{!activeProducts.length && <EmptyState title="Sin productos" body="Creá el catálogo de esta sede para empezar a operar." />}</div></section>
      <section className="cantina-panel cantina-adjustment"><div className="cantina-panel__title"><h3>Ajustar stock</h3><span>Queda registrado</span></div><form className="cantina-form" onSubmit={submitAdjustment}><label>Producto<select required value={adjustment.producto_id} onChange={(event) => setAdjustment({ ...adjustment, producto_id: event.target.value })}><option value="">Elegí un producto</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.nombre} · {product.stock_actual} u.</option>)}</select></label><label>Cantidad <Input required inputMode="numeric" value={adjustment.cantidad} onChange={(event) => setAdjustment({ ...adjustment, cantidad: event.target.value })} placeholder="Ej. -2 o 12" /></label><label>Motivo<Input required value={adjustment.motivo} onChange={(event) => setAdjustment({ ...adjustment, motivo: event.target.value })} placeholder="Rotura, inventario inicial…" /></label><Button type="submit" variant="secondary" disabled={busy}>Registrar ajuste</Button></form></section>
    </div>}
    {tab === 'purchases' && can('comprar') && <div className="cantina-grid cantina-grid--purchases"><section className="cantina-panel"><div className="cantina-panel__title"><h3>Registrar compra</h3><span>Repone stock al confirmar</span></div><div className="cantina-purchase-adder"><select value={purchaseProductId} onChange={(event) => setPurchaseProductId(event.target.value)}><option value="">Producto</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.nombre}</option>)}</select><Input inputMode="numeric" value={purchaseQuantity} onChange={(event) => setPurchaseQuantity(event.target.value)} placeholder="Cant." /><Input inputMode="numeric" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="Costo u." /><Button type="button" size="sm" onClick={addPurchaseRow}>Agregar</Button></div>{purchaseRows.map((row) => <div className="cantina-cart-row" key={row.producto_id}><div><strong>{row.producto_nombre}</strong><small>{row.cantidad} × {formatARS(row.precio_unitario_ars)}</small></div><b>{formatARS(row.cantidad * row.precio_unitario_ars)}</b><button className="cantina-remove" type="button" aria-label={`Quitar ${row.producto_nombre}`} onClick={() => setPurchaseRows((current) => current.filter((item) => item.producto_id !== row.producto_id))}>×</button></div>)}<div className="cantina-cart-total"><span>Total de compra</span><strong>{formatARS(purchaseTotal)}</strong></div></section><section className="cantina-panel"><div className="cantina-panel__title"><h3>Proveedor</h3><span>Opcional</span></div><label className="cantina-field">Proveedor registrado<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>)}</select></label><label className="cantina-field">O agregá uno nuevo<Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Ej. Distribuidora Norte" /></label><Button type="button" variant="secondary" size="sm" disabled={busy || supplierName.trim().length < 2} onClick={saveSupplier}>Guardar proveedor</Button><label className="cantina-field">Nota<Input value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} placeholder="N.º de factura o detalle" /></label><Button type="button" disabled={busy || !purchaseRows.length} onClick={submitPurchase}>Registrar compra <Icon name="check" size={17} /></Button></section></div>}
    {tab === 'movements' && can('resultados') && <div className="cantina-grid"><section className="cantina-panel"><div className="cantina-panel__title"><h3>Operaciones</h3><span>Últimas 200</span></div><div className="cantina-operations">{operations.map((operation) => <article className={operation.estado === 'anulada' ? 'is-cancelled' : ''} key={operation.id}><div><strong>{operation.tipo === 'venta' ? 'Venta' : 'Compra'} · {formatARS(operation.total_ars)}</strong><small>{operation.fecha} · {operation.creado_por_nombre}{operation.reserva_nombre ? ` · ${operation.reserva_nombre}` : ''}</small></div><span>{operation.estado === 'anulada' ? 'Anulada' : operation.medio_pago || 'Registrada'}</span>{operation.estado === 'activa' && ((operation.tipo === 'venta' && can('vender')) || (operation.tipo === 'compra' && can('comprar'))) && <button type="button" onClick={() => cancelOperation(operation)}>Anular</button>}</article>)}{!operations.length && <EmptyState title="Todavía no hay operaciones" body="Las compras y ventas de esta sede van a quedar registradas acá." />}</div></section><section className="cantina-panel"><div className="cantina-panel__title"><h3>Libro de stock</h3><span>Auditable</span></div><div className="cantina-operations">{movements.map((movement) => <article key={movement.id}><div><strong>{movement.producto_nombre}</strong><small>{movement.tipo} · {new Date(movement.created_at).toLocaleString('es-AR')}</small></div><b className={movement.cantidad > 0 ? 'is-positive' : 'is-negative'}>{movement.cantidad > 0 ? '+' : ''}{movement.cantidad} u.</b></article>)}{!movements.length && <EmptyState title="Sin movimientos todavía" body="Cada compra, venta, ajuste o anulación queda guardada acá." />}</div></section></div>}
  </section>;
}
