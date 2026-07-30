export const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

export function normaliseName(name = "") {
  return String(name).trim().toLowerCase().replace(/\s+/g, " ");
}

export function clientDisplayName(client) {
  return [client?.name, client?.suburb].filter(Boolean).join(" - ");
}

export function supportsClientIdsIn(records = []) {
  return records.some(record => hasOwn(record, "client_id"));
}

export function findClientForRecord(record, clients = []) {
  if (!record) return null;
  if (record.client_id) {
    const byId = clients.find(client => client.id === record.client_id);
    if (byId) return byId;
  }
  const recordName = normaliseName(record.client || record.client_name || record.referrer_name);
  if (!recordName) return null;
  return clients.find(client => normaliseName(client.name) === recordName) || null;
}

export function clientIdForName(name, clients = []) {
  return findClientForRecord({ client: name }, clients)?.id || null;
}

export function recordBelongsToClient(record, client) {
  if (!record || !client) return false;
  if (record.client_id && record.client_id === client.id) return true;
  return normaliseName(record.client || record.client_name || record.referrer_name) === normaliseName(client.name);
}

export function withClientLink(record, client, supportsClientIds = false, nameField = "client") {
  if (!client) return record;
  return {
    ...record,
    [nameField]: record[nameField] || client.name,
    ...(supportsClientIds ? { client_id: client.id } : {}),
  };
}

export function buildClientActivity(client, { jobs = [], quotes = [], invoices = [], recurringJobs = [], messages = [], documents = [] }) {
  const activities = [];
  jobs.filter(job => recordBelongsToClient(job, client)).forEach(job => {
    activities.push({
      type: "Job",
      date: job.completionDate || job.completion_date || job.created_at || "",
      title: `${job.status || "Job"}: ${job.service || "Service"}`,
      amount: job.revenue,
      record: job,
    });
  });
  quotes.filter(quote => recordBelongsToClient(quote, client)).forEach(quote => {
    activities.push({
      type: "Quote",
      date: quote.date || quote.created_at || "",
      title: `${quote.status || "Quote"} quote ${quote.id}`,
      amount: quote.total,
      record: quote,
    });
  });
  invoices.filter(invoice => recordBelongsToClient(invoice, client)).forEach(invoice => {
    activities.push({
      type: invoice.status === "paid" ? "Receipt" : "Invoice",
      date: invoice.date || invoice.created_at || "",
      title: `${invoice.status || "Invoice"} ${invoice.id}`,
      amount: invoice.total,
      record: invoice,
    });
  });
  recurringJobs.filter(job => recordBelongsToClient(job, client)).forEach(job => {
    activities.push({
      type: "Recurring",
      date: job.next_date || job.created_at || "",
      title: `${job.active === false ? "Paused" : "Active"} recurring ${job.service || "service"}`,
      amount: job.revenue,
      record: job,
    });
  });
  messages.filter(message => recordBelongsToClient(message, client)).forEach(message => {
    activities.push({
      type: "Message",
      date: message.created_at || "",
      title: `${message.sender === "client" ? "Client" : "Simon"}: ${(message.text || "").slice(0, 80)}`,
      record: message,
    });
  });
  documents.filter(document => recordBelongsToClient(document, client)).forEach(document => {
    activities.push({
      type: "File",
      date: document.uploaded_at || document.created_at || "",
      title: document.file_name || "Document uploaded",
      record: document,
    });
  });
  return activities.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
