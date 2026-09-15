export const INVALID_BULK_PRICE_MESSAGE =
  "Ingresá un precio entero igual o mayor a cero.";

export const EMPTY_SCHEDULE_MESSAGE =
  "Esta cancha todavía no tiene horarios para actualizar.";

export function normalizeBulkSlotPrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const price = Number(value);
  return Number.isInteger(price) && price >= 0 ? price : null;
}

export function applyBulkSlotPrice(slots, value) {
  const price = normalizeBulkSlotPrice(value);

  if (price === null) {
    return { error: INVALID_BULK_PRICE_MESSAGE };
  }

  if (!Array.isArray(slots) || slots.length === 0) {
    return { error: EMPTY_SCHEDULE_MESSAGE };
  }

  return {
    price,
    slots: slots.map((slot) => ({ ...slot, price })),
  };
}
