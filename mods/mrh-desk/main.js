// MRH Desk: one tab per document. A schema-driven form, a live draft
// preview, and export through the bundled uv Python generator.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { theme, props, exec, appHome, notify, shared, setShared, window, focused, spaces, run } from "herdr";
import * as fs from "fs/promises";
import { SCHEMAS } from "./schemas.js";
import { previewHtml, summaryRows, previewNum as num } from "./previews.js";

const uid = () => Math.random().toString(36).slice(2, 9);
const appRoot = () => appHome().replace(/\\/g, "/");
const dataRoot = () => appRoot() + "/data/mrh-desk";
const docRoot = (space, doc) => `${dataRoot()}/docs/${space ?? "local"}/${doc}`;
const specPath = (space, doc) => docRoot(space, doc) + "/spec.json";
const outDir = (space, doc) => docRoot(space, doc) + "/out";
const baseName = (path) => String(path ?? "").replace(/\\/g, "/").split("/").pop() || "";
const clone = (value) => JSON.parse(JSON.stringify(value));

function parseJson(text) {
  const lines = String(text ?? "").trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }
  return null;
}

export default class MrhDesk extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.mode = p?.mode ?? "deed";
    this.doc = p?.doc ?? "doc-" + uid();
    this.space = p?.space ?? null;
    this.schema = SCHEMAS[this.mode] ?? SCHEMAS.deed;
    const saved = shared("mrh.spec." + this.doc);
    this.values = clone(saved?.values ?? this.schema.defaults);
    this.template = saved?.template ?? "default";
    this.templates = [];
    this.hydrateIds();
    this.step = 0;
    this.width = 1000;
    this.showPreview = true;
    this.dirty = false;
    this.error = "";
    this.busy = "";
    this.last = [];
    this.errors = [];
    this.showErrors = false;
    this.savedAt = saved?.updated ? new Date(saved.updated) : null;
    this.savedCore = this.coreJson();
    this.states = new Map();
    this.buildStates();
    cx.spawn(async () => {
      try {
        await fs.mkdir(docRoot(this.space, this.doc), { recursive: true });
      } catch {}
    });
    if (!saved) {
      cx.spawn(async (cx2) => {
        try {
          const text = await fs.readFile(specPath(this.space, this.doc), "utf8");
          if (!text || shared("mrh.spec." + this.doc)) return;
          const spec = JSON.parse(text);
          if (!spec?.values) return;
          this.values = clone(spec.values);
          this.template = spec.template ?? this.template;
          this.hydrateIds();
          this.buildStates();
          this.savedCore = this.coreJson();
          this.savedAt = spec.updated ? new Date(spec.updated) : this.savedAt;
          cx2.notify();
        } catch {}
      });
    }
    cx.timer.every(2000, (cx) => {
      if (this.dirty) this.save(cx);
    });
    this.loadTemplates(cx);
    cx.timer.every(8000, (cx) => this.loadTemplates(cx));
  }

  loadTemplates(cx) {
    if (this.mode !== "deed") return;
    cx.spawn(async (cx2) => {
      try {
        const entries = await fs.readdir(dataRoot() + "/templates", { withFileTypes: true });
        const names = entries
          .filter((entry) => !entry.isDirectory() && /\.docx$/i.test(entry.name))
          .map((entry) => entry.name)
          .sort();
        if (JSON.stringify(names) !== JSON.stringify(this.templates)) {
          this.templates = names;
          if (this.template !== "default" && !names.includes(this.template)) this.template = "default";
          cx2.notify();
        }
      } catch {
        if (this.templates.length) {
          this.templates = [];
          if (this.template !== "default") this.template = "default";
          cx2.notify();
        }
      }
    });
  }

  docTitle() {
    if (this.mode === "deed") return this.values.firm || "Untitled deed";
    if (this.mode === "projection") return this.values.client ? `Projection · ${this.values.client}` : "Untitled projection";
    return this.values.entity ? `Provision · ${this.values.entity}` : "Untitled provision";
  }

  renameTab() {
    const active = focused();
    if (!active?.tab) return;
    const space = spaces().find((s) => s.active);
    const tab = (space?.tabs ?? []).find((t) => t.id === active.tab);
    if (!tab || tab.name !== this.schema.short) return;
    const title = this.docTitle();
    if (title && !title.startsWith("Untitled")) run("tab.rename", { id: tab.id, name: title });
  }

  coreJson() {
    return JSON.stringify({ mode: this.mode, values: this.values, template: this.template });
  }

  hydrateIds() {
    for (const step of this.schema.steps) {
      for (const field of step.fields) {
        if (field.type !== "list") continue;
        if (!Array.isArray(this.values[field.key])) this.values[field.key] = [];
        for (const item of this.values[field.key]) if (!item._id) item._id = uid();
      }
    }
  }

  buildStates() {
    for (const state of this.states.values()) {
      try {
        state.release?.();
      } catch {}
    }
    this.states.clear();
    for (const step of this.schema.steps) {
      for (const field of step.fields) {
        if (field.type === "list") {
          if (!Array.isArray(this.values[field.key])) this.values[field.key] = [];
          for (const item of this.values[field.key]) {
            for (const sub of field.item) {
              const key = `${field.key}:${item._id}:${sub.key}`;
              this.states.set(
                key,
                this.makeState(sub, item[sub.key], (value) => {
                  item[sub.key] = value;
                }),
              );
            }
          }
        } else {
          this.states.set(
            field.key,
            this.makeState(field, this.values[field.key], (value) => {
              this.values[field.key] = value;
            }),
          );
        }
      }
    }
  }

  makeState(field, value, set) {
    const options = { placeholder: field.placeholder ?? "", value: String(value ?? "") };
    const state =
      field.type === "textarea"
        ? TextareaState.new({ ...options, rows: field.rows ?? 3 })
        : InputState.new(options);
    state.on("change", (_event, cx) => {
      set(state.value());
      this.dirty = true;
      this.error = "";
      cx.notify();
    });
    state.on("blur", (_event, cx) => {
      if (this.dirty) this.save(cx);
    });
    state.on("submit", (_event, cx) => {
      this.save(cx);
    });
    return state;
  }

  addItem(field, cx) {
    const item = { _id: uid() };
    for (const sub of field.item) item[sub.key] = "";
    if (!Array.isArray(this.values[field.key])) this.values[field.key] = [];
    this.values[field.key].push(item);
    for (const sub of field.item) {
      const key = `${field.key}:${item._id}:${sub.key}`;
      this.states.set(
        key,
        this.makeState(sub, "", (value) => {
          item[sub.key] = value;
        }),
      );
    }
    this.dirty = true;
    this.save(cx);
    cx.notify();
  }

  removeItem(field, id, cx) {
    const items = this.values[field.key] ?? [];
    if (items.length <= (field.min ?? 0)) return;
    for (const sub of field.item) {
      const key = `${field.key}:${id}:${sub.key}`;
      try {
        this.states.get(key)?.release?.();
      } catch {}
      this.states.delete(key);
    }
    this.values[field.key] = items.filter((item) => item._id !== id);
    this.dirty = true;
    this.save(cx);
    cx.notify();
  }

  rawNum(value) {
    const text = String(value ?? "").replace(/[,\s\u20b9]/g, "");
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : NaN;
  }

  validate() {
    const errors = [];
    const add = (step, key, msg) => errors.push({ step, key, msg });
    this.schema.steps.forEach((step, si) => {
      for (const field of step.fields) {
        if (field.type === "list") {
          const items = this.values[field.key] ?? [];
          if ((field.min ?? 0) > items.length)
            add(si, field.key, `Add at least ${field.min} ${(field.itemLabel ?? "item").toLowerCase()}s.`);
          items.forEach((item, index) => {
            for (const sub of field.item) {
              const value = item[sub.key];
              const key = `${field.key}:${item._id}:${sub.key}`;
              const label = `${field.itemLabel ?? "Item"} ${index + 1} ${sub.label}`;
              const text = String(value ?? "").trim();
              if (sub.required && text === "") {
                add(si, key, `${label} is required.`);
                continue;
              }
              if (text === "") continue;
              if (sub.pattern && !new RegExp(sub.pattern).test(String(value))) add(si, key, `${label} is not valid.`);
              const n = this.rawNum(value);
              if (sub.type === "money" && (n === null || !Number.isFinite(n) || n < 0)) add(si, key, `${label} must be an amount.`);
              if (sub.type === "percent" && (n === null || !Number.isFinite(n) || n < 0 || n > 100)) add(si, key, `${label} must be 0-100.`);
              if (sub.type === "number" && (n === null || !Number.isFinite(n))) add(si, key, `${label} must be a number.`);
            }
          });
          if (field.sum && items.length) {
            const total = items.reduce((n, item) => n + (this.rawNum(item[field.sum]) ?? 0), 0);
            if (field.sumEquals != null && Math.abs(total - field.sumEquals) > 0.01)
              add(si, field.key, `${field.label}: total is ${total}%, expected ${field.sumEquals}%.`);
          }
        } else {
          const value = this.values[field.key];
          const text = String(value ?? "").trim();
          if (field.required && text === "") {
            add(si, field.key, `${field.label} is required.`);
            continue;
          }
          if (text === "") continue;
          if (field.pattern && !new RegExp(field.pattern).test(String(value))) add(si, field.key, `${field.label} is not valid.`);
          if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) add(si, field.key, `${field.label}: use YYYY-MM-DD.`);
          const n = this.rawNum(value);
          if (field.type === "money" && (n === null || !Number.isFinite(n) || n < 0)) add(si, field.key, `${field.label} must be an amount.`);
          if (field.type === "percent" && (n === null || !Number.isFinite(n) || n < 0 || n > 100)) add(si, field.key, `${field.label} must be 0-100.`);
          if (field.type === "number") {
            if (n === null || !Number.isFinite(n)) add(si, field.key, `${field.label} must be a number.`);
            else if ((field.min != null && n < field.min) || (field.max != null && n > field.max))
              add(si, field.key, `${field.label} must be ${field.min ?? "…"}-${field.max ?? "…"}.`);
          }
        }
      }
    });
    return errors;
  }

  fieldError(key) {
    if (!this.showErrors) return "";
    const hit = (this.errors ?? []).find((e) => e.key === key || e.key.startsWith(key + ":"));
    return hit?.msg ?? "";
  }

  save(cx, force) {
    const core = this.coreJson();
    if (!force && core === this.savedCore) {
      this.dirty = false;
      return;
    }
    this.savedCore = core;
    const snapshot = {
      version: 1,
      mode: this.mode,
      values: this.values,
      template: this.template,
      updated: new Date().toISOString(),
    };
    setShared("mrh.spec." + this.doc, snapshot);
    const path = specPath(this.space, this.doc);
    cx.spawn(async (cx2) => {
      try {
        await fs.mkdir(docRoot(this.space, this.doc), { recursive: true });
        await fs.writeFile(path, JSON.stringify(snapshot, null, 2));
        this.savedAt = new Date();
      } catch (e) {
        this.error = "Save: " + String(e?.message ?? e);
      }
      cx2.notify();
    });
    this.dirty = false;
  }

  async close(_cx) {
    try {
      const snapshot = {
        version: 1,
        mode: this.mode,
        values: this.values,
        template: this.template,
        updated: new Date().toISOString(),
      };
      await fs.mkdir(docRoot(this.space, this.doc), { recursive: true });
      await fs.writeFile(specPath(this.space, this.doc), JSON.stringify(snapshot, null, 2));
    } catch {}
  }

  jumpToError(error) {
    if (error && error.step != null) this.step = error.step;
  }

  async exportDoc(cx) {
    if (this.busy) return;
    this.showErrors = true;
    this.errors = this.validate();
    if (this.errors.length) {
      this.error = this.errors[0].msg;
      this.jumpToError(this.errors[0]);
      cx.notify();
      return;
    }
    this.renameTab();
    this.busy = "Building…";
    this.error = "";
    cx.notify();
    try {
      const snapshot = {
        version: 1,
        mode: this.mode,
        values: this.values,
        template: this.template,
        updated: new Date().toISOString(),
      };
      await fs.mkdir(outDir(this.space, this.doc), { recursive: true });
      await fs.writeFile(specPath(this.space, this.doc), JSON.stringify(snapshot, null, 2));
      const tool = appRoot() + "/mods/mrh-desk/tools/mrh_doc.py";
      const args = [
        "run",
        "--script",
        tool,
        "build",
        "--mode",
        this.mode,
        "--spec",
        specPath(this.space, this.doc),
        "--out",
        outDir(this.space, this.doc),
      ];
      if (this.mode === "deed" && this.template !== "default") {
        args.push("--template", dataRoot() + "/templates/" + this.template);
      }
      const result = await exec("uv", args);
      const out = parseJson(result.stdout);
      if (!out || out.ok === false) {
        throw new Error(out?.errors?.join("; ") || String(result.stderr ?? "").slice(-400) || "Build failed");
      }
      this.last = (out.files ?? []).map((path) => String(path).replace(/\\/g, "/"));
      notify({
        title: "Exported",
        body: this.last.map(baseName).join(", "),
        level: "success",
      });
    } catch (e) {
      this.error = "Export: " + String(e?.message ?? e);
      notify({ title: "Export failed", body: this.error, level: "error" });
    } finally {
      this.busy = "";
      cx.notify();
    }
  }

  async makePdf(cx) {
    if (this.busy) return;
    const source = this.last.find((path) => /\.(docx|xlsx)$/i.test(path));
    if (!source) {
      this.error = "Build the document first.";
      cx.notify();
      return;
    }
    this.busy = "Making PDF…";
    this.error = "";
    cx.notify();
    try {
      const pdf = source.replace(/\.(docx|xlsx)$/i, ".pdf");
      const script = appRoot() + "/mods/mrh-desk/tools/topdf.ps1";
      const result = await exec("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-In",
        source,
        "-Out",
        pdf,
      ]);
      const exists = await fs.exists(pdf);
      if (result.code !== 0 || !exists)
        throw new Error(String(result.stderr ?? "").slice(-300) || "Word/Excel could not make the PDF.");
      if (!this.last.includes(pdf)) this.last.push(pdf);
      notify({ title: "PDF ready", body: baseName(pdf), level: "success" });
    } catch (e) {
      this.error = "PDF: " + String(e?.message ?? e);
      notify({ title: "PDF failed", body: this.error, level: "error" });
    } finally {
      this.busy = "";
      cx.notify();
    }
  }

  async openPath(path, cx) {
    if (!path) return;
    const w = window();
    try {
      if (w?.platform === "windows")
        await exec("powershell", ["-NoProfile", "-Command", `Start-Process -FilePath "${path.replace(/"/g, '""')}"`]);
      else if (w?.platform === "macos") await exec("open", [path]);
      else await exec("xdg-open", [path]);
    } catch (e) {
      this.error = "Open: " + String(e?.message ?? e);
      cx.notify();
    }
  }

  button(id, label, action, primary) {
    const t = theme();
    return div()
      .id(`${this.doc}-${id}`)
      .h(26)
      .px(10)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_size(11.5)
      .text_color(primary ? t.accent_foreground : t.muted)
      .when(primary, (el) => el.bg(t.accent))
      .when(!primary, (el) => el.border(1).border_color(t.border).hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .cursor_pointer()
      .on_click((_event, cx) => action(cx))
      .child(label);
  }

  control(field, state, error) {
    const t = theme();
    if (!state) return div();
    const borderColor = error ? t.blocked : t.border;
    if (field.type === "textarea") {
      return div()
        .w_full()
        .p(8)
        .rounded(6)
        .border(1)
        .border_color(borderColor)
        .bg(t.surface)
        .cursor_text()
        .child(
          Textarea.new(state)
            .w_full()
            .h((field.rows ?? 3) * 20 + 8)
            .text_size(12.5)
            .text_color(t.foreground),
        );
    }
    return div()
      .w_full()
      .h(32)
      .px(9)
      .flex()
      .items_center()
      .rounded(6)
      .border(1)
      .border_color(borderColor)
      .bg(t.surface)
      .cursor_text()
      .child(Input.new(state).w_full().h_full().text_size(12.5).text_color(t.foreground));
  }

  renderField(field) {
    const t = theme();
    const error = this.fieldError(field.key);
    return v_flex()
      .flex_none()
      .gap(4)
      .child(div().text_size(9.5).font_semibold().text_color(t.dim).child(field.label.toUpperCase()))
      .child(this.control(field, this.states.get(field.key), error))
      .when(Boolean(error), (el) => el.child(div().text_size(9.5).text_color(t.blocked).child(error)));
  }

  itemCard(field, item, index) {
    const t = theme();
    const items = this.values[field.key] ?? [];
    const first = field.item[0];
    const rest = field.item.slice(1);
    const sub = (definition) => {
      const key = `${field.key}:${item._id}:${definition.key}`;
      const error = this.fieldError(key);
      return v_flex()
        .flex_1()
        .min_w(0)
        .gap(3)
        .child(div().text_size(9).text_color(t.dim).child(definition.label.toUpperCase()))
        .child(this.control(definition, this.states.get(key), error))
        .when(Boolean(error), (el) => el.child(div().text_size(9).text_color(t.blocked).child(error)));
    };
    return v_flex()
      .id(`${this.doc}-${field.key}-${item._id}`)
      .flex_none()
      .gap(6)
      .p(9)
      .rounded(8)
      .bg(t.surface)
      .border(1)
      .border_color(t.border)
      .child(
        h_flex()
          .justify_between()
          .items_center()
          .child(div().text_size(10).font_semibold().text_color(t.muted).child(`${field.itemLabel ?? "Item"} ${index + 1}`))
          .when(items.length > (field.min ?? 0), (el) =>
            el.child(
              div()
                .id(`${this.doc}-del-${item._id}`)
                .h(20)
                .px(6)
                .flex()
                .items_center()
                .rounded(4)
                .text_size(10)
                .text_color(t.dim)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover).text_color(t.blocked))
                .on_click((_e, cx) => this.removeItem(field, item._id, cx))
                .child("Remove"),
            ),
          ),
      )
      .child(sub(first))
      .when(rest.length > 0, (el) => el.child(h_flex().gap(6).children(rest.map(sub))));
  }

  listField(field) {
    const t = theme();
    const items = this.values[field.key] ?? [];
    const total = field.sum ? items.reduce((n, item) => n + (this.rawNum(item[field.sum]) ?? 0), 0) : null;
    const sumError = (this.errors ?? []).find((e) => e.key === field.key)?.msg ?? "";
    return v_flex()
      .flex_none()
      .gap(8)
      .child(
        h_flex()
          .justify_between()
          .items_center()
          .child(div().text_size(9.5).font_semibold().text_color(t.dim).child(field.label.toUpperCase()))
          .when(total != null, (el) =>
            el.child(
              div()
                .text_size(9.5)
                .text_color(!this.showErrors || Math.abs(total - (field.sumEquals ?? 100)) < 0.01 ? t.muted : t.blocked)
                .child(`${total}% of ${field.sumEquals ?? 100}%`),
            ),
          ),
      )
      .children(items.map((item, index) => this.itemCard(field, item, index)))
      .child(
        div()
          .id(`${this.doc}-add-${field.key}`)
          .h(26)
          .px(10)
          .flex()
          .items_center()
          .gap(5)
          .rounded(6)
          .border(1)
          .border_color(t.border)
          .text_size(10.5)
          .text_color(t.muted)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => this.addItem(field, cx))
          .child(`+ ${field.add ?? "Add"}`),
      )
      .when(Boolean(sumError) && this.showErrors, (el) => el.child(div().text_size(9.5).text_color(t.blocked).child(sumError)));
  }

  review() {
    const t = theme();
    const rows = summaryRows(this.mode, this.values);
    return v_flex()
      .flex_none()
      .gap(10)
      .child(div().text_size(9.5).font_semibold().text_color(t.dim).child("SUMMARY"))
      .child(
        v_flex()
          .flex_none()
          .rounded(8)
          .bg(t.surface)
          .border(1)
          .border_color(t.border)
          .children(
            rows.map(([label, value]) =>
              h_flex()
                .h(30)
                .px(10)
                .justify_between()
                .items_center()
                .border_b(1)
                .border_color(t.border)
                .child(div().text_size(10.5).text_color(t.muted).child(label))
                .child(div().text_size(11).text_color(t.foreground).child(value)),
            ),
          ),
      )
      .when(this.showErrors && this.errors.length > 0, (el) =>
        el.child(
          v_flex()
            .flex_none()
            .gap(4)
            .p(10)
            .rounded(8)
            .bg(t.surface)
            .border(1)
            .border_color(t.blocked)
            .child(div().text_size(10).font_semibold().text_color(t.blocked).child("FIX BEFORE EXPORTING"))
            .children(this.errors.slice(0, 8).map((error) => div().text_size(10).text_color(t.muted).child(error.msg))),
        ),
      )
      .child(
        h_flex()
          .gap(6)
          .child(this.button("review-export", "Export", (cx) => this.exportDoc(cx), true))
          .child(this.button("review-folder", "Data folder", (_cx) => this.openPath(dataRoot(), _cx))),
      )
      .child(div().text_size(9.5).text_color(t.dim).child("Draft preview only. Review every clause and figure before use."));
  }

  templateBar() {
    if (this.mode !== "deed") return null;
    const t = theme();
    const pill = (name, label) => {
      const on = this.template === name;
      return div()
        .id(`${this.doc}-tpl-${name}`)
        .h(20)
        .px(8)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(9.5)
        .text_color(on ? t.foreground : t.dim)
        .when(on, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .cursor_pointer()
        .on_click((_e, cx) => {
          this.template = name;
          this.save(cx);
          cx.notify();
        })
        .child(label);
    };
    return h_flex()
      .flex_none()
      .h(28)
      .px(12)
      .gap(6)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(div().text_size(9).font_semibold().text_color(t.dim).child("TEMPLATE"))
      .child(pill("default", "Default"))
      .children(
        this.templates.map((name) =>
          pill(name, name.replace(/\.docx$/i, "").slice(0, 22)),
        ),
      )
      .child(div().flex_1())
      .child(div().text_size(9).text_color(t.dim).child("DOCX in data/mrh-desk/templates"));
  }

  renderPreview() {
    const t = theme();
    const html = previewHtml(this.mode, this.values);
    return v_flex()
      .flex_1()
      .min_w(0)
      .h_full()
      .rounded(8)
      .border(1)
      .border_color(t.border)
      .bg(t.background)
      .overflow_hidden()
      .child(
        div()
          .flex_1()
          .overflow_y_scrollbar()
          .p(18)
          .child(
            div()
              .w_full()
              .max_w(640)
              .mx_auto()
              .rounded(6)
              .border(1)
              .border_color(t.border)
              .bg(t.surface)
              .p(24)
              .child(TextView.html(`prev-${this.doc}`, html).selectable(true).w_full()),
          ),
      );
  }

  render() {
    const t = theme();
    this.errors = this.validate();
    const narrow = this.width < 840;
    const step = this.schema.steps[this.step];
    const title = this.docTitle();

    const header = h_flex()
      .flex_none()
      .h(44)
      .px(12)
      .gap(8)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(div().flex_none().max_w(320).truncate().text_size(13.5).font_semibold().text_color(t.foreground).child(title))
      .child(div().flex_none().h(18).px(6).flex().items_center().rounded(4).bg(t.raised).text_size(9.5).text_color(t.muted).child(this.schema.short))
      .child(div().flex_1())
      .when(Boolean(this.busy), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.accent).child(this.busy)))
      .when(narrow, (el) =>
        el.child(
          this.button("toggle", this.showPreview ? "Form" : "Preview", (cx) => {
            this.showPreview = !this.showPreview;
            cx.notify();
          }),
        ),
      )
      .child(this.button("save", "Save", (cx) => this.save(cx, true)))
      .child(this.button("export", "Export", (cx) => this.exportDoc(cx), true))
      .when(this.last.some((path) => /\.(docx|xlsx)$/i.test(path)), (el) =>
        el.child(this.button("pdf", "PDF", (cx) => this.makePdf(cx))),
      )
      .when(this.last.length > 0, (el) => el.child(this.button("open", "Open", (cx) => this.openPath(this.last[this.last.length - 1], cx))));

    const steps = h_flex()
      .flex_none()
      .h(32)
      .px(12)
      .gap(4)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .children(
        this.schema.steps.map((s, i) => {
          const bad = this.showErrors && this.errors.some((e) => e.step === i);
          return div()
            .id(`${this.doc}-step-${i}`)
            .h(24)
            .px(9)
            .flex()
            .items_center()
            .gap(5)
            .rounded(5)
            .text_size(10.5)
            .text_color(i === this.step ? t.foreground : t.dim)
            .when(i === this.step, (el) => el.bg(t.selected))
            .hover((s2) => s2.bg(t.hover))
            .on_click((_e, cx) => {
              this.step = i;
              cx.notify();
            })
            .child(`${i + 1}`)
            .child(s.label)
            .when(bad, (el) => el.child(div().size(5).rounded_full().bg(t.blocked)));
        }),
      );

    const form = v_flex()
      .flex_1()
      .min_w(0)
      .h_full()
      .gap(10)
      .overflow_y_scrollbar()
      .pr(4)
      .child(
        v_flex()
          .flex_none()
          .gap(10)
          .when(this.step < this.schema.steps.length - 1, (el) =>
            el.children(
              step.fields.map((field) =>
                field.type === "list" ? this.listField(field) : this.renderField(field),
              ),
            ),
          )
          .when(this.step === this.schema.steps.length - 1, (el) => el.child(this.review())),
      )
      .child(
        h_flex()
          .flex_none()
          .gap(6)
          .items_center()
          .when(this.step > 0, (el) =>
            el.child(
              this.button("back", "Back", (cx) => {
                this.step = Math.max(0, this.step - 1);
                cx.notify();
              }),
            ),
          )
          .child(div().flex_1())
          .when(this.step < this.schema.steps.length - 1, (el) =>
            el.child(
              this.button(
                "next",
                "Next",
                (cx) => {
                  this.showErrors = true;
                  this.errors = this.validate();
                  const stepErrors = this.errors.filter((e) => e.step === this.step);
                  if (stepErrors.length) {
                    this.error = stepErrors[0].msg;
                  } else {
                    this.step = Math.min(this.schema.steps.length - 1, this.step + 1);
                    this.error = "";
                  }
                  this.save(cx);
                  this.renameTab();
                  cx.notify();
                },
                true,
              ),
            ),
          )
          .when(this.step === this.schema.steps.length - 1, (el) =>
            el.child(this.button("export-2", "Export", (cx) => this.exportDoc(cx), true)),
          ),
      );

    const body = h_flex()
      .flex_1()
      .min_h(0)
      .gap(8)
      .p(10)
      .when(!narrow || !this.showPreview, (el) => el.child(form))
      .when(!narrow || this.showPreview, (el) => el.child(this.renderPreview()));

    const firstError = this.showErrors ? this.errors[0]?.msg ?? this.error : this.error;
    const saved = this.savedAt
      ? `Saved ${String(this.savedAt.getHours()).padStart(2, "0")}:${String(this.savedAt.getMinutes()).padStart(2, "0")}`
      : "Not saved";
    const footer = h_flex()
      .flex_none()
      .h(24)
      .px(12)
      .gap(10)
      .items_center()
      .border_t(1)
      .border_color(t.border)
      .text_size(9.5)
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_color(firstError ? t.blocked : t.muted)
          .child(firstError || (this.showErrors ? "Ready" : "Draft")),
      )
      .child(div().flex_none().text_color(t.dim).child(saved))
      .child(div().flex_none().text_color(t.dim).child(this.template === "default" ? "Default template" : this.template));

    return v_flex()
      .id(`desk-${this.doc}`)
      .size_full()
      .bg(t.background)
      .on_size_change((size, cx) => {
        const was = this.width < 840;
        this.width = size.width;
        if (was !== (size.width < 840)) cx.notify();
      })
      .child(header)
      .child(steps)
      .when(this.mode === "deed", (el) => el.child(this.templateBar()))
      .child(body)
      .child(footer);
  }
}
