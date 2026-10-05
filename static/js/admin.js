const { useState, useEffect } = React;

const BLANK = { id: null, name: "", description: "", price: "", stock: "", image_url: "", active: true };

function Field({ label, id, ...props }) {
  return h(
    "div",
    { className: "mb-3" },
    h("label", { className: "form-label", htmlFor: id }, label),
    h("input", { id, className: "form-control", ...props })
  );
}

function Login({ onDone }) {
  const [f, setF] = useState({ username: "", password: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/admin/login", f);
      api.reset();
      onDone();
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
      setBusy(false);
    }
  };

  return h(
    "form",
    { className: "panel p-4 login-box view-enter", onSubmit: submit },
    h("h1", { className: "h3 mb-4" }, "Admin sign in"),
    h(Field, { label: "Username", id: "u", value: f.username, autoComplete: "username", maxLength: 100, onChange: (e) => setF({ ...f, username: e.target.value }) }),
    h(Field, { label: "Password", id: "pw", type: "password", value: f.password, autoComplete: "current-password", maxLength: 200, onChange: (e) => setF({ ...f, password: e.target.value }) }),
    h("button", { className: "btn btn-accent w-100", disabled: busy }, busy ? "Signing in..." : "Sign in"),
    msg && h(Notice, msg)
  );
}

function Dashboard() {
  const [s, setS] = useState(null);

  useEffect(() => {
    api.get("/api/admin/stats").then(setS).catch(() => {});
  }, []);

  if (!s) return h("div", { className: "spinner-border text-warning" });

  const cards = [
    ["Revenue", money(s.revenue)],
    ["Waiting for payment", s.orders.pending],
    ["Ready to ship", s.orders.paid],
    ["Shipped", s.orders.shipped],
    ["Completed", s.orders.completed],
    ["Products", s.products],
    ["Low stock", s.low_stock],
  ];

  return h(
    "div",
    { className: "row g-3 view-enter" },
    cards.map(([label, value]) =>
      h("div", { key: label, className: "col-6 col-md-4" }, h("div", { className: "panel stat" }, h("div", { className: "text-secondary small" }, label), h("div", { className: "n" }, value)))
    )
  );
}

