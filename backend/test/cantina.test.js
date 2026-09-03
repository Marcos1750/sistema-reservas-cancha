import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCantinaOperations, validateOperation, validateProduct, validateStockAdjustment } from '../cantina.js';

test('valida un producto de cantina y rechaza precios inválidos', () => {
  assert.deepEqual(validateProduct({ nombre: 'Agua 600 ml', categoria: 'Bebidas', sku: 'A-1', precio_venta_ars: 1800, stock_minimo: 4 }), {
    nombre: 'Agua 600 ml', categoria: 'Bebidas', sku: 'A-1', precioVenta: 1800, stockMinimo: 4, activo: true,
  });
  assert.equal(validateProduct({ nombre: 'A', precio_venta_ars: -1 }).error, 'Completá un nombre, precio y stock mínimo válidos.');
});

test('una venta exige productos únicos, medio de pago y clave de idempotencia', () => {
  const sale = validateOperation({
    items: [{ producto_id: 2, cantidad: 3, precio_unitario_ars: 2500 }],
    fecha: '2026-09-03', medio_pago: 'efectivo', request_key: 'sale-1',
  }, 'venta');
  assert.equal(sale.error, undefined);
  assert.equal(validateOperation({ ...sale, items: [{ producto_id: 2, cantidad: 1, precio_unitario_ars: 2 }, { producto_id: 2, cantidad: 1, precio_unitario_ars: 2 }] }, 'venta').error, 'Cada producto puede aparecer una sola vez.');
  assert.equal(validateOperation({ items: [{ producto_id: 2, cantidad: 1, precio_unitario_ars: 2 }], medio_pago: 'tarjeta', request_key: 'sale-1' }, 'venta').error, 'Elegí un medio de pago válido.');
});

test('los ajustes requieren un motivo y las anulaciones no alteran el resumen', () => {
  assert.equal(validateStockAdjustment({ producto_id: 1, cantidad: -2, motivo: 'Rotura' }).error, undefined);
  assert.ok(validateStockAdjustment({ producto_id: 1, cantidad: 0, motivo: '' }).error);
  assert.deepEqual(summarizeCantinaOperations([
    { tipo: 'venta', estado: 'activa', total_ars: 5000 },
    { tipo: 'compra', estado: 'activa', total_ars: 1200 },
    { tipo: 'venta', estado: 'anulada', total_ars: 8000 },
  ]), { ventas: 5000, compras: 1200, cantidadVentas: 1 });
});
