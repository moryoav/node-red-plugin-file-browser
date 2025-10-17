// ---------- Admin ajax ----------
function ajax(method, url, data) {
  return $.ajax({
    method,
    url,
    data: data ? JSON.stringify(data) : undefined,
    contentType: data ? "application/json" : undefined,
    headers: { "Node-RED-API-Version": "v2" },
    xhrFields: { withCredentials: true }
  });
}
