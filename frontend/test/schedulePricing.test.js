import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBulkSlotPrice,
  EMPTY_SCHEDULE_MESSAGE,
  INVALID_BULK_PRICE_MESSAGE,
  normalizeBulkSlotPrice,
} from "../src/lib/schedulePricing.js";

test("normalizes non-negative integer prices", () => {
  assert.equal(normalizeBulkSlotPrice("30000"), 30000);
  assert.equal(normalizeBulkSlotPrice(0), 0);
});

test("rejects empty, negative, decimal and non-finite prices", () => {
  for (const value of ["", "   ", -1, "120.5", Infinity]) {
    assert.equal(normalizeBulkSlotPrice(value), null);
  }
});

test("applies the price to active and inactive slots without mutating the source", () => {
  const slots = [
    { dayOfWeek: 1, start: "18:00", end: "19:00", price: 25000, active: true },
    { dayOfWeek: 1, start: "19:00", end: "20:00", price: 27000, active: false },
  ];

  const result = applyBulkSlotPrice(slots, "32000");

  assert.equal(result.error, undefined);
  assert.equal(result.price, 32000);
  assert.deepEqual(
    result.slots.map((slot) => slot.price),
    [32000, 32000],
  );
  assert.deepEqual(
    slots.map((slot) => slot.price),
    [25000, 27000],
  );
  assert.notEqual(result.slots[0], slots[0]);
});

test("returns an error for an empty grid or invalid price", () => {
  assert.deepEqual(applyBulkSlotPrice([], "30000"), {
    error: EMPTY_SCHEDULE_MESSAGE,
  });
  assert.deepEqual(applyBulkSlotPrice([{}], "abc"), {
    error: INVALID_BULK_PRICE_MESSAGE,
  });
});
