// Documents saved for the shown space. Click one to focus its tab or open it.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, theme, run, appHome } from "herdr";
import * as fs from "fs/promises";

const root = () => appHome().replace(/\\/g, "/") + "/data/mrh-desk/docs";

const titleOf = (mode, values) => {
  if (mode === "projection") return values.client ? `Projection · ${values.client}` : "Untitled projection";
  if (mode === "provision") return values.entity ? `Provision · ${values.entity}` : "Untitled provision";
  return values.firm || "Untitled deed";
};

const shortOf = (mode) => (mode === "projection" ? "Proj" : mode === "provision" ? "Prov" : "Deed");

export default class MrhDocs extends View {
  init(_props, cx) {
    this.items = [];
    this.space = null;
    this.load(cx);
    cx.timer.every(4000, (cx) => this.load(cx));
  }

  load(cx) {
    const space = spaces().find((s) => s.active);
    if (!space?.id) {
      this.items = [];
      return;
    }
    const id = space.id;
    cx.spawn(async (cx2) => {
      try {
        const entries = await fs.readdir(`${root()}/${id}`, { withFileTypes: true });
        const items = [];
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          try {
            const text = await fs.readFile(`${root()}/${id}/${entry.name}/spec.json`, "utf8");
            const spec = JSON.parse(text);
            const values = spec.values ?? {};
            items.push({
              doc: entry.name,
              mode: spec.mode ?? "deed",
              title: titleOf(spec.mode, values),
              updated: spec.updated ?? "",
            });
          } catch {}
        }
        items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
        this.items = items.slice(0, 40);
        this.space = id;
        cx2.notify();
      } catch {
        this.items = [];
        this.space = id;
        cx2.notify();
      }
    });
  }

  open(item) {
    const space = spaces().find((s) => s.active);
    if (!space) return;
    const open = (space.tabs ?? []).find((tab) => tab.name === item.title);
    if (open) {
      run("tab.select", { id: open.id });
      return;
    }
    run("tab.new", {
      name: item.title,
      space: space.id,
      mod: "mrh-desk",
      props: { doc: item.doc, mode: item.mode, space: space.id },
    });
  }

  render(cx) {
    const t = theme();
    const space = spaces().find((s) => s.active);
    if (space?.id && space.id !== this.space) this.load(cx);
    return v_flex()
      .size_full()
      .bg(t.chrome)
      .child(
        h_flex()
          .h(34)
          .px(12)
          .justify_between()
          .items_center()
          .child(div().text_size(10).font_semibold().text_color(t.dim).child("DOCUMENTS"))
          .child(div().text_size(9.5).text_color(t.dim).child(String(this.items.length))),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .px(8)
          .pb(8)
          .gap(1)
          .when(this.items.length === 0, (el) =>
            el.child(div().px(4).py(8).text_size(10.5).text_color(t.dim).child("No documents in this space.")),
          )
          .children(
            this.items.map((item) =>
              h_flex()
                .id(`doc-${item.doc}`)
                .h(30)
                .px(8)
                .gap(7)
                .items_center()
                .rounded(6)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover))
                .on_click(() => this.open(item))
                .child(
                  div()
                    .size(6)
                    .flex_none()
                    .rounded_full()
                    .bg(item.mode === "deed" ? t.ansi6 : item.mode === "projection" ? t.ansi4 : t.ansi3),
                )
                .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.foreground).child(item.title))
                .child(div().flex_none().text_size(9).text_color(t.dim).child(shortOf(item.mode))),
            ),
          ),
      );
  }
}
