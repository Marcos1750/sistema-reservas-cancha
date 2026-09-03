const OPERATION_TYPES = ['venta', 'compra'];
const PAYMENT_METHODS = ['efectivo', 'transferencia', 'mercado_pago', 'otro'];
const CANTINA_PERMISSIONS = ['vender', 'comprar', 'stock', 'resultados'];

function cleanCantinaText(value, maxLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function asPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validCantinaDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateProduct(body = {}) {
  const nombre = cleanCantinaText(body.nombre, 120);
  const categoria = cleanCantinaText(body.categoria, 60);
  const sku = cleanCantinaText(body.sku, 80);
  const precioVenta = Number(body.precio_venta_ars);
  const stockMinimo = body.stock_minimo === '' || body.stock_minimo === undefined ? 0 : Number(body.stock_minimo);
  if (nombre.length < 2 || !Number.isSafeInteger(precioVenta) || precioVenta < 0 || !Number.isSafeInteger(stockMinimo) || stockMinimo < 0) {
    return { error: 'Completá un nombre, precio y stock mínimo válidos.' };
  }
  return { nombre, categoria, sku, precioVenta, stockMinimo, activo: body.activo !== false };
}

function validateOperation(body = {}, type) {
  if (!OPERATION_TYPES.includes(type)) return { error: 'Operación inválida.' };
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 100) return { error: 'Agregá al menos un producto a la operación.' };
  const normalizedItems = [];
  for (const item of items) {
    const productoId = asPositiveInteger(item?.producto_id);
    const cantidad = asPositiveInteger(item?.cantidad);
    const precioUnitario = Number(item?.precio_unitario_ars);
    if (!productoId || !cantidad || !Number.isSafeInteger(precioUnitario) || precioUnitario < 0) {
      return { error: 'Hay un producto, cantidad o importe inválido.' };
    }
    normalizedItems.push({ productoId, cantidad, precioUnitario });
  }
  const duplicateIds = new Set();
  for (const item of normalizedItems) {
    if (duplicateIds.has(item.productoId)) return { error: 'Cada producto puede aparecer una sola vez.' };
    duplicateIds.add(item.productoId);
  }
  const fecha = cleanCantinaText(body.fecha, 10) || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  if (!validCantinaDate(fecha)) return { error: 'La fecha de la operación no es válida.' };
  const medioPago = type === 'venta' ? cleanCantinaText(body.medio_pago || 'efectivo', 30) : null;
  if (type === 'venta' && !PAYMENT_METHODS.includes(medioPago)) return { error: 'Elegí un medio de pago válido.' };
  const requestKey = cleanCantinaText(body.request_key, 100);
  if (!requestKey) return { error: 'No pudimos asegurar esta operación. Intentá nuevamente.' };
  return {
    items: normalizedItems,
    fecha,
    medioPago,
    proveedorId: type === 'compra' && body.proveedor_id ? asPositiveInteger(body.proveedor_id) : null,
    proveedorNombre: type === 'compra' ? cleanCantinaText(body.proveedor_nombre, 120) : '',
    reservaId: type === 'venta' && body.reserva_id ? asPositiveInteger(body.reserva_id) : null,
    referencia: type === 'compra' ? cleanCantinaText(body.referencia, 100) : '',
    nota: cleanCantinaText(body.nota, 500),
    requestKey,
  };
}

function validateStockAdjustment(body = {}) {
  const productoId = asPositiveInteger(body.producto_id);
  const cantidad = Number(body.cantidad);
  const motivo = cleanCantinaText(body.motivo, 250);
  if (!productoId || !Number.isSafeInteger(cantidad) || cantidad === 0 || !motivo) {
    return { error: 'Indicá un producto, una cantidad distinta de cero y el motivo.' };
  }
  return { productoId, cantidad, motivo };
}

function summarizeCantinaOperations(operations) {
  return operations.reduce((summary, operation) => {
    const total = Number(operation.total_ars) || 0;
    if (operation.estado === 'anulada') return summary;
    if (operation.tipo === 'venta') {
      summary.ventas += total;
      summary.cantidadVentas += 1;
    }
    if (operation.tipo === 'compra') summary.compras += total;
    return summary;
  }, { ventas: 0, compras: 0, cantidadVentas: 0 });
}

export {
  CANTINA_PERMISSIONS,
  OPERATION_TYPES,
  PAYMENT_METHODS,
  cleanCantinaText,
  summarizeCantinaOperations,
  validateOperation,
  validateProduct,
  validateStockAdjustment,
};
