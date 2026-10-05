const { useState, useEffect } = React;

const LABELS = {
  pending: "Waiting for payment",
  paid: "Payment confirmed",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};
const STEPS = ["pending", "paid", "shipped", "completed"];

function useCart() {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cart")) || [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(items));
    } catch (e) {
      return;
    }
  }, [items]);

  const add = (p) =>
    setItems((cur) => {
      const found = cur.find((i) => i.id === p.id);
      if (found) {
        return cur.map((i) =>
          i.id === p.id ? { ...i, stock: p.stock, qty: Math.min(i.qty + 1, p.stock) } : i
        );
      }
      return [
        ...cur,
        { id: p.id, name: p.name, price: p.price, image_url: p.image_url, stock: p.stock, qty: 1 },
      ];
    });

  const setQty = (id, qty) =>
    setItems((cur) =>
      cur.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(qty, i.stock)) } : i))
    );

  const remove = (id) => setItems((cur) => cur.filter((i) => i.id !== id));
  const clear = () => setItems([]);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  return { items, add, setQty, remove, clear, count, total };
}

function Navbar({ setView, count, brand }) {
  return h(
    "nav",
    { className: "navbar navbar-glass sticky-top" },
    h(
      "div",
      { className: "container" },
      h("button", { className: "btn brand fs-4 p-0 border-0", onClick: () => setView("shop") }, brand),
      h(
        "div",
        { className: "d-flex gap-2" },
        h("button", { className: "btn btn-sm btn-outline-light", onClick: () => setView("track") }, "Track order"),
        h(
          "button",
          { className: "btn btn-sm btn-accent", onClick: () => setView("cart") },
          "Cart",
          count > 0 &&
            h("span", { key: count, className: "badge rounded-pill bg-dark ms-2 badge-bump" }, count)
        )
      )
    )
  );
}

function Shop({ products, error, cart, brand }) {
  const [added, setAdded] = useState(null);

  const onAdd = (p) => {
    cart.add(p);
    setAdded(p.id);
    setTimeout(() => setAdded(null), 900);
  };

  let body;
  if (error) body = h(Notice, { type: "danger", text: error });
  else if (!products)
    body = h("div", { className: "text-center py-5" }, h("div", { className: "spinner-border text-warning" }));
  else if (!products.length)
    body = h("p", { className: "text-center text-secondary py-5" }, "No products are available yet. Check back soon.");
  else
    body = h(
      "div",
      { className: "row g-3 g-md-4" },
      products.map((p, idx) =>
        h(
          "div",
          { key: p.id, className: "col-6 col-md-4 col-lg-3" },
          h(
            "article",
            { className: "product-card", style: { animationDelay: Math.min(idx, 12) * 60 + "ms" } },
            p.image_url
              ? h("img", { src: p.image_url, alt: p.name, className: "pic", loading: "lazy" })
              : h("div", { className: "pic" }),
            h(
              "div",
              { className: "p-3 d-flex flex-column flex-grow-1" },
              h("h2", { className: "h6 mb-1" }, p.name),
              h("p", { className: "small text-secondary flex-grow-1" }, p.description),
              h("div", { className: "price mb-1" }, money(p.price)),
              h("small", { className: "text-secondary mb-2" }, p.stock > 0 ? p.stock + " in stock" : "Out of stock"),
              h(
                "button",
                { className: "btn btn-accent btn-sm", disabled: p.stock < 1, onClick: () => onAdd(p) },
                added === p.id ? "Added" : "Add to cart"
              )
            )
          )
        )
      )
    );

  return h(
    "div",
    null,
    h(
      "header",
      { className: "hero" },
      h("span", { className: "blob b1" }),
      h("span", { className: "blob b2" }),
      h(
        "div",
        { className: "container inner" },
        h("h1", null, "Welcome to " + brand),
        h("p", null, "Pick your items, pay with Maya, and track your order with one code.")
      )
    ),
    h("main", { className: "container py-4" }, body)
  );
}

