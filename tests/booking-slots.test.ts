import { describe, expect, test } from "bun:test";
import { generateBookingSlots } from "../src/lib/booking-slots";

const date = new Date(2030, 0, 7);
const base = { date, start: "11:00", end: "14:00", duration: 50, occupied: [], now: new Date(2029, 0, 1) };
const interval = (start: string, end: string) => ({ start_time: `2030-01-07T${start}:00`, end_time: `2030-01-07T${end}:00` });
describe("specialist booking slot modes", () => {
  test("dynamic 50-minute services are consecutive", () => {
    expect(generateBookingSlots({ ...base, mode: "dynamic" })).toEqual(["11:00", "11:50", "12:40"]);
  });
  test("fixed mode retains the 15-minute grid", () => {
    expect(generateBookingSlots({ ...base, start: "09:00", end: "10:20" })).toEqual(["09:00", "09:15", "09:30"]);
  });
  test("dynamic packing restarts after existing appointments", () => {
    expect(generateBookingSlots({ ...base, mode: "dynamic", occupied: [interval("11:50", "12:20")] })).toEqual(["11:00", "12:20", "13:10"]);
  });
  test("overlapping breaks are merged without duplicate slots", () => {
    expect(generateBookingSlots({ ...base, mode: "dynamic", occupied: [interval("11:20", "12:00"), interval("11:40", "12:20")] })).toEqual(["12:20", "13:10"]);
  });
  test("past slots and services crossing closing time are excluded", () => {
    expect(generateBookingSlots({ ...base, mode: "dynamic", now: new Date(2030, 0, 7, 12, 0) })).toEqual(["12:40"]);
  });
});