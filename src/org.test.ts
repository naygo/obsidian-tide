import { describe, expect, it } from "vitest";
import { parseBlock, serializeBlock } from "./org";

const SPEC_EXAMPLE = [
  "- TODO [#A] dentista :saude:casa:",
  "  SCHEDULED: <2026-10-30 sex 14:00 +1w>",
  "  DEADLINE: <2026-10-31 sáb>",
  "  CLOSED: [2026-10-29 qui 15:02]",
  "  :PROPERTIES:",
  "  :CREATED: [2026-10-29 qui 10:00]",
  "  :CATEGORY: pessoal",
  "  :ABOUT: [[saúde]]",
  "  :END:",
  "  :LOGBOOK:",
  '  - State "DONE" from "TODO" [2026-10-24] (ocorrência de 2026-10-24)',
  "  :END:",
  "  descrição em texto solto",
  "  - [ ] passo",
];

describe("parseBlock", () => {
  it("reads every part of the spec example", () => {
    const b = parseBlock(SPEC_EXAMPLE)!;
    expect(b.kind).toBe("task");
    expect(b.state).toBe("TODO");
    expect(b.priority).toBe("A");
    expect(b.title).toBe("dentista");
    expect(b.tags).toEqual(["saude", "casa"]);
    expect(b.scheduled).toEqual({ date: "2026-10-30", weekday: "sex", time: "14:00", repeater: "+1w" });
    expect(b.deadline).toEqual({ date: "2026-10-31", weekday: "sáb", time: null, repeater: null });
    expect(b.closed).toEqual({ date: "2026-10-29", weekday: "qui", time: "15:02", repeater: null });
    expect(b.properties).toEqual([
      ["CREATED", "[2026-10-29 qui 10:00]"],
      ["CATEGORY", "pessoal"],
      ["ABOUT", "[[saúde]]"],
    ]);
    expect(b.logbook).toEqual(['  - State "DONE" from "TODO" [2026-10-24] (ocorrência de 2026-10-24)']);
    expect(b.body).toEqual(["  descrição em texto solto", "  - [ ] passo"]);
    expect(b.steps).toEqual([{ checked: false, text: "passo" }]);
  });

  it("round-trips the spec example without losing anything", () => {
    expect(serializeBlock(parseBlock(SPEC_EXAMPLE)!)).toEqual(SPEC_EXAMPLE);
  });
});

describe("parseBlock variations", () => {
  it.each([
    ["bare task", ["- TODO comprar pão"]],
    ["task with only a deadline", ["- DOING relatório", "  DEADLINE: <2026-11-02 seg>"]],
    ["task with only a drawer", ["- TODO ler", "  :PROPERTIES:", "  :CATEGORY: estudo", "  :END:"]],
    ["task with only body", ["- DONE lavar louça", "  rápido", "  - [x] secar"]],
    ["nested task with tab-indented children", ["  - TODO aninhada", "\t\tSCHEDULED: <2026-10-30 sex>"]],
    ["aligned tags", ["- TODO [#C] alinhada      :a:b:"]],
    ["malformed planning falls into body", ["- TODO x", "  SCHEDULED: <ontem>", "  :PROPERTIES:", "  :END:"]],
    ["unclosed drawer falls into body", ["- TODO x", "  :LOGBOOK:", "  - algo"]],
    ["loose note", ["- uma nota solta"]],
  ])("round-trips %s", (_, lines) => {
    expect(serializeBlock(parseBlock(lines)!)).toEqual(lines);
  });

  it("classifies by keyword and SCHEDULED", () => {
    expect(parseBlock(["- TODO x"])!.kind).toBe("task");
    expect(parseBlock(["- consulta", "  SCHEDULED: <2026-10-30 sex 09:00>"])!.kind).toBe("event");
    expect(parseBlock(["- consulta", "  DEADLINE: <2026-10-30 sex>"])!.kind).toBe("note");
  });

  it("keeps bare data in a task without drawer or dates", () => {
    const b = parseBlock(["- DONE lavar louça", "  rápido", "  - [x] secar"])!;
    expect([b.scheduled, b.deadline, b.closed, b.properties, b.logbook]).toEqual([null, null, null, null, null]);
    expect(b.tags).toEqual([]);
    expect(b.steps).toEqual([{ checked: true, text: "secar" }]);
  });

  it("does not treat steps or near-keywords as tasks", () => {
    expect(parseBlock(["- [ ] passo"])).toBeNull();
    expect(parseBlock(["- TODOS os dias"])!.state).toBeNull();
    expect(parseBlock(["texto"])).toBeNull();
  });
});
