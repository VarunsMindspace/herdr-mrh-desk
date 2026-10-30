// MRH Desk's window bar: monogram, matter, document type, New, terminal,
// data folder, settings and the window buttons.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, run, window, exec, appHome } from "herdr";
import * as fs from "fs/promises";

const MODES = [
  { id: "deed", label: "Deed" },
  { id: "projection", label: "Projection" },
  { id: "provision", label: "Provision" },
];

const dataRoot = () => appHome().replace(/\\/g, "/") + "/data/mrh-desk";
const newId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

export default class MrhTopbar extends View {
  init() {
    this.mode = localStorage.getItem("mrh.mode") ?? "deed";
  }

  button(t, id, child, action) {
    return div()
      .id(id)
      .size(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action)
      .child(child);
  }

  icon(name, size) {
    return svg(`mods/mrh-topbar/${name}.svg`).size(size);
  }

  newDoc() {
    const space = spaces().find((s) => s.active);
    const mode = this.mode;
    const label = MODES.find((m) => m.id === mode)?.label ?? "Document";
    run("tab.new", {
      name: label,
      space: space?.id,
      mod: "mrh-desk",
      props: { doc: newId(), mode, space: space?.id ?? null },
    });
  }

  async openData() {
    const path = dataRoot();
    try {
      await fs.mkdir(path, { recursive: true });
    } catch {}
    const w = window();
    try {
      if (w?.platform === "windows") await exec("explorer", [path]);
      else if (w?.platform === "macos") await exec("open", [path]);
      else await exec("xdg-open", [path]);
    } catch {}
  }

  render() {
    const t = theme();
    const w = window();
    const space = spaces().find((s) => s.active);
    const mac = w?.platform === "macos";
    return h_flex()
      .size_full()
      .bg(t.chrome)
      .pl(mac ? 78 : 12)
      .pr(8)
      .gap(10)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .flex_none()
          .gap(8)
          .items_center()
          .child(
            div()
              .size(24)
              .rounded(6)
              .bg(t.accent)
              .flex()
              .items_center()
              .justify_center()
              .child(div().text_size(13).font_semibold().text_color(t.accent_foreground).child("M")),
          )
          .child(div().text_size(12.5).font_semibold().text_color(t.foreground).child("MRH")),
      )
      .child(div().w(1).h(18).flex_none().bg(t.border))
      .child(
        h_flex()
          .flex_none()
          .min_w(0)
          .max_w(230)
          .gap(6)
          .items_center()
          .child(div().size(6).flex_none().rounded_full().bg(space?.status ? t[space.status] : t.dim))
          .child(div().text_size(11.5).text_color(t.muted).truncate().child(space?.name ?? "No space")),
      )
      .child(div().w(1).h(18).flex_none().bg(t.border))
      .child(
        h_flex()
          .flex_none()
          .gap(2)
          .items_center()
          .children(
            MODES.map((m) => {
              const on = this.mode === m.id;
              return div()
                .id(`mode-${m.id}`)
                .h(26)
                .px(10)
                .flex()
                .items_center()
                .rounded(6)
                .text_size(11.5)
                .text_color(on ? t.accent_foreground : t.muted)
                .when(on, (el) => el.bg(t.accent))
                .when(!on, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
                .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                .on_click((_e, cx) => {
                  this.mode = m.id;
                  localStorage.setItem("mrh.mode", m.id);
                  cx.notify();
                })
                .child(m.label);
            }),
          ),
      )
      .child(div().flex_1())
      .child(
        div()
          .id("new-doc")
          .h(26)
          .px(12)
          .flex()
          .items_center()
          .rounded(6)
          .bg(t.accent)
          .text_color(t.accent_foreground)
          .text_size(11.5)
          .font_semibold()
          .cursor_pointer()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => this.newDoc())
          .child("New"),
      )
      .child(this.button(t, "new-term", this.icon("terminal", 15), () => run("tab.new", { name: "Terminal" })))
      .child(this.button(t, "open-data", this.icon("folder", 15), () => this.openData()))
      .child(this.button(t, "settings", this.icon("gear", 15), () => run("app.settings")))
      .when(Boolean(w?.buttons), (el) =>
        el.child(
          h_flex()
            .flex_none()
            .gap(1)
            .items_center()
            .child(this.button(t, "win-min", this.icon("win-min", 15), () => run("window.minimize")))
            .child(this.button(t, "win-max", this.icon(w.maximized ? "win-restore" : "win-max", 15), () => run("window.maximize")))
            .child(this.button(t, "win-close", this.icon("win-close", 15), () => run("window.close"))),
        ),
      );
  }
}