function Products() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get("/api/admin/products").then(setList).catch((e) => setMsg({ type: "danger", text: e.message }));

  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      let image_url = form.image_url;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        image_url = (await api.upload("/api/admin/upload", fd)).url;
      }
      const body = { ...form, image_url };
      if (form.id) await api.put("/api/admin/products/" + form.id, body);
      else await api.post("/api/admin/products", body);
      setForm(null);
      setFile(null);
      load();
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
    }
    setBusy(false);
  };

  const remove = async (p) => {
    if (!window.confirm("Delete " + p.name + "?")) return;
    try {
      await api.del("/api/admin/products/" + p.id);
      load();
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
    }
  };

  const toggle = async (p) => {
    try {
      await api.put("/api/admin/products/" + p.id, { ...p, active: !p.active });
      load();
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
    }
  };

  if (form) {
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    return h(
      "form",
      { className: "panel p-4 view-enter", onSubmit: save },
      h("h2", { className: "h4 mb-3" }, form.id ? "Edit product" : "New product"),
      h(Field, { label: "Name", id: "pn", value: form.name, maxLength: 120, required: true, onChange: set("name") }),
      h("div", { className: "mb-3" }, h("label", { className: "form-label", htmlFor: "pd" }, "Description"), h("textarea", { id: "pd", className: "form-control", rows: 3, maxLength: 1000, value: form.description, onChange: set("description") })),
      h("div", { className: "row" }, h("div", { className: "col-6" }, h(Field, { label: "Price (PHP)", id: "pp", type: "number", min: 0, step: "0.01", required: true, value: form.price, onChange: set("price") })), h("div", { className: "col-6" }, h(Field, { label: "Stock", id: "ps", type: "number", min: 0, step: "1", required: true, value: form.stock, onChange: set("stock") }))),
      h("div", { className: "mb-3" }, h("label", { className: "form-label", htmlFor: "pi" }, "Image (JPG, PNG, or WEBP)"), form.image_url && h("div", { className: "mb-2" }, h(Thumb, { src: form.image_url })), h("input", { id: "pi", type: "file", className: "form-control", accept: "image/png,image/jpeg,image/webp", onChange: (e) => setFile(e.target.files[0] || null) })),
      h("div", { className: "form-check form-switch mb-3" }, h("input", { id: "pa", type: "checkbox", className: "form-check-input", checked: form.active, onChange: (e) => setForm({ ...form, active: e.target.checked }) }), h("label", { className: "form-check-label", htmlFor: "pa" }, "Show in shop")),
      h("div", { className: "d-flex gap-2" }, h("button", { className: "btn btn-accent", disabled: busy }, busy ? "Saving..." : "Save product"), h("button", { type: "button", className: "btn btn-outline-light", onClick: () => { setForm(null); setFile(null); setMsg(null); } }, "Cancel")),
      msg && h(Notice, msg)
    );
  }

  return h(
    "div",
    { className: "view-enter" },
    h("button", { className: "btn btn-accent mb-3", onClick: () => setForm({ ...BLANK }) }, "Add product"),
    msg && h(Notice, msg),
    !list.length && h("p", { className: "text-secondary" }, "No products yet. Add your first product to start selling."),
    list.map((p) =>
      h(
        "div",
        { key: p.id, className: "panel p-3 mb-2 d-flex align-items-center gap-3 flex-wrap" },
        h(Thumb, { src: p.image_url, alt: p.name }),
        h("div", { className: "flex-grow-1" }, h("div", { className: "fw-semibold" }, p.name), h("small", { className: "text-secondary" }, money(p.price) + " | " + p.stock + " in stock | " + (p.active ? "Visible" : "Hidden"))),
        h("button", { className: "btn btn-sm btn-outline-light", onClick: () => toggle(p) }, p.active ? "Hide" : "Show"),
        h("button", { className: "btn btn-sm btn-outline-light", onClick: () => setForm({ ...p }) }, "Edit"),
        h("button", { className: "btn btn-sm btn-outline-danger", onClick: () => remove(p) }, "Delete")
      )
    )
  );
}

