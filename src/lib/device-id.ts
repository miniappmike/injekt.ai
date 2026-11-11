/** A random id this browser keeps, sent with orders so the first-month bonus can't be claimed twice from one device. */
export function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem("ms.deviceId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ms.deviceId", id);
    }
    return id;
  } catch {
    return undefined;
  }
}