function Cart({ cart, setView }) {
  if (!cart.items.length) {
    return h(
      "div",
      { className: "container py-5 text-center view-enter" },
      h("h2", null, "Your cart is empty"),
      h("button", { className: "btn btn-accent mt-3", onClick: () => setView("shop") }, "Browse products")
    );
  }
  return h(
    "div",
    { className: "container py-4 view-enter", style: { maxWidth: 720 } },
    h("h2", { className: "mb-3" }, "Your cart"),
    cart.items.map((i) =>
      h(
        "div",
        { key: i.id, className: "panel p-3 mb-2 d-flex align-items-center gap-3" },
        h(Thumb, { src: i.image_url, alt: i.name }),
        h(
          "div",
          { className: "flex-grow-1" },
          h("div", { className: "fw-semibold" }, i.name),
          h("small", { className: "text-secondary" }, money(i.price))
        ),
        h("input", {
          type: "number",
          min: 1,
          max: i.stock,
          value: i.qty,
          "aria-label": "Quantity for " + i.name,
          className: "form-control form-control-sm qty",
          onChange: (e) => cart.setQty(i.id, parseInt(e.target.value, 10) || 1),
        }),
        h("button", { className: "btn btn-sm btn-outline-danger", onClick: () => cart.remove(i.id) }, "Remove")
      )
    ),
    h(
      "div",
      { className: "d-flex justify-content-between align-items-center mt-3" },
      h("h3", { className: "h4 mb-0" }, "Total: ", money(cart.total)),
      h("button", { className: "btn btn-accent", onClick: () => setView("checkout") }, "Continue to checkout")
    )
  );
}

function Checkout({ cart, onOrdered, setView }) {
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!cart.items.length) return h(Cart, { cart, setView });

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const result = await api.post("/api/orders", {
        ...f,
        items: cart.items.map((i) => ({ id: i.id, qty: i.qty })),
      });
      onOrdered(result);
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
      setBusy(false);
    }
  };

  return h(
    "div",
    { className: "container py-4 view-enter", style: { maxWidth: 560 } },
    h(
      "form",
      { className: "panel p-4", onSubmit: submit, noValidate: true },
      h("h2", { className: "mb-3" }, "Delivery details"),
      h("label", { className: "form-label", htmlFor: "n" }, "Full name"),
      h("input", { id: "n", className: "form-control mb-3", maxLength: 80, required: true, value: f.name, onChange: set("name"), autoComplete: "name" }),
      h("label", { className: "form-label", htmlFor: "p" }, "Mobile number"),
      h("input", { id: "p", className: "form-control mb-3", placeholder: "09XXXXXXXXX", maxLength: 16, required: true, value: f.phone, onChange: set("phone"), autoComplete: "tel", inputMode: "tel" }),
      h("label", { className: "form-label", htmlFor: "a" }, "Complete address"),
      h("textarea", { id: "a", className: "form-control mb-3", rows: 3, maxLength: 250, required: true, value: f.address, onChange: set("address"), autoComplete: "street-address" }),
      h("div", { className: "d-flex justify-content-between mb-3" }, h("span", null, "Total"), h("strong", { className: "price" }, money(cart.total))),
      h("button", { className: "btn btn-accent w-100", disabled: busy }, busy ? "Placing order..." : "Place order"),
      msg && h(Notice, msg)
    )
  );
}