function Orders() {
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () =>
    api.get("/api/admin/orders").then(setList).catch((e) => setMsg({ type: "danger", text: e.message }));

  useEffect(() => {
    load();
  }, []);

  const change = async (o, status) => {
    if (status === "cancelled" && !window.confirm("Cancel this order and restore its stock?")) return;
    try {
      await api.put("/api/admin/orders/" + o.id, { status });
      load();
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
    }
  };

  if (!list) return h("div", { className: "spinner-border text-warning" });

  return h(
    "div",
    { className: "view-enter" },
    msg && h(Notice, msg),
    !list.length && h("p", { className: "text-secondary" }, "No orders yet. New orders will show up here."),
    list.map((o) =>
      h(
        "div",
        { key: o.id, className: "panel p-3 mb-3" },
        h("div", { className: "d-flex justify-content-between align-items-center flex-wrap gap-2" }, h("strong", null, o.code), h("span", { className: "status " + o.status }, LABELS[o.status])),
        h("div", { className: "small text-secondary" }, new Date(o.created_at).toLocaleString()),
        h("div", { className: "mt-2" }, o.name + " | " + o.phone),
        h("div", { className: "small" }, o.address),
        h("div", { className: "mt-2 small" }, o.items.map((i, k) => h("div", { key: k }, i.qty + " x " + i.name))),
        h("div", { className: "fw-bold mt-2" }, money(o.total)),
        o.proof_url ? h("a", { href: o.proof_url, target: "_blank", rel: "noopener noreferrer", className: "d-inline-block mt-2" }, "View payment proof") : h("div", { className: "small text-secondary mt-2" }, "No payment proof yet"),
        o.next.length > 0 && h("div", { className: "d-flex gap-2 mt-3 flex-wrap" }, o.next.map((s) => h("button", { key: s, className: "btn btn-sm " + (s === "cancelled" ? "btn-outline-danger" : "btn-accent"), onClick: () => change(o, s) }, "Mark as " + LABELS[s].toLowerCase())))
      )
    )
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/settings").then(setS).catch((e) => setMsg({ type: "danger", text: e.message }));
  }, []);

  if (!s) return h("div", { className: "spinner-border text-warning" });

  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      let qr_url = s.qr_url;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        qr_url = (await api.upload("/api/admin/upload", fd)).url;
      }
      setS(await api.put("/api/admin/settings", { ...s, qr_url }));
      setFile(null);
      setMsg({ type: "success", text: "Settings saved." });
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
    }
    setBusy(false);
  };

  return h(
    "form",
    { className: "panel p-4 view-enter", onSubmit: save },
    h("h2", { className: "h4 mb-3" }, "Shop and payment settings"),
    h(Field, { label: "Shop name", id: "sn", value: s.shop_name, maxLength: 100, onChange: set("shop_name") }),
    h(Field, { label: "Maya account name", id: "mn", value: s.maya_name, maxLength: 100, onChange: set("maya_name") }),
    h(Field, { label: "Maya number", id: "mm", value: s.maya_number, maxLength: 100, inputMode: "tel", onChange: set("maya_number") }),
    h("div", { className: "mb-3" }, h("label", { className: "form-label", htmlFor: "mq" }, "Maya QR code image"), s.qr_url && h("img", { src: s.qr_url, alt: "Current Maya QR code", className: "qr" }), h("input", { id: "mq", type: "file", className: "form-control", accept: "image/png,image/jpeg,image/webp", onChange: (e) => setFile(e.target.files[0] || null) })),
    h("button", { className: "btn btn-accent", disabled: busy }, busy ? "Saving..." : "Save settings"),
    msg && h(Notice, msg)
  );
}

function Panel({ onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const tabs = [["dashboard", "Dashboard"], ["orders", "Orders"], ["products", "Products"], ["settings", "Settings"]];
  const pages = { dashboard: Dashboard, orders: Orders, products: Products, settings: Settings };

  return h(
    React.Fragment,
    null,
    h(
      "nav",
      { className: "navbar navbar-glass sticky-top" },
      h("div", { className: "container d-flex flex-wrap gap-2" }, h("span", { className: "brand fs-5" }, "Admin"), h("div", { className: "d-flex gap-1 flex-wrap" }, tabs.map(([k, l]) => h("button", { key: k, className: "btn btn-sm " + (tab === k ? "btn-accent" : "btn-outline-light"), onClick: () => setTab(k) }, l)), h("button", { className: "btn btn-sm btn-outline-danger", onClick: onLogout }, "Sign out")))
    ),
    h("main", { className: "container py-4", style: { maxWidth: 860 } }, h(pages[tab], { key: tab }))
  );
}

function App() {
  const [state, setState] = useState("loading");

  useEffect(() => {
    api.get("/api/admin/me").then(() => setState("panel")).catch(() => setState("login"));
    const expired = () => setState("login");
    window.addEventListener("auth-expired", expired);
    return () => window.removeEventListener("auth-expired", expired);
  }, []);

  const logout = async () => {
    try {
      await api.post("/api/admin/logout");
    } catch (e) {
      setState("login");
    }
    api.reset();
    setState("login");
  };

  if (state === "loading") return h("div", { className: "text-center py-5" }, h("div", { className: "spinner-border text-warning" }));
  if (state === "login") return h("div", { className: "container px-3" }, h(Login, { onDone: () => setState("panel") }));
  return h(Panel, { onLogout: logout });
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
