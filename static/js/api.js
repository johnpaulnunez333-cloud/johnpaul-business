const h = React.createElement;

const money = (n) =>
  "₱" +
  Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const Notice = ({ type, text }) =>
  h("div", { className: "alert alert-" + type + " mt-3 mb-0", role: "alert" }, text);

const Thumb = ({ src, alt }) =>
  src
    ? h("img", { src, alt: alt || "", className: "thumb", loading: "lazy" })
    : h("div", { className: "thumb" });

const api = (() => {
  let csrf = null;

  async function token() {
    if (!csrf) {
      const res = await fetch("/api/csrf", { credentials: "same-origin" });
      csrf = (await res.json()).token;
    }
    return csrf;
  }

  async function request(method, url, body, isForm) {
    const headers = {};
    if (method !== "GET") headers["X-CSRF-Token"] = await token();
    let payload;
    if (body !== undefined && !isForm) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    } else {
      payload = body;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      credentials: "same-origin",
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      if (res.status === 403) csrf = null;
      if (res.status === 401 && url !== "/api/admin/login") {
        window.dispatchEvent(new Event("auth-expired"));
      }
      throw new Error((data && data.error) || "Request failed.");
    }
    return data;
  }

  return {
    get: (url) => request("GET", url),
    post: (url, body) => request("POST", url, body),
    put: (url, body) => request("PUT", url, body),
    del: (url) => request("DELETE", url),
    upload: (url, form) => request("POST", url, form, true),
    reset: () => {
      csrf = null;
    },
  };
})();