function ProofUpload({ code, onDone }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const send = async () => {
    if (!file) {
      setMsg({ type: "warning", text: "Choose a screenshot first." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.upload("/api/orders/" + code + "/proof", fd);
      setMsg({ type: "success", text: "Proof uploaded. We will confirm your payment soon." });
      if (onDone) onDone();
    } catch (err) {
      setMsg({ type: "danger", text: err.message });
    }
    setBusy(false);
  };

  return h(
    "div",
    { className: "mt-3" },
    h("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/webp",
      className: "form-control mb-2",
      "aria-label": "Payment screenshot",
      onChange: (e) => setFile(e.target.files[0] || null),
    }),
    h("button", { className: "btn btn-accent w-100", disabled: busy, onClick: send }, busy ? "Uploading..." : "Upload payment proof"),
    msg && h(Notice, msg)
  );
}

function Pay({ order, settings, setView }) {
  return h(
    "div",
    { className: "container py-4 view-enter", style: { maxWidth: 560 } },
    h(
      "div",
      { className: "panel p-4 text-center" },
      h("h2", null, "Complete your payment"),
      h("p", { className: "text-secondary" }, "Your order code is ", h("strong", { className: "text-warning" }, order.code), ". Save it to track your order."),
      h("div", { className: "amount" }, money(order.total)),
      settings.qr_url && h("img", { src: settings.qr_url, alt: "Maya QR code", className: "qr" }),
      settings.maya_number && h("p", { className: "mb-0" }, "Maya number: ", h("strong", null, settings.maya_number)),
      settings.maya_name && h("p", null, "Account name: ", h("strong", null, settings.maya_name)),
      h("p", { className: "small text-secondary" }, "Send the exact amount, then upload a screenshot of your payment."),
      h(ProofUpload, { code: order.code }),
      h("button", { className: "btn btn-link text-secondary mt-2", onClick: () => setView("shop") }, "Back to shop")
    )
  );
}

function Track({ start }) {
  const [code, setCode] = useState(start || "");
  const [order, setOrder] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const look = async (value) => {
    setBusy(true);
    setMsg(null);
    try {
      setOrder(await api.get("/api/orders/" + encodeURIComponent(value.trim())));
    } catch (err) {
      setOrder(null);
      setMsg({ type: "danger", text: err.message });
    }
    setBusy(false);
  };

  useEffect(() => {
    if (start) look(start);
  }, []);

  const idx = order ? STEPS.indexOf(order.status) : -1;

  return h(
    "div",
    { className: "container py-4 view-enter", style: { maxWidth: 560 } },
    h(
      "div",
      { className: "panel p-4" },
      h("h2", { className: "mb-3" }, "Track your order"),
      h(
        "form",
        { className: "d-flex gap-2", onSubmit: (e) => { e.preventDefault(); look(code); } },
        h("input", { className: "form-control", placeholder: "Order code", maxLength: 16, value: code, "aria-label": "Order code", onChange: (e) => setCode(e.target.value) }),
        h("button", { className: "btn btn-accent", disabled: busy || !code.trim() }, "Check")
      ),
      msg && h(Notice, msg),
      order &&
        h(
          "div",
          { className: "mt-4" },
          h("div", { className: "d-flex justify-content-between align-items-center" }, h("strong", null, order.code), h("span", { className: "status " + order.status }, LABELS[order.status])),
          order.status !== "cancelled" &&
            h("div", { className: "steps" }, STEPS.map((s, i) => h("div", { key: s, className: "step" + (i <= idx ? " done" : "") }, h("span", { className: "dot" }), h("small", null, LABELS[s])))),
          order.items.map((i, k) => h("div", { key: k, className: "d-flex justify-content-between small py-1" }, h("span", null, i.qty + " x " + i.name), h("span", null, money(i.qty * i.price)))),
          h("div", { className: "d-flex justify-content-between fw-bold border-top pt-2 mt-2" }, h("span", null, "Total"), h("span", null, money(order.total))),
          order.status === "pending" && !order.has_proof && h(ProofUpload, { code: order.code, onDone: () => look(order.code) })
        )
    )
  );
}

function App() {
  const cart = useCart();
  const [view, setView] = useState("shop");
  const [products, setProducts] = useState(null);
  const [settings, setSettings] = useState({});
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  const loadProducts = () =>
    api.get("/api/products").then(setProducts).catch((e) => setError(e.message));

  useEffect(() => {
    loadProducts();
    api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const brand = settings.shop_name || "Our Shop";

  useEffect(() => {
    document.title = brand;
    window.scrollTo(0, 0);
  }, [brand, view]);

  const onOrdered = (result) => {
    setOrder(result);
    cart.clear();
    setView("pay");
    loadProducts();
  };

  let page;
  if (view === "cart") page = h(Cart, { cart, setView });
  else if (view === "checkout") page = h(Checkout, { cart, onOrdered, setView });
  else if (view === "pay" && order) page = h(Pay, { order, settings, setView });
  else if (view === "track") page = h(Track, { start: order ? order.code : "" });
  else page = h(Shop, { products, error, cart, brand });

  return h(
    React.Fragment,
    null,
    h(Navbar, { setView, count: cart.count, brand }),
    page,
    h("footer", { className: "text-center text-secondary small py-4" }, "© " + new Date().getFullYear() + " " + brand)
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
